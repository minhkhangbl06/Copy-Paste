USE hotel_guest_service_v2;

DELIMITER $$

CREATE PROCEDURE list_services(IN p_category VARCHAR(50))

BEGIN
  SELECT service_id, name, category, price FROM services
  WHERE is_available = TRUE AND (p_category IS NULL OR category = p_category)
  ORDER BY category, name;
END$$
CREATE PROCEDURE check_in_room(IN p_booking_room_id BIGINT UNSIGNED, IN p_arrived_at DATETIME)
MODIFIES SQL DATA
BEGIN
  DECLARE v_booking BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_room BIGINT UNSIGNED;
  DECLARE v_room_status VARCHAR(16);
  DECLARE v_booking_status VARCHAR(16);
  DECLARE v_start DATE;
  DECLARE v_end DATE;
  DECLARE v_occupied BIGINT UNSIGNED;
  SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
  START TRANSACTION;
  BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
      ROLLBACK;
      RESIGNAL;
    END;
    SELECT booking_id, room_id INTO v_booking, v_room FROM booking_rooms WHERE booking_room_id = p_booking_room_id;
    IF v_booking IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unknown room assignment'; END IF;
    SELECT status INTO v_booking_status FROM bookings WHERE booking_id = v_booking FOR UPDATE;
    SELECT room_id INTO v_room FROM rooms WHERE room_id = v_room FOR UPDATE;
    SELECT status, check_in, check_out INTO v_room_status, v_start, v_end
    FROM booking_rooms WHERE booking_room_id = p_booking_room_id FOR UPDATE;

    IF v_room_status <> 'RESERVED' OR v_booking_status NOT IN ('CONFIRMED','IN_HOUSE')
       OR p_arrived_at IS NULL OR p_arrived_at < TIMESTAMP(v_start, '14:00:00') OR DATE(p_arrived_at) >= v_end THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Check-in requires a reserved room within its arrival window';
    END IF;

    SELECT COUNT(*) INTO v_occupied FROM booking_rooms
    WHERE room_id = v_room AND status = 'IN_HOUSE';
    IF v_occupied > 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The previous guest is still in this room'; END IF;

    UPDATE booking_rooms SET status = 'IN_HOUSE', arrived_at = p_arrived_at
    WHERE booking_room_id = p_booking_room_id;
    UPDATE bookings SET status = 'IN_HOUSE' WHERE booking_id = v_booking;
    COMMIT;
  END;
END$$
CREATE PROCEDURE create_service_order(IN p_booking_room_id BIGINT UNSIGNED, IN p_code VARCHAR(36), IN p_items JSON, OUT p_order_id BIGINT UNSIGNED)
MODIFIES SQL DATA
BEGIN
  DECLARE v_booking BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_booking_status VARCHAR(16);
  DECLARE v_room_status VARCHAR(16);
  SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
  START TRANSACTION;
  BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
      ROLLBACK;
      RESIGNAL;
    END;
    SELECT booking_id INTO v_booking FROM booking_rooms WHERE booking_room_id = p_booking_room_id;
    IF v_booking IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unknown room assignment'; END IF;
    SELECT status INTO v_booking_status FROM bookings WHERE booking_id = v_booking FOR UPDATE;
    SELECT status INTO v_room_status FROM booking_rooms WHERE booking_room_id = p_booking_room_id FOR UPDATE;
    IF v_booking_status <> 'IN_HOUSE' OR v_room_status <> 'IN_HOUSE' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Service requires a checked-in room';
    END IF;
    IF p_items IS NULL OR JSON_TYPE(p_items) <> 'ARRAY' OR JSON_LENGTH(p_items) NOT BETWEEN 1 AND 50 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Expected an array of 1 to 50 items';
    END IF;
    IF (SELECT COUNT(DISTINCT j.service_id) FROM JSON_TABLE(p_items, '$[*]' COLUMNS (
      service_id BIGINT UNSIGNED PATH '$.service_id' ERROR ON EMPTY ERROR ON ERROR,
      quantity INT PATH '$.quantity' ERROR ON EMPTY ERROR ON ERROR
    )) j
        WHERE j.quantity BETWEEN 1 AND 100) <> JSON_LENGTH(p_items) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid item quantity or duplicate service';
    END IF;

    INSERT INTO service_orders (booking_id, booking_room_id, order_code)
    VALUES (v_booking, p_booking_room_id, p_code);
    SET p_order_id = LAST_INSERT_ID();
    INSERT INTO service_order_items (order_id, booking_id, service_id, item_name, quantity, unit_price)
    SELECT p_order_id, v_booking, d.service_id, d.name, j.quantity, d.price
    FROM JSON_TABLE(p_items, '$[*]' COLUMNS (
      service_id BIGINT UNSIGNED PATH '$.service_id' ERROR ON EMPTY ERROR ON ERROR,
      quantity INT PATH '$.quantity' ERROR ON EMPTY ERROR ON ERROR
    )) j
    JOIN services d ON d.service_id = j.service_id AND d.is_available = TRUE;
    IF ROW_COUNT() <> JSON_LENGTH(p_items) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A service is unavailable'; END IF;
    COMMIT;
  END;
END$$
CREATE PROCEDURE set_service_order_status(IN p_order_id BIGINT UNSIGNED, IN p_status VARCHAR(16))
MODIFIES SQL DATA
BEGIN
  DECLARE v_booking BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_booking_status VARCHAR(16);
  DECLARE v_status VARCHAR(16);
  SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
  START TRANSACTION;
  BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
      ROLLBACK;
      RESIGNAL;
    END;
    SELECT booking_id INTO v_booking FROM service_orders WHERE order_id = p_order_id;
    IF v_booking IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unknown service order'; END IF;
    SELECT status INTO v_booking_status FROM bookings WHERE booking_id = v_booking FOR UPDATE;
    SELECT status INTO v_status FROM service_orders WHERE order_id = p_order_id FOR UPDATE;

    IF NOT (v_status <=> p_status) THEN
      IF v_booking_status <> 'IN_HOUSE' OR p_status IS NULL OR NOT (
        (v_status = 'ORDERED' AND p_status IN ('PREPARING','DELIVERED','CANCELLED'))
        OR (v_status = 'PREPARING' AND p_status IN ('DELIVERED','CANCELLED'))
      ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid service order transition'; END IF;

      IF p_status = 'DELIVERED' THEN
        INSERT INTO invoice_items (booking_id, kind, order_item_id, description, quantity, unit_price)
        SELECT v_booking, 'SERVICE', order_item_id, item_name, quantity, unit_price
        FROM service_order_items WHERE order_id = p_order_id;
      END IF;
      UPDATE service_orders SET status = p_status WHERE order_id = p_order_id;
    END IF;
    COMMIT;
  END;
END$$
CREATE PROCEDURE add_surcharge(IN p_booking_id BIGINT UNSIGNED, IN p_description VARCHAR(255), IN p_amount DECIMAL(12,2), IN p_charge_ref VARCHAR(80))
MODIFIES SQL DATA
BEGIN
  DECLARE v_booking_status VARCHAR(16) DEFAULT NULL;
  DECLARE v_existing BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_same BOOLEAN;
  SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
  START TRANSACTION;
  BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
      ROLLBACK;
      RESIGNAL;
    END;
    SELECT status INTO v_booking_status FROM bookings WHERE booking_id = p_booking_id FOR UPDATE;
    IF v_booking_status IS NULL OR p_description IS NULL OR CHAR_LENGTH(TRIM(p_description)) = 0
       OR p_amount IS NULL OR p_amount <= 0 OR p_charge_ref IS NULL OR CHAR_LENGTH(TRIM(p_charge_ref)) = 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Surcharge requires booking, description, reference and positive amount';
    END IF;

    SELECT invoice_item_id,
           booking_id = p_booking_id AND BINARY description = BINARY p_description AND unit_price = p_amount
      INTO v_existing, v_same
    FROM invoice_items WHERE charge_ref = p_charge_ref COLLATE utf8mb4_0900_as_cs;

    IF v_existing IS NOT NULL THEN
      IF NOT v_same THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Surcharge reference is already used for different details'; END IF;
    ELSE
      IF v_booking_status <> 'IN_HOUSE' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Surcharge requires an in-house booking'; END IF;
      INSERT INTO invoice_items (booking_id, kind, description, quantity, unit_price, charge_ref)
      VALUES (p_booking_id, 'SURCHARGE', p_description, 1, p_amount, p_charge_ref);
    END IF;
    COMMIT;
  END;
END$$
CREATE PROCEDURE _finalize_if_departed(IN p_booking_id BIGINT UNSIGNED)

BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM booking_rooms WHERE booking_id = p_booking_id AND status IN ('RESERVED','IN_HOUSE')
  ) THEN
    UPDATE bookings SET status = 'DEPARTED' WHERE booking_id = p_booking_id;
    UPDATE invoices SET status = 'PAYABLE', finalized_at = CURRENT_TIMESTAMP WHERE booking_id = p_booking_id;
  END IF;
END$$
CREATE PROCEDURE mark_room_no_show(IN p_booking_room_id BIGINT UNSIGNED, IN p_recorded_at DATETIME)
MODIFIES SQL DATA
BEGIN
  DECLARE v_booking BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_booking_status VARCHAR(16);
  DECLARE v_room_status VARCHAR(16);
  DECLARE v_end DATE;
  SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
  START TRANSACTION;
  BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
      ROLLBACK;
      RESIGNAL;
    END;
    SELECT booking_id INTO v_booking FROM booking_rooms WHERE booking_room_id = p_booking_room_id;
    IF v_booking IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unknown room assignment'; END IF;
    SELECT status INTO v_booking_status FROM bookings WHERE booking_id = v_booking FOR UPDATE;
    SELECT status, check_out INTO v_room_status, v_end
    FROM booking_rooms WHERE booking_room_id = p_booking_room_id FOR UPDATE;

    IF v_room_status <> 'NO_SHOW' THEN
      IF v_booking_status <> 'IN_HOUSE' OR v_room_status <> 'RESERVED'
         OR p_recorded_at IS NULL OR p_recorded_at < TIMESTAMP(v_end, '12:00:00') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No-show requires an unclaimed room past checkout in a started booking';
      END IF;

      INSERT INTO invoice_items (booking_id, kind, night_id, description, quantity, unit_price)
      SELECT v_booking, 'ROOM', night_id, CONCAT('No-show room ', room_id, ' / ', stay_date), 1, nightly_rate
      FROM room_nights WHERE booking_room_id = p_booking_room_id AND kind = 'BOOKED' AND released = FALSE;

      UPDATE room_nights SET released = TRUE WHERE booking_room_id = p_booking_room_id AND released = FALSE;
      UPDATE booking_rooms SET status = 'NO_SHOW' WHERE booking_room_id = p_booking_room_id;
      CALL _finalize_if_departed(v_booking);
    END IF;
    COMMIT;
  END;
END$$
CREATE PROCEDURE depart_room(IN p_booking_room_id BIGINT UNSIGNED, IN p_departed_at DATETIME)
MODIFIES SQL DATA
BEGIN
  DECLARE v_booking BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_room BIGINT UNSIGNED;
  DECLARE v_booking_status VARCHAR(16);
  DECLARE v_room_status VARCHAR(16);
  DECLARE v_arrived DATETIME;
  DECLARE v_original_departure DATETIME;
  DECLARE v_end DATE;
  DECLARE v_day DATE;
  DECLARE v_departure_day DATE;
  DECLARE v_extension_rate DECIMAL(12,2);
  DECLARE v_late_rate DECIMAL(12,2);
  DECLARE v_late_hours INT;
  SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
  START TRANSACTION;
  BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
      ROLLBACK;
      RESIGNAL;
    END;
    DECLARE EXIT HANDLER FOR 1062
    BEGIN
      ROLLBACK;
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Late stay conflicts with a reservation; resolve the room conflict first';
    END;

    SELECT booking_id, room_id INTO v_booking, v_room FROM booking_rooms WHERE booking_room_id = p_booking_room_id;
    IF v_booking IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unknown room assignment'; END IF;
    SELECT status INTO v_booking_status FROM bookings WHERE booking_id = v_booking FOR UPDATE;
    SELECT room_id INTO v_room FROM rooms WHERE room_id = v_room FOR UPDATE;
    SELECT status, arrived_at, departed_at, check_out, extension_rate, late_hourly_rate
      INTO v_room_status, v_arrived, v_original_departure, v_end, v_extension_rate, v_late_rate
    FROM booking_rooms WHERE booking_room_id = p_booking_room_id FOR UPDATE;

    IF v_room_status = 'DEPARTED' THEN
      IF NOT (v_original_departure <=> p_departed_at) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Departure was already recorded'; END IF;
    ELSE
      IF v_room_status <> 'IN_HOUSE' OR v_booking_status <> 'IN_HOUSE'
         OR p_departed_at IS NULL OR p_departed_at < v_arrived OR DATEDIFF(DATE(p_departed_at), v_end) > 365 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid actual departure date or room status';
      END IF;

      IF EXISTS (
        SELECT 1 FROM service_orders
        WHERE booking_room_id = p_booking_room_id AND status IN ('ORDERED','PREPARING')
      ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Complete or cancel pending orders for this room first'; END IF;

      SET v_departure_day = DATE(p_departed_at);
      SET v_day = v_end;
      WHILE v_day < v_departure_day DO
        INSERT INTO room_nights (booking_room_id, room_id, booking_id, stay_date, kind, nightly_rate)
        VALUES (p_booking_room_id, v_room, v_booking, v_day, 'EXTRA', v_extension_rate);
        SET v_day = v_day + INTERVAL 1 DAY;
      END WHILE;

      IF v_departure_day >= v_end AND TIME(p_departed_at) > '14:00:00' THEN
        INSERT INTO room_nights (booking_room_id, room_id, booking_id, stay_date, kind, nightly_rate)
        VALUES (p_booking_room_id, v_room, v_booking, v_departure_day, 'LATE_HOLD', 0);
        -- The guest has now departed. Release the departure-day hold after checking the collision.
        UPDATE room_nights SET released = TRUE
        WHERE booking_room_id = p_booking_room_id AND stay_date = v_departure_day;
      END IF;

      INSERT INTO invoice_items (booking_id, kind, night_id, description, quantity, unit_price)
      SELECT v_booking, 'ROOM', night_id, CONCAT('Room ', v_room, ' / ', stay_date), 1, nightly_rate
      FROM room_nights
      WHERE booking_room_id = p_booking_room_id AND kind IN ('BOOKED','EXTRA') AND released = FALSE;

      IF v_departure_day >= v_end AND TIME(p_departed_at) > '12:00:00' AND v_late_rate > 0 THEN
        SET v_late_hours = CEIL(TIMESTAMPDIFF(SECOND, TIMESTAMP(v_departure_day, '12:00:00'), p_departed_at) / 3600);
        INSERT INTO invoice_items (booking_id, kind, late_booking_room_id, description, quantity, unit_price)
        VALUES (v_booking, 'LATE_FEE', p_booking_room_id, 'Late checkout per started hour', v_late_hours, v_late_rate);
      END IF;

      UPDATE booking_rooms SET status = 'DEPARTED', departed_at = p_departed_at
      WHERE booking_room_id = p_booking_room_id;
      INSERT INTO housekeeping_events (room_id, status, note)
      VALUES (v_room, 'DIRTY', CONCAT('Departure of room assignment ', p_booking_room_id));

      CALL _finalize_if_departed(v_booking);
    END IF;
    COMMIT;
  END;
END$$
CREATE PROCEDURE record_payment(IN p_booking_id BIGINT UNSIGNED, IN p_order_id BIGINT UNSIGNED, IN p_kind VARCHAR(16), IN p_method VARCHAR(16), IN p_amount DECIMAL(19,2), IN p_ref VARCHAR(80))
MODIFIES SQL DATA
BEGIN
  DECLARE v_booking_status VARCHAR(16) DEFAULT NULL;
  DECLARE v_invoice_status VARCHAR(16);
  DECLARE v_limit DECIMAL(19,2);
  DECLARE v_order_status VARCHAR(16) DEFAULT NULL;
  DECLARE v_existing BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_same BOOLEAN;
  SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
  START TRANSACTION;
  BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
      ROLLBACK;
      RESIGNAL;
    END;
    SELECT status INTO v_booking_status FROM bookings WHERE booking_id = p_booking_id FOR UPDATE;
    IF v_booking_status IS NULL OR p_kind IS NULL OR p_kind NOT IN ('DEPOSIT','SERVICE','BALANCE')
       OR p_method IS NULL OR p_method NOT IN ('CASH','CARD','TRANSFER','EWALLET')
       OR p_amount IS NULL OR p_amount <= 0 OR p_ref IS NULL OR CHAR_LENGTH(TRIM(p_ref)) = 0
       OR ((p_kind = 'SERVICE') <> (p_order_id IS NOT NULL)) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid payment details';
    END IF;

    SELECT payment_id,
           booking_id = p_booking_id AND (order_id <=> p_order_id)
           AND kind = p_kind AND method = p_method AND amount = p_amount
      INTO v_existing, v_same
    FROM payments WHERE payment_ref = p_ref COLLATE utf8mb4_0900_as_cs;

    IF v_existing IS NOT NULL THEN
      IF NOT v_same THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment reference is already used for different details'; END IF;
    ELSE
      SELECT status INTO v_invoice_status FROM invoices WHERE booking_id = p_booking_id;
      CASE p_kind
        WHEN 'DEPOSIT' THEN
          IF v_booking_status <> 'CONFIRMED' OR v_invoice_status <> 'OPEN' THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Deposit requires a confirmed booking';
          END IF;
          SELECT COALESCE(SUM(nightly_rate), 0) - COALESCE((
            SELECT SUM(amount) FROM payments WHERE booking_id = p_booking_id AND kind = 'DEPOSIT'
          ), 0) INTO v_limit
          FROM room_nights WHERE booking_id = p_booking_id AND released = FALSE AND kind = 'BOOKED';
        WHEN 'SERVICE' THEN
          SELECT status INTO v_order_status FROM service_orders WHERE order_id = p_order_id AND booking_id = p_booking_id;
          IF v_invoice_status NOT IN ('OPEN','PAYABLE') OR v_order_status IS NULL OR v_order_status <> 'DELIVERED' THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Service payment requires a delivered order on an active invoice';
          END IF;
          SELECT COALESCE(SUM(quantity * unit_price), 0) - COALESCE((
            SELECT SUM(amount) FROM payments WHERE booking_id = p_booking_id AND order_id = p_order_id
          ), 0) INTO v_limit
          FROM service_order_items WHERE order_id = p_order_id;
          SELECT LEAST(v_limit, CASE WHEN status = 'PAYABLE' THEN net_balance ELSE v_limit END) INTO v_limit
          FROM v_invoice_summary WHERE booking_id = p_booking_id;
        WHEN 'BALANCE' THEN
          IF v_invoice_status <> 'PAYABLE' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Balance payment requires a finalized invoice'; END IF;
          SELECT net_balance INTO v_limit FROM v_invoice_summary WHERE booking_id = p_booking_id;
      END CASE;

      IF p_amount > v_limit THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment exceeds the outstanding amount'; END IF;
      INSERT INTO payments (booking_id, order_id, kind, method, amount, payment_ref)
      VALUES (p_booking_id, p_order_id, p_kind, p_method, p_amount, p_ref);
    END IF;
    COMMIT;
  END;
END$$
CREATE PROCEDURE close_invoice(IN p_booking_id BIGINT UNSIGNED)
MODIFIES SQL DATA
BEGIN
  DECLARE v_booking_status VARCHAR(16) DEFAULT NULL;
  DECLARE v_invoice_status VARCHAR(16);
  DECLARE v_balance DECIMAL(19,2);
  SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
  START TRANSACTION;
  BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
      ROLLBACK;
      RESIGNAL;
    END;
    SELECT status INTO v_booking_status FROM bookings WHERE booking_id = p_booking_id FOR UPDATE;
    IF v_booking_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unknown booking'; END IF;
    SELECT status, net_balance INTO v_invoice_status, v_balance
    FROM v_invoice_summary WHERE booking_id = p_booking_id;
    IF v_invoice_status <> 'CLOSED' THEN
      IF v_invoice_status <> 'PAYABLE' OR v_balance <> 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only a finalized invoice with zero outstanding can be closed';
      END IF;
      UPDATE invoices SET status = 'CLOSED', closed_at = CURRENT_TIMESTAMP WHERE booking_id = p_booking_id;
    END IF;
    COMMIT;
  END;
END$$
DELIMITER ;
