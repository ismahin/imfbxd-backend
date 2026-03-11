import "dotenv/config";
import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";

async function migrate() {
  const dbName = process.env.DB_NAME ?? "imf_db";
  console.log("Connecting to MySQL...");
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
  });
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log("Database OK:", dbName);
    await conn.query(`USE \`${dbName}\``);

    const schemaPath = path.join(process.cwd(), "src/db/schema.sql");
    if (!fs.existsSync(schemaPath)) {
      throw new Error("Schema file not found: " + schemaPath);
    }
    const sql = fs.readFileSync(schemaPath, "utf-8");
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (stmt) {
        console.log("Running statement", i + 1, "...");
        await conn.query(stmt);
      }
    }
    console.log("Migration completed. Table 'members' should exist.");
  } finally {
    await conn.end();
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
