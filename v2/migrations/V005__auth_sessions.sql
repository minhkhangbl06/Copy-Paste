USE hotel_guest_service_v2;

CREATE TABLE auth_sessions (
  token_hash BINARY(32) PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  expires_at DATETIME(6) NOT NULL,
  KEY ix_session_expiry (expires_at),
  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE auth_rate_limits (
  bucket_key BINARY(32) NOT NULL,
  window_start BIGINT UNSIGNED NOT NULL,
  hits INT UNSIGNED NOT NULL,
  PRIMARY KEY (bucket_key, window_start),
  KEY ix_rate_window (window_start)
) ENGINE=InnoDB;

CREATE ROLE IF NOT EXISTS 'hotel_v2_api'@'%';
GRANT SELECT (user_id, role_code, email, password_hash, full_name, is_active),
      INSERT (role_code, email, password_hash, full_name), UPDATE (last_login_at)
  ON hotel_guest_service_v2.users TO 'hotel_v2_api'@'%';
GRANT SELECT (guest_id, user_id), INSERT (full_name, email, user_id)
  ON hotel_guest_service_v2.guests TO 'hotel_v2_api'@'%';
GRANT SELECT (booking_id, booking_code, guest_id, status)
  ON hotel_guest_service_v2.bookings TO 'hotel_v2_api'@'%';
GRANT SELECT (task_id, room_id, assigned_to, task_type, status)
  ON hotel_guest_service_v2.housekeeping_tasks TO 'hotel_v2_api'@'%';
GRANT SELECT (order_id, order_code, assigned_to, status)
  ON hotel_guest_service_v2.service_orders TO 'hotel_v2_api'@'%';
GRANT SELECT (notification_id, user_id, title, body, read_at)
  ON hotel_guest_service_v2.notifications TO 'hotel_v2_api'@'%';
GRANT SELECT, INSERT (user_id, action, entity_type, entity_id)
  ON hotel_guest_service_v2.audit_logs TO 'hotel_v2_api'@'%';
GRANT SELECT, INSERT, DELETE ON hotel_guest_service_v2.auth_sessions TO 'hotel_v2_api'@'%';
GRANT SELECT, INSERT, UPDATE ON hotel_guest_service_v2.auth_rate_limits TO 'hotel_v2_api'@'%';
