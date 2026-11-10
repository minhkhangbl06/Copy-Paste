import argparse
import getpass

from flask import Flask, abort
from werkzeug.exceptions import HTTPException

from .auth import PASSWORDS, record_audit, validate_email, validate_full_name, validate_password
from .db import close_db, db, execute, one

STAFF_ROLES = ("ADMIN", "RECEPTIONIST", "HOUSEKEEPING", "SERVICE_STAFF")


def create_user(role, email, name, password):
    user_id, _ = execute(
        "INSERT INTO users (role_code, email, full_name, password_hash) VALUES (%s, %s, %s, %s)",
        (role, email, name, PASSWORDS.hash(password)),
    )
    record_audit(user_id, "PROVISION")
    return user_id


def link_guest(guest_id, password):
    guest = one(
        "SELECT user_id, email, full_name FROM guests WHERE guest_id = %s FOR UPDATE",
        (guest_id,),
    )
    if not guest or guest["user_id"] is not None:
        abort(400, "Guest does not exist or already has an account.")
    user_id = create_user("GUEST", validate_email(guest["email"]), guest["full_name"], password)
    execute("UPDATE guests SET user_id = %s WHERE guest_id = %s", (user_id, guest_id))
    return user_id


def seed_demo(password):
    guest = one("SELECT guest_id, user_id FROM guests WHERE email = 'an@example.test'")
    booking = one("SELECT booking_id, guest_id FROM bookings WHERE booking_code = 'DEMO-STAY'")
    order = one("SELECT order_id FROM service_orders WHERE order_code = 'DEMO-SERVICE'")
    room = one("SELECT room_id FROM rooms WHERE room_number = '101'")
    if not all((guest, booking, order, room)):
        raise SystemExit("Run v2/seed.sql first, on a fresh demo database.")
    if guest["user_id"] is not None or booking["guest_id"] != guest["guest_id"]:
        raise SystemExit("The demo guest is already linked or does not own DEMO-STAY.")

    staff = {}
    for role in STAFF_ROLES:
        email = f"{role.lower()}@hotel.example.test"
        name = role.replace("_", " ").title()
        staff[role] = create_user(role, email, name, password)
    guest_user = link_guest(guest["guest_id"], password)
    receptionist = staff["RECEPTIONIST"]
    booking_id = booking["booking_id"]
    execute("UPDATE bookings SET created_by = %s WHERE booking_id = %s", (receptionist, booking_id))
    execute("UPDATE payments SET processed_by = %s WHERE booking_id = %s", (receptionist, booking_id))
    execute(
        "UPDATE service_orders SET requested_by = %s, assigned_to = %s WHERE order_id = %s",
        (guest_user, staff["SERVICE_STAFF"], order["order_id"]),
    )
    task_id, _ = execute(
        """INSERT INTO housekeeping_tasks (room_id, assigned_to, task_type, scheduled_at)
           VALUES (%s, %s, 'CLEANING', UTC_TIMESTAMP(6))""",
        (room["room_id"], staff["HOUSEKEEPING"]),
    )
    execute(
        """INSERT INTO housekeeping_events (room_id, task_id, changed_by, status, old_status, note)
           VALUES (%s, %s, %s, 'DIRTY', 'DIRTY', 'Demo cleaning task assigned')""",
        (room["room_id"], task_id, receptionist),
    )
    execute(
        """INSERT INTO reviews (booking_id, guest_id, overall_rating, cleanliness_rating,
                                service_rating, value_rating, comment, is_published)
           VALUES (%s, %s, 5, 5, 5, 4, %s, TRUE)""",
        (booking_id, guest["guest_id"], "Phòng sạch, phục vụ nhanh."),
    )
    execute(
        "INSERT INTO notifications (user_id, type, title, body) VALUES (%s, 'INVOICE', %s, %s)",
        (guest_user, "Hóa đơn đã chốt", "Cảm ơn bạn đã lưu trú tại khách sạn."),
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    staff = commands.add_parser("create-staff")
    staff.add_argument("--role", required=True, choices=STAFF_ROLES)
    staff.add_argument("--email", required=True)
    staff.add_argument("--name", required=True)
    guest = commands.add_parser("link-guest")
    guest.add_argument("--guest-id", required=True, type=int)
    commands.add_parser("seed-demo")
    args = parser.parse_args()

    try:
        password = validate_password(getpass.getpass("Password (15–128 characters): "))
        if password != getpass.getpass("Confirm password: "):
            parser.error("Passwords do not match.")
        with Flask(__name__).app_context():
            try:
                if args.command == "seed-demo":
                    seed_demo(password)
                elif args.command == "link-guest":
                    link_guest(args.guest_id, password)
                else:
                    create_user(args.role, validate_email(args.email), validate_full_name(args.name), password)
                db().commit()
            finally:
                close_db()
    except HTTPException as error:
        parser.error(error.description)


if __name__ == "__main__":
    main()
