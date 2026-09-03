// ============================================================
// setup-database.js — run this ONCE from your own machine to set
// up your cloud database (TiDB Cloud or similar) cleanly, instead
// of fighting with a browser-based SQL editor's session quirks.
//
// It: creates the `campusgo` database if it doesn't exist, then
// runs the full schema.sql against it in ONE persistent connection
// (so table creation and the USE context stay consistent the whole
// way through — no separate "runs" that might reset session state).
//
// Usage:
//   1. npm install mysql2 dotenv   (skip if already installed)
//   2. Put schema.sql in this same folder.
//   3. Create a .env file here with:
//        DB_HOST=gateway01.eu-central-1.prod.aws.tidbcloud.com
//        DB_PORT=4000
//        DB_USER=your_username
//        DB_PASSWORD=your_password
//   4. node setup-database.js
// ============================================================

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const DB_NAME = process.env.DB_NAME || "campusgo";

async function main() {
  const required = ["DB_HOST", "DB_USER", "DB_PASSWORD"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`Missing required .env values: ${missing.join(", ")}`);
    console.error("Create a .env file in this folder with your TiDB Cloud connection details first.");
    process.exit(1);
  }

  const schemaPath = path.join(__dirname, "schema.sql");
  if (!fs.existsSync(schemaPath)) {
    console.error(`Couldn't find schema.sql in ${__dirname} — put it in this same folder.`);
    process.exit(1);
  }
  const schemaSql = fs.readFileSync(schemaPath, "utf8");

  console.log(`Connecting to ${process.env.DB_HOST}:${process.env.DB_PORT || 4000}...`);
  // No `database` here yet — we may need to create it first.
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 4000,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    multipleStatements: true, // lets us run schema.sql's many statements in one go
  });
  console.log("Connected.");

  console.log(`Creating database \`${DB_NAME}\` if it doesn't already exist...`);
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`;`);
  await connection.query(`USE \`${DB_NAME}\`;`);
  console.log(`Using \`${DB_NAME}\`.`);

  console.log("Running schema.sql (this drops and recreates all tables — fine for a fresh database)...");
  await connection.query(schemaSql);
  console.log("schema.sql finished.");

  const [tables] = await connection.query("SHOW TABLES;");
  console.log(`\n✅ Done. ${tables.length} tables now exist in \`${DB_NAME}\`:`);
  tables.forEach((row) => console.log(" -", Object.values(row)[0]));

  await connection.end();
}

main().catch((err) => {
  console.error("\n❌ Setup failed:", err.message);
  process.exit(1);
});
