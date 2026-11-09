USE hotel_guest_service_v2;

CREATE VIEW v_housekeeping_current AS
SELECT r.room_id, r.room_number, h.status, h.note, h.recorded_at
FROM rooms r
LEFT JOIN (
  SELECT room_id, status, note, recorded_at,
         ROW_NUMBER() OVER (PARTITION BY room_id ORDER BY recorded_at DESC, event_id DESC) AS row_no
  FROM housekeeping_events
) h ON h.room_id = r.room_id AND h.row_no = 1;

CREATE VIEW v_invoice_summary AS
SELECT i.booking_id, i.status, i.opened_at, i.finalized_at, i.closed_at,
       COALESCE(c.room_total, 0) AS room_total,
       COALESCE(c.service_total, 0) AS service_total,
       COALESCE(c.late_fee_total, 0) AS late_fee_total,
       COALESCE(c.surcharge_total, 0) AS surcharge_total,
       COALESCE(c.charge_total, 0) AS charge_total,
       COALESCE(p.deposit_paid, 0) AS deposit_paid,
       COALESCE(p.service_paid, 0) AS service_paid,
       COALESCE(p.balance_paid, 0) AS balance_paid,
       COALESCE(p.refunded, 0) AS refunded,
       COALESCE(c.charge_total, 0) - COALESCE(p.net_paid, 0) AS net_balance
FROM invoices i
LEFT JOIN (
  SELECT booking_id, SUM(line_total) AS charge_total,
         SUM(CASE WHEN kind = 'ROOM' THEN line_total ELSE 0 END) AS room_total,
         SUM(CASE WHEN kind = 'SERVICE' THEN line_total ELSE 0 END) AS service_total,
         SUM(CASE WHEN kind = 'LATE_FEE' THEN line_total ELSE 0 END) AS late_fee_total,
         SUM(CASE WHEN kind = 'SURCHARGE' THEN line_total ELSE 0 END) AS surcharge_total
  FROM invoice_items GROUP BY booking_id
) c ON c.booking_id = i.booking_id
LEFT JOIN (
  SELECT booking_id, SUM(CASE WHEN kind = 'REFUND' THEN -amount ELSE amount END) AS net_paid,
         SUM(CASE WHEN kind = 'DEPOSIT' THEN amount ELSE 0 END) AS deposit_paid,
         SUM(CASE WHEN kind = 'SERVICE' THEN amount ELSE 0 END) AS service_paid,
         SUM(CASE WHEN kind = 'BALANCE' THEN amount ELSE 0 END) AS balance_paid,
         SUM(CASE WHEN kind = 'REFUND' THEN amount ELSE 0 END) AS refunded
  FROM payments GROUP BY booking_id
) p ON p.booking_id = i.booking_id;

DELIMITER $$

CREATE PROCEDURE list_rooms(IN p_only_bookable BOOLEAN)

BEGIN
  SELECT r.room_id, r.room_number, t.name AS room_type, t.max_guests, t.default_rate,
         r.is_bookable, h.status AS housekeeping_status
  FROM rooms r JOIN room_types t ON t.room_type_id = r.room_type_id
  JOIN v_housekeeping_current h ON h.room_id = r.room_id
  WHERE COALESCE(p_only_bookable, FALSE) = FALSE OR r.is_bookable = TRUE
  ORDER BY r.room_number;
END$$
CREATE PROCEDURE find_available_rooms(IN p_start DATE, IN p_end DATE, IN p_guests INT, IN p_room_id BIGINT UNSIGNED)

BEGIN
  DECLARE v_local_now DATETIME DEFAULT UTC_TIMESTAMP() + INTERVAL 7 HOUR;
  IF DATEDIFF(p_end, p_start) IS NULL OR DATEDIFF(p_end, p_start) NOT BETWEEN 1 AND 365 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid date range';
  END IF;
  IF p_start < DATE(v_local_now) OR p_guests IS NULL OR p_guests NOT BETWEEN 1 AND 20 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid search date or guest count';
  END IF;

  WITH RECURSIVE stay_days AS (
    SELECT p_start AS stay_date
    UNION ALL
    SELECT stay_date + INTERVAL 1 DAY FROM stay_days WHERE stay_date + INTERVAL 1 DAY < p_end
  )
  SELECT r.room_id, r.room_number, t.name AS room_type, t.max_guests,
         DATEDIFF(p_end, p_start) AS nights,
         SUM(COALESCE(rr.nightly_rate, t.default_rate)) AS estimated_total
  FROM rooms r JOIN room_types t ON t.room_type_id = r.room_type_id
  CROSS JOIN stay_days d
  LEFT JOIN room_rates rr ON rr.room_type_id = t.room_type_id AND rr.stay_date = d.stay_date
  WHERE r.is_bookable = TRUE AND t.max_guests >= p_guests
    AND (p_room_id IS NULL OR r.room_id = p_room_id)
    AND NOT EXISTS (
      SELECT 1 FROM room_nights n
      WHERE n.active_room_id = r.room_id AND n.stay_date >= p_start AND n.stay_date < p_end
    )
    AND NOT EXISTS (
      SELECT 1 FROM booking_rooms br
      WHERE br.room_id = r.room_id AND br.status = 'IN_HOUSE'
        AND p_start = DATE(v_local_now)
        AND (br.check_out < p_start OR (br.check_out = p_start AND TIME(v_local_now) >= '14:00:00'))
    )
  GROUP BY r.room_id, r.room_number, t.name, t.max_guests
  ORDER BY estimated_total, r.room_number;
END$$
CREATE PROCEDURE booking_conflicts(IN p_room_id BIGINT UNSIGNED, IN p_start DATE, IN p_end DATE, IN p_ignore_booking_id BIGINT UNSIGNED)

BEGIN
  IF DATEDIFF(p_end, p_start) IS NULL OR DATEDIFF(p_end, p_start) NOT BETWEEN 1 AND 365 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid date range';
  END IF;
  SELECT booking_id, booking_room_id, stay_date, kind
  FROM room_nights
  WHERE active_room_id = p_room_id AND stay_date >= p_start AND stay_date < p_end
    AND (p_ignore_booking_id IS NULL OR booking_id <> p_ignore_booking_id)
  ORDER BY stay_date;
END$$
CREATE PROCEDURE get_booking(IN p_booking_id BIGINT UNSIGNED)

BEGIN
  SELECT * FROM bookings WHERE booking_id = p_booking_id;
  SELECT br.*, r.room_number,
         (SELECT COALESCE(SUM(n.nightly_rate), 0) FROM room_nights n
          WHERE n.booking_room_id = br.booking_room_id AND n.kind = 'BOOKED') AS quoted_room_total
  FROM booking_rooms br JOIN rooms r ON r.room_id = br.room_id
  WHERE br.booking_id = p_booking_id ORDER BY br.booking_room_id;
END$$
CREATE PROCEDURE _allocate_rooms(IN p_booking_id BIGINT UNSIGNED, IN p_rooms JSON)

BEGIN
  DECLARE v_done BOOLEAN DEFAULT FALSE;
  DECLARE v_today DATE DEFAULT DATE(UTC_TIMESTAMP() + INTERVAL 7 HOUR);
  DECLARE v_local_now DATETIME DEFAULT UTC_TIMESTAMP() + INTERVAL 7 HOUR;
  DECLARE v_room BIGINT UNSIGNED;
  DECLARE v_assignment BIGINT UNSIGNED;
  DECLARE v_start DATE;
  DECLARE v_end DATE;
  DECLARE v_day DATE;
  DECLARE v_guests INT;
  DECLARE v_capacity INT;
  DECLARE v_type INT UNSIGNED;
  DECLARE v_default DECIMAL(12,2);
  DECLARE v_late DECIMAL(12,2);
  DECLARE v_price DECIMAL(12,2);
  DECLARE v_overdue BIGINT UNSIGNED;
  DECLARE c_rooms CURSOR FOR
    SELECT j.room_id, j.check_in, j.check_out, j.guest_count
    FROM JSON_TABLE(p_rooms, '$[*]' COLUMNS (
      room_id BIGINT UNSIGNED PATH '$.room_id' ERROR ON EMPTY ERROR ON ERROR,
      check_in DATE PATH '$.check_in' ERROR ON EMPTY ERROR ON ERROR,
      check_out DATE PATH '$.check_out' ERROR ON EMPTY ERROR ON ERROR,
      guest_count INT PATH '$.guest_count' ERROR ON EMPTY ERROR ON ERROR
    )) AS j
    ORDER BY j.room_id, j.check_in;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;
  DECLARE EXIT HANDLER FOR 1062
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Room already booked for at least one requested night';
  IF p_rooms IS NULL OR JSON_TYPE(p_rooms) <> 'ARRAY' OR JSON_LENGTH(p_rooms) NOT BETWEEN 1 AND 20 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Expected an array of 1 to 20 rooms';
  END IF;

  IF (SELECT COUNT(DISTINCT j.room_id) FROM JSON_TABLE(p_rooms, '$[*]' COLUMNS (
      room_id BIGINT UNSIGNED PATH '$.room_id' ERROR ON EMPTY ERROR ON ERROR,
      check_in DATE PATH '$.check_in' ERROR ON EMPTY ERROR ON ERROR,
      check_out DATE PATH '$.check_out' ERROR ON EMPTY ERROR ON ERROR,
      guest_count INT PATH '$.guest_count' ERROR ON EMPTY ERROR ON ERROR
    )) AS j) <> JSON_LENGTH(p_rooms) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Use each room at most once per booking';
  END IF;

  OPEN c_rooms;
  allocation_loop: LOOP
    FETCH c_rooms INTO v_room, v_start, v_end, v_guests;
    IF v_done THEN LEAVE allocation_loop; END IF;

    IF DATEDIFF(v_end, v_start) IS NULL OR DATEDIFF(v_end, v_start) NOT BETWEEN 1 AND 365
       OR v_start < v_today OR v_guests IS NULL OR v_guests NOT BETWEEN 1 AND 20 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid stay dates or guest count';
    END IF;

    BEGIN
      DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_type = NULL;
      SELECT t.room_type_id, t.max_guests, t.default_rate, t.late_hourly_rate
        INTO v_type, v_capacity, v_default, v_late
      FROM rooms r JOIN room_types t ON t.room_type_id = r.room_type_id
      WHERE r.room_id = v_room AND r.is_bookable = TRUE FOR SHARE;
    END;
    IF v_type IS NULL OR v_guests > v_capacity THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Room is unavailable or exceeds capacity';
    END IF;

    IF v_start = v_today THEN
      SET v_overdue = NULL;
      BEGIN
        DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_overdue = NULL;
        SELECT booking_room_id INTO v_overdue FROM booking_rooms
        WHERE room_id = v_room AND status = 'IN_HOUSE'
          AND (check_out < v_today OR (check_out = v_today AND TIME(v_local_now) >= '14:00:00'))
        LIMIT 1 FOR SHARE;
      END;
      IF v_overdue IS NOT NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Room has an overdue guest';
      END IF;
    END IF;

    INSERT INTO booking_rooms (booking_id, room_id, check_in, check_out, guest_count, extension_rate, late_hourly_rate)
    VALUES (p_booking_id, v_room, v_start, v_end, v_guests, v_default, v_late);
    SET v_assignment = LAST_INSERT_ID();
    SET v_day = v_start;

    WHILE v_day < v_end DO
      SELECT COALESCE(
        (SELECT nightly_rate FROM room_rates WHERE room_type_id = v_type AND stay_date = v_day),
        v_default
      ) INTO v_price;
      INSERT INTO room_nights (booking_room_id, room_id, booking_id, stay_date, kind, nightly_rate)
      VALUES (v_assignment, v_room, p_booking_id, v_day, 'BOOKED', v_price);
      SET v_day = v_day + INTERVAL 1 DAY;
    END WHILE;
  END LOOP;
  CLOSE c_rooms;
END$$
CREATE PROCEDURE create_booking(IN p_code VARCHAR(36), IN p_guest_id BIGINT UNSIGNED, IN p_rooms JSON, OUT p_booking_id BIGINT UNSIGNED)
MODIFIES SQL DATA
BEGIN
  SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
  START TRANSACTION;
  BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
      ROLLBACK;
      RESIGNAL;
    END;
    INSERT INTO bookings (booking_code, guest_id) VALUES (p_code, p_guest_id);
    SET p_booking_id = LAST_INSERT_ID();
    CALL _allocate_rooms(p_booking_id, p_rooms);
    INSERT INTO invoices (booking_id) VALUES (p_booking_id);
    COMMIT;
  END;
END$$
CREATE PROCEDURE amend_booking(IN p_booking_id BIGINT UNSIGNED, IN p_revision INT UNSIGNED, IN p_rooms JSON)
MODIFIES SQL DATA
BEGIN
  DECLARE v_status VARCHAR(16) DEFAULT NULL;
  DECLARE v_revision INT UNSIGNED;
  DECLARE v_deposit DECIMAL(19,2);
  DECLARE v_quote DECIMAL(19,2);
  SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
  START TRANSACTION;
  BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
      ROLLBACK;
      RESIGNAL;
    END;
    SELECT status, revision INTO v_status, v_revision FROM bookings WHERE booking_id = p_booking_id FOR UPDATE;
    IF v_status IS NULL OR v_status <> 'CONFIRMED' OR NOT (v_revision <=> p_revision) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Amendment requires the current revision of a confirmed booking';
    END IF;

    UPDATE room_nights SET released = TRUE WHERE booking_id = p_booking_id AND released = FALSE;
    UPDATE booking_rooms SET status = 'REPLACED' WHERE booking_id = p_booking_id AND status = 'RESERVED';
    CALL _allocate_rooms(p_booking_id, p_rooms);
    SELECT COALESCE(SUM(nightly_rate), 0) INTO v_quote FROM room_nights
    WHERE booking_id = p_booking_id AND released = FALSE;
    SELECT COALESCE(SUM(amount), 0) INTO v_deposit FROM payments
    WHERE booking_id = p_booking_id AND kind = 'DEPOSIT';
    IF v_deposit > v_quote THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'New room total cannot be lower than the recorded deposit';
    END IF;
    UPDATE bookings SET revision = revision + 1 WHERE booking_id = p_booking_id;
    COMMIT;
  END;
END$$
CREATE PROCEDURE cancel_booking(IN p_booking_id BIGINT UNSIGNED, IN p_revision INT UNSIGNED, IN p_refund_method VARCHAR(16), IN p_refund_ref VARCHAR(80))
MODIFIES SQL DATA
BEGIN
  DECLARE v_status VARCHAR(16) DEFAULT NULL;
  DECLARE v_revision INT UNSIGNED;
  DECLARE v_deposit DECIMAL(19,2);
  SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
  START TRANSACTION;
  BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
      ROLLBACK;
      RESIGNAL;
    END;
    SELECT status, revision INTO v_status, v_revision FROM bookings WHERE booking_id = p_booking_id FOR UPDATE;
    IF v_status IS NULL OR v_status <> 'CONFIRMED' OR NOT (v_revision <=> p_revision) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cancellation requires the current revision of a confirmed booking';
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_deposit FROM payments
    WHERE booking_id = p_booking_id AND kind = 'DEPOSIT';
    IF v_deposit > 0 THEN
      IF p_refund_method IS NULL OR p_refund_method NOT IN ('CASH','CARD','TRANSFER','EWALLET')
         OR p_refund_ref IS NULL OR CHAR_LENGTH(TRIM(p_refund_ref)) = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Record confirmed refund method and reference before cancelling';
      END IF;
      INSERT INTO payments (booking_id, kind, method, amount, payment_ref)
      VALUES (p_booking_id, 'REFUND', p_refund_method, v_deposit, p_refund_ref);
    END IF;
    UPDATE room_nights SET released = TRUE WHERE booking_id = p_booking_id AND released = FALSE;
    UPDATE booking_rooms SET status = 'CANCELLED' WHERE booking_id = p_booking_id AND status = 'RESERVED';
    UPDATE bookings SET status = 'CANCELLED', revision = revision + 1 WHERE booking_id = p_booking_id;
    UPDATE invoices SET status = 'VOID', closed_at = CURRENT_TIMESTAMP WHERE booking_id = p_booking_id;
    COMMIT;
  END;
END$$
DELIMITER ;
