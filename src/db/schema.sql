-- IMF Members table (production-grade)
CREATE TABLE IF NOT EXISTS members (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid CHAR(36) NOT NULL UNIQUE,
  user_id VARCHAR(20) NOT NULL UNIQUE COMMENT 'Display ID e.g. IMF00001',
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) DEFAULT NULL,
  nid_number VARCHAR(100) DEFAULT NULL,
  date_of_birth DATE DEFAULT NULL,
  account_number VARCHAR(50) DEFAULT NULL,
  beneficiary_ref_id VARCHAR(100) DEFAULT NULL,
  nominee_name VARCHAR(255) DEFAULT NULL,
  nominee_phone VARCHAR(50) DEFAULT NULL,
  nominee_nid_number VARCHAR(100) DEFAULT NULL,
  nominee_account_number VARCHAR(100) DEFAULT NULL,
  nominee_date_of_birth DATE DEFAULT NULL,
  current_address TEXT DEFAULT NULL,
  permanent_address TEXT DEFAULT NULL,
  nominee_address TEXT DEFAULT NULL,
  profile_picture VARCHAR(500) DEFAULT NULL,
  user_type ENUM('Admin', 'Member') NOT NULL DEFAULT 'Member',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  joining_date DATE DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_user_id (user_id),
  INDEX idx_uuid (uuid),
  INDEX idx_is_active (is_active),
  INDEX idx_joining_date (joining_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS deposits (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid CHAR(36) NOT NULL UNIQUE,
  member_uuid CHAR(36) NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  channel VARCHAR(50) NOT NULL DEFAULT 'Cash',
  deposit_date DATE NOT NULL,
  status ENUM('Completed', 'Pending', 'Failed') NOT NULL DEFAULT 'Completed',
  proof_image VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_member_uuid (member_uuid),
  INDEX idx_deposit_date (deposit_date),
  INDEX idx_uuid (uuid),
  FOREIGN KEY (member_uuid) REFERENCES members(uuid) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gallery (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid CHAR(36) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'Gallery',
  date DATE DEFAULT NULL,
  image_path VARCHAR(500) NOT NULL,
  alt VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_uuid (uuid),
  INDEX idx_category (category),
  INDEX idx_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS board_members (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid CHAR(36) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(100) NOT NULL,
  phone VARCHAR(50) DEFAULT NULL,
  email VARCHAR(254) DEFAULT NULL,
  since VARCHAR(20) DEFAULT NULL,
  bio TEXT DEFAULT NULL,
  display_order INT NOT NULL DEFAULT 0,
  district VARCHAR(100) DEFAULT NULL,
  profile_picture VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_uuid (uuid),
  INDEX idx_display_order (display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid CHAR(36) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(254) NOT NULL,
  website VARCHAR(500) DEFAULT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_uuid (uuid),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rules (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid CHAR(36) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_uuid (uuid),
  INDEX idx_display_order (display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid CHAR(36) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type ENUM('General', 'Reminder', 'Alert', 'Notice') NOT NULL DEFAULT 'General',
  recipient_scope ENUM('all', 'active', 'inactive', 'custom') NOT NULL DEFAULT 'all',
  recipient_label VARCHAR(255) NOT NULL,
  recipient_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_by_uuid CHAR(36) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_uuid (uuid),
  INDEX idx_created_at (created_at),
  INDEX idx_recipient_scope (recipient_scope),
  INDEX idx_created_by_uuid (created_by_uuid),
  FOREIGN KEY (created_by_uuid) REFERENCES members(uuid) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_recipients (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid CHAR(36) NOT NULL UNIQUE,
  notification_uuid CHAR(36) NOT NULL,
  member_uuid CHAR(36) NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  read_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_uuid (uuid),
  INDEX idx_notification_uuid (notification_uuid),
  INDEX idx_member_uuid (member_uuid),
  INDEX idx_member_is_read (member_uuid, is_read),
  UNIQUE KEY uniq_notification_member (notification_uuid, member_uuid),
  FOREIGN KEY (notification_uuid) REFERENCES notifications(uuid) ON DELETE CASCADE,
  FOREIGN KEY (member_uuid) REFERENCES members(uuid) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_settings (
  id INT UNSIGNED PRIMARY KEY DEFAULT 1,
  org_name VARCHAR(255) DEFAULT 'IMF-BD',
  reg_no VARCHAR(100) DEFAULT NULL,
  contact_email VARCHAR(254) DEFAULT NULL,
  contact_phone VARCHAR(50) DEFAULT NULL,
  website VARCHAR(500) DEFAULT NULL,
  address TEXT DEFAULT NULL,
  contact_uae_address TEXT DEFAULT NULL,
  contact_uae_phone VARCHAR(50) DEFAULT NULL,
  contact_bd_address TEXT DEFAULT NULL,
  contact_bd_phone VARCHAR(50) DEFAULT NULL,
  footer_email VARCHAR(254) DEFAULT NULL,
  footer_phone VARCHAR(50) DEFAULT NULL,
  facebook_url VARCHAR(500) DEFAULT NULL,
  twitter_url VARCHAR(500) DEFAULT NULL,
  instagram_url VARCHAR(500) DEFAULT NULL,
  linkedin_url VARCHAR(500) DEFAULT NULL,
  primary_logo VARCHAR(500) DEFAULT NULL,
  favicon VARCHAR(500) DEFAULT NULL,
  logo_alt_text VARCHAR(255) DEFAULT NULL,
  show_logo_text TINYINT(1) NOT NULL DEFAULT 1,
  logo_text VARCHAR(255) DEFAULT NULL,
  hero_slider_interval INT UNSIGNED DEFAULT NULL,
  why_imf_title VARCHAR(255) DEFAULT NULL,
  why_imf_subtitle VARCHAR(255) DEFAULT NULL,
  why_imf_text TEXT DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT single_row CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
