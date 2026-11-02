CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  full_name VARCHAR(160) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  member_type ENUM('student', 'employee') NOT NULL DEFAULT 'student',
  phone VARCHAR(40) NULL,
  student_id VARCHAR(60) NULL,
  employee_id VARCHAR(60) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rooms (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  location VARCHAR(160) NOT NULL,
  capacity INT UNSIGNED NOT NULL,
  description TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX rooms_name_idx (name)
);

CREATE TABLE IF NOT EXISTS bookings (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  room_id CHAR(36) NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  purpose VARCHAR(1000) NOT NULL,
  status ENUM('pending', 'approved', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
  cancellation_reason VARCHAR(500) NULL,
  auto_approval_reason VARCHAR(255) NULL,
  checkin_token CHAR(64) NOT NULL,
  checked_in_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT bookings_user_fk FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT bookings_room_fk FOREIGN KEY (room_id) REFERENCES rooms(id),
  INDEX bookings_room_schedule_idx (room_id, status, start_time, end_time),
  INDEX bookings_user_schedule_idx (user_id, start_time),
  INDEX bookings_no_show_idx (status, start_time, checked_in_at)
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash CHAR(64) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT password_reset_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX password_reset_expiry_idx (expires_at)
);

CREATE TABLE IF NOT EXISTS revoked_tokens (
  token_id CHAR(36) PRIMARY KEY,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX revoked_token_expiry_idx (expires_at)
);
