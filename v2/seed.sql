USE hotel_guest_service_v2;

SET @d = DATE(UTC_TIMESTAMP() + INTERVAL 7 HOUR) + INTERVAL 7 DAY;

INSERT INTO guests (guest_id, full_name, email) VALUES
  (1, 'Nguyễn Minh An', 'an@example.test'), (2, 'Trần Gia Linh', 'linh@example.test');
INSERT INTO room_types (room_type_id, name, max_guests, default_rate, late_hourly_rate) VALUES
  (1, 'Standard', 2, 800000, 100000), (2, 'Deluxe', 3, 1200000, 200000);
INSERT INTO rooms (room_id, room_type_id, room_number, is_bookable) VALUES
  (1, 1, '101', TRUE), (2, 2, '201', TRUE), (3, 1, '102', TRUE), (4, 1, '103', FALSE);
INSERT INTO room_rates (room_type_id, stay_date, nightly_rate) VALUES (1, @d, 950000);
INSERT INTO services (service_id, name, category, price, is_available) VALUES
  (1, 'Phở bò', 'Food', 95000, TRUE), (2, 'Nước cam', 'Drink', 45000, TRUE),
  (3, 'Bánh mì', 'Food', 65000, FALSE);
INSERT INTO housekeeping_events (room_id, status) VALUES (1, 'INSPECTED'), (2, 'CLEAN'), (3, 'CLEAN');

CALL create_booking('DEMO-STAY', 1, JSON_ARRAY(
  JSON_OBJECT('room_id', 1, 'check_in', @d, 'check_out', @d + INTERVAL 2 DAY, 'guest_count', 2),
  JSON_OBJECT('room_id', 2, 'check_in', @d, 'check_out', @d + INTERVAL 1 DAY, 'guest_count', 2)
), @stay);
SELECT booking_room_id INTO @room101 FROM booking_rooms WHERE booking_id = @stay AND room_id = 1;
SELECT booking_room_id INTO @room201 FROM booking_rooms WHERE booking_id = @stay AND room_id = 2;

CALL record_payment(@stay, NULL, 'DEPOSIT', 'TRANSFER', 500000, 'DEMO-DEPOSIT');
CALL check_in_room(@room101, TIMESTAMP(@d, '15:00:00'));
CALL check_in_room(@room201, TIMESTAMP(@d, '15:30:00'));

CALL create_service_order(@room101, 'DEMO-SERVICE', JSON_ARRAY(
  JSON_OBJECT('service_id', 1, 'quantity', 2), JSON_OBJECT('service_id', 2, 'quantity', 1)
), @service);
CALL set_service_order_status(@service, 'PREPARING');
CALL set_service_order_status(@service, 'DELIVERED');
CALL record_payment(@stay, @service, 'SERVICE', 'CASH', 100000, 'DEMO-SERVICE-PAYMENT');
CALL add_surcharge(@stay, 'Extra towel', 50000, 'DEMO-SURCHARGE');

CALL depart_room(@room201, TIMESTAMP(@d + INTERVAL 1 DAY, '11:30:00'));
CALL depart_room(@room101, TIMESTAMP(@d + INTERVAL 2 DAY, '13:10:00'));
-- 2,950,000 room + 235,000 service + 200,000 late + 50,000 surcharge = 3,435,000.
-- 500,000 deposit + 100,000 service payment leave 2,835,000.
CALL record_payment(@stay, NULL, 'BALANCE', 'CARD', 2835000, 'DEMO-BALANCE');
CALL close_invoice(@stay);

CALL create_booking('DEMO-NEXT', 2, JSON_ARRAY(
  JSON_OBJECT('room_id', 1, 'check_in', @d + INTERVAL 2 DAY,
              'check_out', @d + INTERVAL 3 DAY, 'guest_count', 1)
), @next);

CALL create_booking('DEMO-AMEND', 2, JSON_ARRAY(
  JSON_OBJECT('room_id', 3, 'check_in', @d, 'check_out', @d + INTERVAL 1 DAY, 'guest_count', 1)
), @amend);
CALL amend_booking(@amend, 1, JSON_ARRAY(
  JSON_OBJECT('room_id', 3, 'check_in', @d + INTERVAL 1 DAY,
              'check_out', @d + INTERVAL 2 DAY, 'guest_count', 1)
));
CALL record_payment(@amend, NULL, 'DEPOSIT', 'TRANSFER', 200000, 'DEMO-CANCEL-DEPOSIT');
CALL cancel_booking(@amend, 2, 'TRANSFER', 'DEMO-REFUND');
