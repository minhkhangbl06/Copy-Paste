CREATE DATABASE IF NOT EXISTS hotel_guest_service_v2
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE hotel_guest_service_v2;

CREATE TABLE guests (
  guest_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE room_types (
  room_type_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(60) NOT NULL UNIQUE,
  max_guests TINYINT UNSIGNED NOT NULL,
  default_rate DECIMAL(12,2) NOT NULL,
  late_hourly_rate DECIMAL(12,2) NOT NULL,
  CHECK (max_guests BETWEEN 1 AND 20),
  CHECK (default_rate > 0 AND late_hourly_rate >= 0)
) ENGINE=InnoDB;

CREATE TABLE rooms (
  room_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  room_type_id INT UNSIGNED NOT NULL,
  room_number VARCHAR(12) NOT NULL UNIQUE,
  is_bookable BOOLEAN NOT NULL DEFAULT TRUE,
  FOREIGN KEY (room_type_id) REFERENCES room_types (room_type_id),
  CHECK (is_bookable IN (0, 1))
) ENGINE=InnoDB;

CREATE TABLE room_rates (
  room_type_id INT UNSIGNED NOT NULL,
  stay_date DATE NOT NULL,
  nightly_rate DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (room_type_id, stay_date),
  FOREIGN KEY (room_type_id) REFERENCES room_types (room_type_id),
  CHECK (nightly_rate > 0)
) ENGINE=InnoDB;

CREATE TABLE bookings (
  booking_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  guest_id BIGINT UNSIGNED NOT NULL,
  booking_code VARCHAR(36) NOT NULL UNIQUE,
  status ENUM('CONFIRMED','IN_HOUSE','DEPARTED','CANCELLED') NOT NULL DEFAULT 'CONFIRMED',
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (guest_id) REFERENCES guests (guest_id),
  CHECK (CHAR_LENGTH(TRIM(booking_code)) > 0)
) ENGINE=InnoDB;

CREATE TABLE booking_rooms (
  booking_room_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT UNSIGNED NOT NULL,
  room_id BIGINT UNSIGNED NOT NULL,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  guest_count TINYINT UNSIGNED NOT NULL,
  extension_rate DECIMAL(12,2) NOT NULL,
  late_hourly_rate DECIMAL(12,2) NOT NULL,
  status ENUM('RESERVED','IN_HOUSE','DEPARTED','REPLACED','CANCELLED','NO_SHOW') NOT NULL DEFAULT 'RESERVED',
  arrived_at DATETIME,
  departed_at DATETIME,
  UNIQUE KEY uq_assignment_room_booking (booking_room_id, room_id, booking_id),
  UNIQUE KEY uq_assignment_booking (booking_room_id, booking_id),
  KEY ix_room_occupancy (room_id, status),
  KEY ix_booking_assignments (booking_id, status),
  FOREIGN KEY (booking_id) REFERENCES bookings (booking_id),
  FOREIGN KEY (room_id) REFERENCES rooms (room_id),
  CHECK (DATEDIFF(check_out, check_in) IS NOT NULL AND DATEDIFF(check_out, check_in) BETWEEN 1 AND 365),
  CHECK (guest_count BETWEEN 1 AND 20),
  CHECK (extension_rate > 0 AND late_hourly_rate >= 0),
  CHECK (
    (status IN ('RESERVED','REPLACED','CANCELLED','NO_SHOW') AND arrived_at IS NULL AND departed_at IS NULL)
    OR (status = 'IN_HOUSE' AND arrived_at IS NOT NULL AND departed_at IS NULL)
    OR (status = 'DEPARTED' AND arrived_at IS NOT NULL AND departed_at IS NOT NULL AND departed_at >= arrived_at)
  )
) ENGINE=InnoDB;

CREATE TABLE room_nights (
  night_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_room_id BIGINT UNSIGNED NOT NULL,
  room_id BIGINT UNSIGNED NOT NULL,
  booking_id BIGINT UNSIGNED NOT NULL,
  stay_date DATE NOT NULL,
  kind ENUM('BOOKED','EXTRA','LATE_HOLD') NOT NULL,
  nightly_rate DECIMAL(12,2) NOT NULL,
  released BOOLEAN NOT NULL DEFAULT FALSE,
  active_room_id BIGINT UNSIGNED GENERATED ALWAYS AS (
    CASE WHEN released = FALSE THEN room_id END
  ) STORED,
  UNIQUE KEY uq_active_room_night (active_room_id, stay_date),
  UNIQUE KEY uq_assignment_night (booking_room_id, stay_date),
  UNIQUE KEY uq_night_booking (night_id, booking_id),
  KEY ix_night_booking (booking_id, released),
  FOREIGN KEY (booking_room_id, room_id, booking_id)
    REFERENCES booking_rooms (booking_room_id, room_id, booking_id),
  CHECK (released IN (0, 1)),
  CHECK ((kind = 'LATE_HOLD' AND nightly_rate = 0) OR (kind IN ('BOOKED','EXTRA') AND nightly_rate > 0))
) ENGINE=InnoDB;

CREATE TABLE services (
  service_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  category VARCHAR(50) NOT NULL,
  price DECIMAL(12,2) NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (price >= 0 AND is_available IN (0, 1))
) ENGINE=InnoDB;

CREATE TABLE service_orders (
  order_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT UNSIGNED NOT NULL,
  booking_room_id BIGINT UNSIGNED NOT NULL,
  order_code VARCHAR(36) NOT NULL UNIQUE,
  status ENUM('ORDERED','PREPARING','DELIVERED','CANCELLED') NOT NULL DEFAULT 'ORDERED',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_order_booking (order_id, booking_id),
  KEY ix_order_assignment_status (booking_room_id, status),
  FOREIGN KEY (booking_room_id, booking_id) REFERENCES booking_rooms (booking_room_id, booking_id),
  CHECK (CHAR_LENGTH(TRIM(order_code)) > 0)
) ENGINE=InnoDB;

CREATE TABLE service_order_items (
  order_item_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  booking_id BIGINT UNSIGNED NOT NULL,
  service_id BIGINT UNSIGNED NOT NULL,
  item_name VARCHAR(100) NOT NULL,
  quantity SMALLINT UNSIGNED NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  UNIQUE KEY uq_service_per_order (order_id, service_id),
  UNIQUE KEY uq_order_item_booking (order_item_id, booking_id),
  FOREIGN KEY (order_id, booking_id) REFERENCES service_orders (order_id, booking_id),
  FOREIGN KEY (service_id) REFERENCES services (service_id),
  CHECK (quantity BETWEEN 1 AND 100 AND unit_price >= 0)
) ENGINE=InnoDB;

CREATE TABLE housekeeping_events (
  event_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  room_id BIGINT UNSIGNED NOT NULL,
  status ENUM('DIRTY','CLEANING','CLEAN','INSPECTED') NOT NULL,
  note VARCHAR(255),
  recorded_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY ix_housekeeping_current (room_id, recorded_at DESC, event_id DESC),
  FOREIGN KEY (room_id) REFERENCES rooms (room_id),
  CHECK (status IN ('DIRTY','CLEANING','CLEAN','INSPECTED'))
) ENGINE=InnoDB;

CREATE TABLE invoices (
  booking_id BIGINT UNSIGNED PRIMARY KEY,
  status ENUM('OPEN','PAYABLE','CLOSED','VOID') NOT NULL DEFAULT 'OPEN',
  opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finalized_at TIMESTAMP NULL,
  closed_at TIMESTAMP NULL,
  FOREIGN KEY (booking_id) REFERENCES bookings (booking_id),
  CHECK (
    (status = 'OPEN' AND finalized_at IS NULL AND closed_at IS NULL)
    OR (status = 'PAYABLE' AND finalized_at IS NOT NULL AND closed_at IS NULL)
    OR (status = 'CLOSED' AND finalized_at IS NOT NULL AND closed_at IS NOT NULL)
    OR (status = 'VOID' AND finalized_at IS NULL AND closed_at IS NOT NULL)
  )
) ENGINE=InnoDB;

CREATE TABLE invoice_items (
  invoice_item_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT UNSIGNED NOT NULL,
  kind ENUM('ROOM','SERVICE','LATE_FEE','SURCHARGE') NOT NULL,
  night_id BIGINT UNSIGNED UNIQUE,
  order_item_id BIGINT UNSIGNED UNIQUE,
  late_booking_room_id BIGINT UNSIGNED UNIQUE,
  charge_ref VARCHAR(80) COLLATE utf8mb4_0900_as_cs UNIQUE,
  description VARCHAR(255) NOT NULL,
  quantity SMALLINT UNSIGNED NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  line_total DECIMAL(19,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  FOREIGN KEY (booking_id) REFERENCES invoices (booking_id),
  FOREIGN KEY (night_id, booking_id) REFERENCES room_nights (night_id, booking_id),
  FOREIGN KEY (order_item_id, booking_id) REFERENCES service_order_items (order_item_id, booking_id),
  FOREIGN KEY (late_booking_room_id, booking_id) REFERENCES booking_rooms (booking_room_id, booking_id),
  CHECK (quantity > 0 AND unit_price >= 0),
  CHECK ((kind = 'SURCHARGE' AND charge_ref IS NOT NULL) OR (kind <> 'SURCHARGE' AND charge_ref IS NULL)),
  CHECK (
    (kind = 'ROOM' AND night_id IS NOT NULL AND order_item_id IS NULL AND late_booking_room_id IS NULL)
    OR (kind = 'SERVICE' AND night_id IS NULL AND order_item_id IS NOT NULL AND late_booking_room_id IS NULL)
    OR (kind = 'LATE_FEE' AND night_id IS NULL AND order_item_id IS NULL AND late_booking_room_id IS NOT NULL)
    OR (kind = 'SURCHARGE' AND night_id IS NULL AND order_item_id IS NULL AND late_booking_room_id IS NULL)
  )
) ENGINE=InnoDB;

CREATE TABLE payments (
  payment_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT UNSIGNED NOT NULL,
  order_id BIGINT UNSIGNED,
  kind ENUM('DEPOSIT','SERVICE','BALANCE','REFUND') NOT NULL,
  method ENUM('CASH','CARD','TRANSFER','EWALLET') NOT NULL,
  amount DECIMAL(19,2) NOT NULL,
  payment_ref VARCHAR(80) COLLATE utf8mb4_0900_as_cs NOT NULL UNIQUE,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES invoices (booking_id),
  FOREIGN KEY (order_id, booking_id) REFERENCES service_orders (order_id, booking_id),
  KEY ix_payments_booking_kind (booking_id, kind),
  CHECK (amount > 0 AND CHAR_LENGTH(TRIM(payment_ref)) > 0),
  CHECK (method IN ('CASH','CARD','TRANSFER','EWALLET')),
  CHECK ((kind = 'SERVICE' AND order_id IS NOT NULL)
         OR (kind IN ('DEPOSIT','BALANCE','REFUND') AND order_id IS NULL))
) ENGINE=InnoDB;
