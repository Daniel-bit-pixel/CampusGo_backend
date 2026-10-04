// ============================================================
// run-migration.js — runs a single migration .sql file against your
// existing database, reusing the same reliable connection approach
// as setup-database.js (a real persistent connection, not a browser
// SQL editor).
//
// Unlike setup-database.js, this does NOT drop/recreate anything —
// migration files only ALTER/CREATE additively, so this is safe to
// run against a database that already has real data in it.
//
// Usage:
//   node run-migration.js schema_update_payments.sql
// ============================================================

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const DB_NAME = process.env.DB_NAME || "campusgo";

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error("Usage: node run-migration.js <migration-file.sql>");
    process.exit(1);
  }
  const filePath = path.join(__dirname, fileArg);
  if (!fs.existsSync(filePath)) {
    console.error(`Couldn't find ${fileArg} in ${__dirname}`);
    process.exit(1);
  }

  const required = ["DB_HOST", "DB_USER", "DB_PASSWORD"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`Missing required .env values: ${missing.join(", ")}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(filePath, "utf8");

  console.log(`Connecting to ${process.env.DB_HOST}:${process.env.DB_PORT || 4000}, database \`${DB_NAME}\`...`);
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 4000,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: DB_NAME,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: false },
    multipleStatements: true,
  });
  console.log("Connected.");

  console.log(`Running ${fileArg}...`);
  await connection.query(sql);
  console.log(`✅ Done. ${fileArg} applied successfully.`);

  const [tables] = await connection.query("SHOW TABLES;");
  console.log(`\n\`${DB_NAME}\` now has ${tables.length} tables:`);
  tables.forEach((row) => console.log(" -", Object.values(row)[0]));

  await connection.end();
}

main().catch((err) => {
  console.error("\n❌ Migration failed:", err.message);
  process.exit(1);
});
