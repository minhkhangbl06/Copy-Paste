USE hotel_guest_service_v2;

CREATE TABLE roles (
  role_code VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  description VARCHAR(160) NOT NULL
) ENGINE=InnoDB;

INSERT INTO roles (role_code, description) VALUES
  ('GUEST', 'Access own guest records'),
  ('RECEPTIONIST', 'Access front desk records'),
  ('ADMIN', 'Access staff workspaces and audit'),
  ('HOUSEKEEPING', 'Access own housekeeping tasks'),
  ('SERVICE_STAFF', 'Access own service assignments');

CREATE TABLE users (
  user_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role_code VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  email VARCHAR(254) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  password_hash VARCHAR(255) CHARACTER SET ascii NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(30),
  national_id VARCHAR(50),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at DATETIME(6),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  FOREIGN KEY (role_code) REFERENCES roles (role_code)
) ENGINE=InnoDB;

ALTER TABLE guests
  ADD COLUMN user_id BIGINT UNSIGNED UNIQUE,
  ADD COLUMN identity_number VARCHAR(50) UNIQUE,
  ADD COLUMN phone VARCHAR(30),
  ADD COLUMN address VARCHAR(255),
  ADD FOREIGN KEY (user_id) REFERENCES users (user_id);

ALTER TABLE room_types
  ADD COLUMN description TEXT,
  ADD COLUMN bed_count TINYINT UNSIGNED,
  ADD COLUMN bed_type VARCHAR(50),
  ADD COLUMN area_sqm DECIMAL(8,2) CHECK (area_sqm > 0),
  ADD COLUMN amenities JSON;

ALTER TABLE rooms
  ADD COLUMN floor SMALLINT,
  ADD COLUMN notes TEXT;

ALTER TABLE services
  ADD COLUMN description TEXT,
  ADD COLUMN unit VARCHAR(40);

ALTER TABLE bookings
  ADD COLUMN created_by BIGINT UNSIGNED,
  ADD COLUMN special_requests TEXT,
  ADD UNIQUE KEY uq_booking_guest (booking_id, guest_id),
  ADD FOREIGN KEY (created_by) REFERENCES users (user_id);

ALTER TABLE service_orders
  ADD COLUMN requested_by BIGINT UNSIGNED,
  ADD COLUMN assigned_to BIGINT UNSIGNED,
  ADD FOREIGN KEY (requested_by) REFERENCES users (user_id),
  ADD FOREIGN KEY (assigned_to) REFERENCES users (user_id);

ALTER TABLE payments
  ADD COLUMN processed_by BIGINT UNSIGNED,
  ADD FOREIGN KEY (processed_by) REFERENCES users (user_id);

CREATE TABLE housekeeping_tasks (
  task_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  room_id BIGINT UNSIGNED NOT NULL,
  assigned_to BIGINT UNSIGNED,
  confirmed_by BIGINT UNSIGNED,
  task_type ENUM('CLEANING','INSPECTION') NOT NULL,
  status ENUM('PENDING','IN_PROGRESS','COMPLETED','CONFIRMED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  notes VARCHAR(255),
  scheduled_at DATETIME(6),
  started_at DATETIME(6),
  completed_at DATETIME(6),
  confirmed_at DATETIME(6),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_housekeeping_task_room (task_id, room_id),
  FOREIGN KEY (room_id) REFERENCES rooms (room_id),
  FOREIGN KEY (assigned_to) REFERENCES users (user_id),
  FOREIGN KEY (confirmed_by) REFERENCES users (user_id)
) ENGINE=InnoDB;

ALTER TABLE housekeeping_events
  ADD COLUMN task_id BIGINT UNSIGNED,
  ADD COLUMN changed_by BIGINT UNSIGNED,
  ADD COLUMN old_status ENUM('DIRTY','CLEANING','CLEAN','INSPECTED'),
  ADD FOREIGN KEY (task_id, room_id) REFERENCES housekeeping_tasks (task_id, room_id),
  ADD FOREIGN KEY (changed_by) REFERENCES users (user_id);

CREATE TABLE reviews (
  review_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT UNSIGNED NOT NULL UNIQUE,
  guest_id BIGINT UNSIGNED NOT NULL,
  overall_rating TINYINT UNSIGNED NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  cleanliness_rating TINYINT UNSIGNED CHECK (cleanliness_rating BETWEEN 1 AND 5),
  service_rating TINYINT UNSIGNED CHECK (service_rating BETWEEN 1 AND 5),
  value_rating TINYINT UNSIGNED CHECK (value_rating BETWEEN 1 AND 5),
  comment TEXT,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  FOREIGN KEY (booking_id, guest_id) REFERENCES bookings (booking_id, guest_id)
) ENGINE=InnoDB;

CREATE TABLE notifications (
  notification_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(50) NOT NULL,
  channel ENUM('IN_APP','EMAIL','SMS') NOT NULL DEFAULT 'IN_APP',
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  metadata JSON,
  read_at DATETIME(6),
  sent_at DATETIME(6),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (user_id) REFERENCES users (user_id)
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  log_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED,
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id BIGINT UNSIGNED,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (user_id) REFERENCES users (user_id)
) ENGINE=InnoDB;
