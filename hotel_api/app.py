import secrets

from flask import Flask, abort, g, jsonify, request
from mysql.connector import Error, IntegrityError, errorcode
from werkzeug.exceptions import HTTPException

from .auth import (
    PASSWORDS,
    SESSION_SECONDS,
    digest,
    enforce_rate_limit,
    read_json,
    record_audit,
    require_user,
    validate_email,
    validate_full_name,
    validate_password,
    verify_password,
)
from .db import close_db, db, execute, one, rows


def create_app():
    app = Flask(__name__, static_folder=None)
    app.config["MAX_CONTENT_LENGTH"] = 4096
    app.teardown_appcontext(close_db)

    @app.after_request
    def response_headers(response):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.errorhandler(HTTPException)
    def http_error(error):
        response = error.get_response()
        response.set_data(app.json.dumps({"error": error.description}))
        response.content_type = "application/json"
        if error.code == 401:
            response.headers["WWW-Authenticate"] = "Bearer"
        if error.code == 429:
            response.headers["Retry-After"] = str(g.retry_after)
        return response

    @app.errorhandler(Error)
    def db_error(error):
        app.logger.error("Database operation failed (errno=%s)", error.errno)
        return {"error": "Database operation failed"}, 503

    @app.post("/api/auth/register")
    def register():
        enforce_rate_limit("register-ip", request.remote_addr, 10)
        data = read_json("email", "password", "full_name")
        email = validate_email(data["email"])
        full_name = validate_full_name(data["full_name"])
        password = validate_password(data["password"])
        password_hash = PASSWORDS.hash(password)

        try:
            user_id, _ = execute(
                """INSERT INTO users (role_code, email, password_hash, full_name)
                   VALUES ('GUEST', %s, %s, %s)""",
                (email, password_hash, full_name),
            )
            execute(
                "INSERT INTO guests (user_id, email, full_name) VALUES (%s, %s, %s)",
                (user_id, email, full_name),
            )
            record_audit(user_id, "REGISTER")
            db().commit()
        except IntegrityError as error:
            db().rollback()
            if error.errno == errorcode.ER_DUP_ENTRY:
                abort(409, "Registration could not be completed")
            raise
        return {
            "user_id": user_id,
            "email": email,
            "full_name": full_name,
            "role_code": "GUEST",
        }, 201

    @app.post("/api/auth/login")
    def login():
        enforce_rate_limit("login-ip", request.remote_addr, 30)
        data = read_json("email", "password")
        email = validate_email(data["email"])
        password = validate_password(data["password"], minimum=1)
        enforce_rate_limit("login-account", email, 10)
        account = one(
            "SELECT user_id, password_hash, is_active FROM users WHERE email = %s",
            (email,),
        )
        db().commit()
        if not verify_password(password, account):
            abort(401, "Invalid credentials")

        user_id = account["user_id"]
        current = one(
            "SELECT is_active, password_hash FROM users WHERE user_id = %s FOR UPDATE",
            (user_id,),
        )
        if not current or not current["is_active"]:
            abort(401, "Invalid credentials")
        if current["password_hash"] != account["password_hash"]:
            abort(401, "Invalid credentials")

        token = secrets.token_urlsafe(32)
        execute(
            """INSERT INTO auth_sessions (token_hash, user_id, expires_at)
               VALUES (%s, %s, UTC_TIMESTAMP(6) + INTERVAL %s SECOND)""",
            (digest(token), user_id, SESSION_SECONDS),
        )
        execute("UPDATE users SET last_login_at = UTC_TIMESTAMP(6) WHERE user_id = %s", (user_id,))
        record_audit(user_id, "LOGIN")
        db().commit()
        return {"access_token": token, "token_type": "Bearer", "expires_in": SESSION_SECONDS}

    @app.post("/api/auth/logout")
    @require_user()
    def logout():
        _, deleted = execute("DELETE FROM auth_sessions WHERE token_hash = %s", (g.token_hash,))
        if deleted:
            record_audit(g.user["user_id"], "LOGOUT")
        db().commit()
        return "", 204

    @app.get("/api/auth/me")
    @require_user()
    def me():
        return g.user

    @app.get("/api/guest/bookings")
    @require_user("GUEST")
    def guest_bookings():
        return jsonify(rows(
            """SELECT b.booking_id, b.booking_code, b.status
               FROM bookings b JOIN guests p ON p.guest_id = b.guest_id
               WHERE p.user_id = %s ORDER BY b.booking_id DESC LIMIT 100""",
            (g.user["user_id"],),
        ))

    @app.get("/api/reception/bookings")
    @require_user("RECEPTIONIST", "ADMIN")
    def reception_bookings():
        return jsonify(rows(
            "SELECT booking_id, booking_code, status FROM bookings ORDER BY booking_id DESC LIMIT 100"
        ))

    @app.get("/api/housekeeping/tasks")
    @require_user("HOUSEKEEPING", "ADMIN")
    def housekeeping_tasks():
        return jsonify(rows(
            """SELECT task_id, room_id, task_type, status FROM housekeeping_tasks
               WHERE (%s = 'ADMIN' OR assigned_to = %s) ORDER BY task_id DESC LIMIT 100""",
            (g.user["role_code"], g.user["user_id"]),
        ))

    @app.get("/api/service/orders")
    @require_user("SERVICE_STAFF", "ADMIN")
    def service_orders():
        return jsonify(rows(
            """SELECT order_id, order_code, status FROM service_orders
               WHERE (%s = 'ADMIN' OR assigned_to = %s) ORDER BY order_id DESC LIMIT 100""",
            (g.user["role_code"], g.user["user_id"]),
        ))

    @app.get("/api/notifications")
    @require_user()
    def notifications():
        return jsonify(rows(
            """SELECT notification_id, title, body, read_at FROM notifications
               WHERE user_id = %s ORDER BY notification_id DESC LIMIT 100""",
            (g.user["user_id"],),
        ))

    @app.get("/api/admin/audit")
    @require_user("ADMIN")
    def admin_audit():
        return jsonify(rows(
            """SELECT log_id, user_id, action, entity_type, entity_id, created_at
               FROM audit_logs ORDER BY log_id DESC LIMIT 100"""
        ))

    return app
