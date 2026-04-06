import pool from "./pool.js";

type SchemaConnection = {
  query: (sql: string, values?: unknown[]) => Promise<unknown>;
};

const RETRYABLE_SCHEMA_CODES = new Set(["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"]);

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSchemaQuery(conn: SchemaConnection, sql: string, values?: unknown[]): Promise<void> {
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await conn.query(sql, values);
      return;
    } catch (e: unknown) {
      const code =
        e && typeof e === "object" && "code" in e && typeof (e as { code?: unknown }).code === "string"
          ? (e as { code: string }).code
          : "";
      if (RETRYABLE_SCHEMA_CODES.has(code) && attempt < maxAttempts) {
        console.warn(`Schema query retry ${attempt}/${maxAttempts - 1} after ${code}: ${sql}`);
        await delay(250 * attempt);
        continue;
      }
      throw e;
    }
  }
}

const CREATE_MEMBERS_TABLE = `
CREATE TABLE IF NOT EXISTS members (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid CHAR(36) NOT NULL UNIQUE,
  user_id VARCHAR(20) NOT NULL UNIQUE,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`.trim();

const MEMBER_COLUMNS = [
  "ADD COLUMN nid_number VARCHAR(100) DEFAULT NULL AFTER phone",
  "ADD COLUMN date_of_birth DATE DEFAULT NULL AFTER nid_number",
  "ADD COLUMN nominee_nid_number VARCHAR(100) DEFAULT NULL AFTER nominee_phone",
  "ADD COLUMN nominee_account_number VARCHAR(100) DEFAULT NULL AFTER nominee_nid_number",
  "ADD COLUMN nominee_date_of_birth DATE DEFAULT NULL AFTER nominee_account_number",
];

const CREATE_DEPOSITS_TABLE = `
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`.trim();

const DEPOSIT_COLUMNS = [
  "ADD COLUMN proof_image VARCHAR(500) DEFAULT NULL AFTER status",
];

const CREATE_GALLERY_TABLE = `
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`.trim();

const CREATE_BOARD_MEMBERS_TABLE = `
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`.trim();

const CREATE_MESSAGES_TABLE = `
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`.trim();

const CREATE_RULES_TABLE = `
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`.trim();

const CREATE_NOTIFICATIONS_TABLE = `
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`.trim();

const CREATE_NOTIFICATION_RECIPIENTS_TABLE = `
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`.trim();

const CREATE_SITE_SETTINGS_TABLE = `
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`.trim();

const LOGO_COLUMNS = [
  "ADD COLUMN primary_logo VARCHAR(500) DEFAULT NULL",
  "ADD COLUMN favicon VARCHAR(500) DEFAULT NULL",
  "ADD COLUMN logo_alt_text VARCHAR(255) DEFAULT NULL",
  "ADD COLUMN show_logo_text TINYINT(1) NOT NULL DEFAULT 1",
  "ADD COLUMN logo_text VARCHAR(255) DEFAULT NULL",
  "ADD COLUMN hero_slider_interval INT UNSIGNED DEFAULT NULL",
  "ADD COLUMN why_imf_title VARCHAR(255) DEFAULT NULL",
  "ADD COLUMN why_imf_subtitle VARCHAR(255) DEFAULT NULL",
  "ADD COLUMN why_imf_text TEXT DEFAULT NULL",
];

export async function ensureMembersTable(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await runSchemaQuery(conn, CREATE_MEMBERS_TABLE);
    for (const def of MEMBER_COLUMNS) {
      try {
        await runSchemaQuery(conn, `ALTER TABLE members ${def}`);
      } catch (e: unknown) {
        if (e && typeof e === "object" && "code" in e && (e as { code: string }).code !== "ER_DUP_FIELDNAME") {
          throw e;
        }
      }
    }
    console.log("Members table ready.");
  } catch (err) {
    console.error("Failed to ensure members table:", err);
    throw err;
  } finally {
    conn.release();
  }
}

export async function ensureDepositsTable(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await runSchemaQuery(conn, CREATE_DEPOSITS_TABLE);
    for (const def of DEPOSIT_COLUMNS) {
      try {
        await runSchemaQuery(conn, `ALTER TABLE deposits ${def}`);
      } catch (e: unknown) {
        if (e && typeof e === "object" && "code" in e && (e as { code: string }).code !== "ER_DUP_FIELDNAME") {
          throw e;
        }
      }
    }
    console.log("Deposits table ready.");
  } catch (err) {
    console.error("Failed to ensure deposits table:", err);
    throw err;
  } finally {
    conn.release();
  }
}

export async function ensureGalleryTable(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await runSchemaQuery(conn, CREATE_GALLERY_TABLE);
    await runSchemaQuery(conn, `
      UPDATE gallery
      SET category = CASE
        WHEN LOWER(TRIM(category)) = 'hero' THEN 'Hero'
        WHEN LOWER(TRIM(category)) IN ('objectives', 'objective', 'aims', 'aims & objectives', 'aims and objectives') THEN 'Objectives'
        WHEN LOWER(TRIM(category)) = 'gallery' THEN 'Gallery'
        ELSE 'Gallery'
      END
    `);
    await runSchemaQuery(
      conn,
      "ALTER TABLE gallery MODIFY COLUMN category VARCHAR(50) NOT NULL DEFAULT 'Gallery'"
    );
    console.log("Gallery table ready.");
  } catch (err) {
    console.error("Failed to ensure gallery table:", err);
    throw err;
  } finally {
    conn.release();
  }
}

export async function ensureBoardMembersTable(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await runSchemaQuery(conn, CREATE_BOARD_MEMBERS_TABLE);
    console.log("Board members table ready.");
  } catch (err) {
    console.error("Failed to ensure board_members table:", err);
    throw err;
  } finally {
    conn.release();
  }
}

export async function ensureMessagesTable(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await runSchemaQuery(conn, CREATE_MESSAGES_TABLE);
    console.log("Messages table ready.");
  } catch (err) {
    console.error("Failed to ensure messages table:", err);
    throw err;
  } finally {
    conn.release();
  }
}

export async function ensureRulesTable(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await runSchemaQuery(conn, CREATE_RULES_TABLE);
    console.log("Rules table ready.");
  } catch (err) {
    console.error("Failed to ensure rules table:", err);
    throw err;
  } finally {
    conn.release();
  }
}

export async function ensureNotificationsTable(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await runSchemaQuery(conn, CREATE_NOTIFICATIONS_TABLE);
    await runSchemaQuery(conn, CREATE_NOTIFICATION_RECIPIENTS_TABLE);
    console.log("Notifications tables ready.");
  } catch (err) {
    console.error("Failed to ensure notifications tables:", err);
    throw err;
  } finally {
    conn.release();
  }
}

export async function ensureSiteSettingsTable(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await runSchemaQuery(conn, CREATE_SITE_SETTINGS_TABLE);
    await runSchemaQuery(
      conn,
      "INSERT IGNORE INTO site_settings (id) VALUES (1)"
    );
    for (const def of LOGO_COLUMNS) {
      try {
        await runSchemaQuery(conn, `ALTER TABLE site_settings ${def}`);
      } catch (e: unknown) {
        if (e && typeof e === "object" && "code" in e && (e as { code: string }).code !== "ER_DUP_FIELDNAME") {
          throw e;
        }
      }
    }
    console.log("Site settings table ready.");
  } catch (err) {
    console.error("Failed to ensure site_settings table:", err);
    throw err;
  } finally {
    conn.release();
  }
}
