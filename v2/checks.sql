USE hotel_guest_service_v2;

-- Run once after seed. Any SQLSTATE 45000 outside the expected handlers is a failure.
DELIMITER $$
CREATE PROCEDURE test_hotel_demo()
BEGIN
  DECLARE v_day DATE DEFAULT DATE(UTC_TIMESTAMP() + INTERVAL 7 HOUR) + INTERVAL 7 DAY;
  DECLARE v_stay BIGINT UNSIGNED;
  DECLARE v_cancelled BIGINT UNSIGNED;
  DECLARE v_next BIGINT UNSIGNED;
  DECLARE v_night_room BIGINT UNSIGNED;
  DECLARE v_new BIGINT UNSIGNED;
  DECLARE v_second BIGINT UNSIGNED;
  DECLARE v_following_assignment BIGINT UNSIGNED;
  DECLARE v_order BIGINT UNSIGNED;
  DECLARE v_assignment BIGINT UNSIGNED;
  DECLARE v_failed BOOLEAN DEFAULT FALSE;
  DECLARE v_error TEXT;

  SELECT booking_id INTO v_stay FROM bookings WHERE booking_code = 'DEMO-STAY';
  SELECT booking_id INTO v_cancelled FROM bookings WHERE booking_code = 'DEMO-AMEND';
  SELECT booking_id INTO v_next FROM bookings WHERE booking_code = 'DEMO-NEXT';
  SELECT check_in INTO v_day FROM booking_rooms WHERE booking_id = v_stay AND room_id = 1;

  IF NOT EXISTS (
    SELECT 1 FROM v_invoice_summary WHERE booking_id = v_stay AND status = 'CLOSED'
      AND room_total = 2950000 AND service_total = 235000 AND late_fee_total = 200000
      AND surcharge_total = 50000 AND charge_total = 3435000 AND deposit_paid = 500000
      AND service_paid = 100000 AND balance_paid = 2835000 AND net_balance = 0
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invoice totals mismatch'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM v_invoice_summary WHERE booking_id = v_cancelled AND status = 'VOID'
      AND deposit_paid = 200000 AND refunded = 200000 AND net_balance = 0
  ) OR EXISTS (SELECT 1 FROM room_nights WHERE booking_id = v_cancelled AND released = FALSE)
  THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cancellation refund or release mismatch'; END IF;

  CALL record_payment(v_stay, NULL, 'BALANCE', 'CARD', 2835000, 'DEMO-BALANCE');
  CALL close_invoice(v_stay);

  BEGIN
    DECLARE CONTINUE HANDLER FOR SQLSTATE '45000'
      GET DIAGNOSTICS CONDITION 1 v_error = MESSAGE_TEXT;
    CALL create_booking('TEST-OVERLAP', 1, JSON_ARRAY(
      JSON_OBJECT('room_id', 1, 'check_in', v_day - INTERVAL 1 DAY,
                  'check_out', v_day + INTERVAL 1 DAY, 'guest_count', 1)
    ), v_new);
  END;
  IF v_error IS NULL OR v_error <> 'Room already booked for at least one requested night'
     OR EXISTS (SELECT 1 FROM bookings WHERE booking_code = 'TEST-OVERLAP')
     OR EXISTS (SELECT 1 FROM room_nights WHERE active_room_id = 1 AND stay_date = v_day - INTERVAL 1 DAY)
  THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Overlap did not roll back all nights'; END IF;

  SET v_error = NULL;
  BEGIN
    DECLARE CONTINUE HANDLER FOR SQLSTATE '45000'
      GET DIAGNOSTICS CONDITION 1 v_error = MESSAGE_TEXT;
    CALL amend_booking(v_next, 1, JSON_ARRAY(
      JSON_OBJECT('room_id', 1, 'check_in', v_day, 'check_out', v_day + INTERVAL 1 DAY, 'guest_count', 1)
    ));
  END;
  SELECT active_room_id INTO v_night_room FROM room_nights
  WHERE booking_id = v_next AND stay_date = v_day + INTERVAL 2 DAY AND released = FALSE;
  IF v_error IS NULL OR v_error <> 'Room already booked for at least one requested night'
     OR NOT (v_night_room <=> 1) OR (SELECT revision FROM bookings WHERE booking_id = v_next) <> 1
  THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Failed amendment lost the original booking'; END IF;

  -- Overnight overstay and later than the next arrival cut-off.
  CALL create_booking('TEST-OVERNIGHT', 1, JSON_ARRAY(
    JSON_OBJECT('room_id', 3, 'check_in', v_day + INTERVAL 3 DAY,
                'check_out', v_day + INTERVAL 4 DAY, 'guest_count', 1)
  ), v_new);
  SELECT booking_room_id INTO v_assignment FROM booking_rooms WHERE booking_id = v_new;
  CALL check_in_room(v_assignment, TIMESTAMP(v_day + INTERVAL 3 DAY, '15:00:00'));
  CALL depart_room(v_assignment, TIMESTAMP(v_day + INTERVAL 5 DAY, '14:30:00'));
  IF NOT EXISTS (
    SELECT 1 FROM room_nights WHERE booking_id = v_new AND kind = 'EXTRA'
      AND stay_date = v_day + INTERVAL 4 DAY AND released = FALSE
  ) OR NOT EXISTS (
    SELECT 1 FROM room_nights WHERE booking_id = v_new AND kind = 'LATE_HOLD'
      AND stay_date = v_day + INTERVAL 5 DAY AND released = TRUE
  ) OR NOT EXISTS (
    SELECT 1 FROM v_invoice_summary WHERE booking_id = v_new AND status = 'PAYABLE'
      AND room_total = 1600000 AND late_fee_total = 300000
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Overnight billing or occupancy mismatch'; END IF;

  BEGIN
    DECLARE CONTINUE HANDLER FOR SQLSTATE '45000' SET v_failed = TRUE;
    CALL close_invoice(v_new);
  END;
  IF NOT v_failed THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unpaid invoice was closed'; END IF;

  CALL create_booking('TEST-LATE-OLD', 1, JSON_ARRAY(
    JSON_OBJECT('room_id', 3, 'check_in', v_day + INTERVAL 8 DAY,
                'check_out', v_day + INTERVAL 9 DAY, 'guest_count', 1)
  ), v_new);
  CALL create_booking('TEST-LATE-NEXT', 2, JSON_ARRAY(
    JSON_OBJECT('room_id', 3, 'check_in', v_day + INTERVAL 9 DAY,
                'check_out', v_day + INTERVAL 10 DAY, 'guest_count', 1)
  ), v_second);
  SELECT booking_room_id INTO v_assignment FROM booking_rooms WHERE booking_id = v_new;
  SELECT booking_room_id INTO v_following_assignment FROM booking_rooms WHERE booking_id = v_second;
  CALL check_in_room(v_assignment, TIMESTAMP(v_day + INTERVAL 8 DAY, '15:00:00'));

  SET v_error = NULL;
  BEGIN
    DECLARE CONTINUE HANDLER FOR SQLSTATE '45000'
      GET DIAGNOSTICS CONDITION 1 v_error = MESSAGE_TEXT;
    CALL check_in_room(v_following_assignment, TIMESTAMP(v_day + INTERVAL 9 DAY, '14:15:00'));
  END;
  IF v_error IS NULL OR v_error <> 'The previous guest is still in this room'
  THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Overlapping physical check-in was permitted'; END IF;

  CALL create_service_order(v_assignment, 'TEST-PENDING', JSON_ARRAY(
    JSON_OBJECT('service_id', 1, 'quantity', 1)
  ), v_order);
  SET v_error = NULL;
  BEGIN
    DECLARE CONTINUE HANDLER FOR SQLSTATE '45000'
      GET DIAGNOSTICS CONDITION 1 v_error = MESSAGE_TEXT;
    CALL depart_room(v_assignment, TIMESTAMP(v_day + INTERVAL 9 DAY, '13:00:00'));
  END;
  IF v_error IS NULL OR v_error <> 'Complete or cancel pending orders for this room first'
  THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Checkout ignored a pending order'; END IF;
  CALL set_service_order_status(v_order, 'CANCELLED');

  SET v_error = NULL;
  BEGIN
    DECLARE CONTINUE HANDLER FOR SQLSTATE '45000'
      GET DIAGNOSTICS CONDITION 1 v_error = MESSAGE_TEXT;
    CALL depart_room(v_assignment, TIMESTAMP(v_day + INTERVAL 9 DAY, '14:30:00'));
  END;
  IF v_error IS NULL OR v_error <> 'Late stay conflicts with a reservation; resolve the room conflict first'
     OR EXISTS (SELECT 1 FROM invoice_items WHERE booking_id = v_new)
     OR NOT EXISTS (SELECT 1 FROM room_nights WHERE booking_id = v_second AND released = FALSE)
  THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Late checkout did not protect the following booking'; END IF;

  CALL amend_booking(v_second, 1, JSON_ARRAY(
    JSON_OBJECT('room_id', 1, 'check_in', v_day + INTERVAL 9 DAY,
                'check_out', v_day + INTERVAL 10 DAY, 'guest_count', 1)
  ));
  CALL depart_room(v_assignment, TIMESTAMP(v_day + INTERVAL 9 DAY, '14:30:00'));

  SELECT 'Demo assertions passed' AS result;
END$$
DELIMITER ;

CALL test_hotel_demo();
DROP PROCEDURE test_hotel_demo;

SELECT check_in INTO @demo_day FROM booking_rooms br JOIN bookings b USING (booking_id)
WHERE b.booking_code = 'DEMO-STAY' AND br.room_id = 1;
CALL list_rooms(FALSE);
CALL list_services(NULL);
-- Room 101 is reserved on this one-night query. Room 102 is available after cancellation.
CALL find_available_rooms(@demo_day, @demo_day + INTERVAL 1 DAY, 2, NULL);
-- One existing booking for room 101 on its actual next planned arrival date.
CALL booking_conflicts(1, @demo_day + INTERVAL 2 DAY, @demo_day + INTERVAL 3 DAY, NULL);
