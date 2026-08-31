// ============================================================
// CampusGo — server.js
// Express + mysql2, matching schema.sql (MySQL / phpMyAdmin).
// ============================================================

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const mysql = require("mysql2/promise");
const { OAuth2Client } = require("google-auth-library");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// Must match GOOGLE_CLIENT_ID in App.js exactly — this is the
// "audience" Google checks the ID token was issued for.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
if (!GOOGLE_CLIENT_ID) {
  console.warn("⚠️  GOOGLE_CLIENT_ID is not set in .env — Google sign-in will always fail.");
}
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

if (!ADMIN_PASSWORD) {
  console.warn("⚠️  ADMIN_PASSWORD is not set in .env — admin login will always fail.");
}

// ---------------- DB pool ----------------
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "campusgo",
  waitForConnections: true,
  connectionLimit: 10,
});

// ---------------- Admin auth (in-memory tokens) ----------------
// Simple, no-frills token store: fine for a single-instance dev/school
// project. Swap for signed JWTs or a sessions table if you deploy this
// for real, since tokens here vanish on server restart and there's no
// expiry.
const adminTokens = new Set();

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : req.headers["x-admin-token"];
  if (!token || !adminTokens.has(token)) {
    return res.status(401).json({ error: "Admin authentication required" });
  }
  next();
}

// ---------------- Helpers ----------------
function asyncRoute(fn) {
  return (req, res) => fn(req, res).catch((err) => {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  });
}

// Builds simple GET-all / GET-one / POST / PUT / DELETE routes for a
// table. `allowedFields` whitelists which body fields get written on
// POST/PUT, so nobody can inject columns that don't belong.
//
// `options.ownerField`, when set (e.g. "vendor_name" for the catalog
// tables), turns on ownership enforcement — but ONLY for requests
// that identify as a vendor (an X-Vendor-Name header is present).
// Requests with no X-Vendor-Name header (like the admin dashboard,
// which never sends one) are treated as admin requests: full access,
// including reading/writing the owner field directly via the request
// body. This is what lets an admin claim/reassign "unclaimed" items
// (owner = NULL) that no vendor could ever touch through their own
// ownership-checked path.
//
//   - POST: with the header → stamps the new row's owner from
//     X-Vendor-Name (a client can't claim to be a different vendor
//     than the header it sent). Without the header → owner comes from
//     the request body if present (admin can leave it blank/NULL to
//     keep an item unclaimed).
//   - PUT/DELETE: with the header → looks up the existing row and
//     requires its owner to match (case-insensitive) before allowing
//     the write; the owner field itself can't be changed this way.
//     Without the header → no ownership check, and the owner field
//     can be reassigned via PUT like any other field.
function registerCrudRoutes(path, table, allowedFields, options = {}) {
  const ownerField = options.ownerField || null;

  function callerVendorName(req) {
    return (req.headers["x-vendor-name"] || "").trim();
  }

  // GET all (public)
  app.get(`/api/${path}`, asyncRoute(async (req, res) => {
    const [rows] = await pool.query(`SELECT * FROM ${table} ORDER BY id`);
    res.json(rows);
  }));

  // GET one (public)
  app.get(`/api/${path}/:id`, asyncRoute(async (req, res) => {
    const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: `${table} row not found` });
    res.json(rows[0]);
  }));

  // POST (admin token required always; vendor identity optional)
  app.post(`/api/${path}`, requireAdmin, asyncRoute(async (req, res) => {
    const fields = allowedFields.filter((f) => req.body[f] !== undefined && f !== ownerField);
    const values = fields.map((f) => req.body[f]);

    if (ownerField) {
      const vendorName = callerVendorName(req);
      if (vendorName) {
        // Acting as a specific vendor — stamp ownership from the header.
        fields.push(ownerField);
        values.push(vendorName);
      } else if (req.body[ownerField] !== undefined) {
        // Acting as admin — trust an explicit value in the body
        // (including "" / null, to leave the item unclaimed).
        fields.push(ownerField);
        values.push(req.body[ownerField] || null);
      }
    }

    if (fields.length === 0) return res.status(400).json({ error: "No valid fields provided" });
    const placeholders = fields.map(() => "?").join(", ");
    const [result] = await pool.query(
      `INSERT INTO ${table} (${fields.join(", ")}) VALUES (${placeholders})`,
      values
    );
    const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [result.insertId]);
    res.status(201).json(rows[0]);
  }));

  // PUT (admin token required always; ownership only enforced when
  // acting as a specific vendor)
  app.put(`/api/${path}/:id`, requireAdmin, asyncRoute(async (req, res) => {
    const vendorName = ownerField ? callerVendorName(req) : "";

    if (ownerField && vendorName) {
      const [existing] = await pool.query(`SELECT ${ownerField} FROM ${table} WHERE id = ?`, [req.params.id]);
      if (existing.length === 0) return res.status(404).json({ error: `${table} row not found` });
      const owner = existing[0][ownerField];
      if (!owner || owner.toLowerCase() !== vendorName.toLowerCase()) {
        return res.status(403).json({ error: "You can only edit items that belong to your own business" });
      }
    }

    // A vendor (header present) can't silently change who owns the
    // item through this endpoint; an admin (no header) can.
    const fields = allowedFields.filter((f) => req.body[f] !== undefined && !(f === ownerField && vendorName));
    if (fields.length === 0) return res.status(400).json({ error: "No valid fields provided" });
    const setClause = fields.map((f) => `${f} = ?`).join(", ");
    const values = fields.map((f) => req.body[f]);
    const [result] = await pool.query(
      `UPDATE ${table} SET ${setClause} WHERE id = ?`,
      [...values, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: `${table} row not found` });
    const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
    res.json(rows[0]);
  }));

  // DELETE (admin token required always; ownership only enforced when
  // acting as a specific vendor)
  app.delete(`/api/${path}/:id`, requireAdmin, asyncRoute(async (req, res) => {
    if (ownerField) {
      const vendorName = callerVendorName(req);
      if (vendorName) {
        const [existing] = await pool.query(`SELECT ${ownerField} FROM ${table} WHERE id = ?`, [req.params.id]);
        if (existing.length === 0) return res.status(404).json({ error: `${table} row not found` });
        const owner = existing[0][ownerField];
        if (!owner || owner.toLowerCase() !== vendorName.toLowerCase()) {
          return res.status(403).json({ error: "You can only delete items that belong to your own business" });
        }
      }
      // else: no header — admin request, full access, including
      // deleting unclaimed items no vendor could ever remove.
    }
    const [result] = await pool.query(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: `${table} row not found` });
    res.status(204).send();
  }));
}

// ================= Auth: users =================

app.post("/api/register", asyncRoute(async (req, res) => {
  const { full_name, email, password } = req.body;
  if (!full_name || !email || !password) {
    return res.status(400).json({ error: "full_name, email, and password are required" });
  }

  const [existing] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
  if (existing.length > 0) {
    return res.status(409).json({ error: "An account with that email already exists" });
  }

  const password_hash = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    "INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)",
    [full_name, email, password_hash]
  );

  res.status(201).json({ id: result.insertId, full_name, email });
}));

app.post("/api/login", asyncRoute(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
  if (rows.length === 0) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const user = rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  res.json({ id: user.id, full_name: user.full_name, email: user.email });
}));

// ================= Auth: Google =================
// Requires the schema_update_google_auth.sql migration to have been
// run (adds google_id, auth_provider, email_verified, avatar_url to
// `users`, and makes password_hash nullable).
app.post("/api/auth/google", asyncRoute(async (req, res) => {
  const { credential, hostel } = req.body;
  if (!credential) {
    return res.status(400).json({ error: "Missing Google credential" });
  }
  if (!GOOGLE_CLIENT_ID) {
    return res.status(500).json({ error: "Server is missing GOOGLE_CLIENT_ID configuration" });
  }

  // Verify the ID token server-side — never trust a client-supplied
  // payload directly. This throws if the token is expired, malformed,
  // or wasn't issued for our GOOGLE_CLIENT_ID.
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch (err) {
    return res.status(401).json({ error: "Invalid Google credential" });
  }

  const { sub: googleId, email, name, picture, email_verified } = payload;

  // 1. Already linked by google_id — this is a returning Google user.
  let [rows] = await pool.query("SELECT * FROM users WHERE google_id = ?", [googleId]);
  if (rows.length > 0) {
    return res.json({ user: toUserJson(rows[0]), isNewUser: false });
  }

  // 2. An account with this email exists from local signup — link it
  //    so they can use either method going forward.
  [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
  if (rows.length > 0) {
    const existing = rows[0];
    await pool.query(
      "UPDATE users SET google_id = ?, auth_provider = 'google', email_verified = ?, avatar_url = ? WHERE id = ?",
      [googleId, email_verified ? 1 : 0, picture || null, existing.id]
    );
    return res.json({ user: toUserJson({ ...existing, google_id: googleId, avatar_url: picture }), isNewUser: false });
  }

  // 3. Brand-new user.
  const [result] = await pool.query(
    "INSERT INTO users (full_name, email, google_id, auth_provider, email_verified, avatar_url) VALUES (?, ?, ?, 'google', ?, ?)",
    [name || "Student", email, googleId, email_verified ? 1 : 0, picture || null]
  );
  const [newRows] = await pool.query("SELECT * FROM users WHERE id = ?", [result.insertId]);
  res.status(201).json({ user: toUserJson(newRows[0]), isNewUser: true, hostel: hostel || null });
}));

function toUserJson(row) {
  return { id: row.id, full_name: row.full_name, email: row.email, avatar_url: row.avatar_url || null };
}

// ================= Auth: admin =================

app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;
  if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid admin password" });
  }
  const token = crypto.randomBytes(32).toString("hex");
  adminTokens.add(token);
  res.json({ token });
});

// ================= Public GET + admin-protected writes =================
// One set of routes per table, covering everything in schema.sql
// besides `users` (which has register/login instead, since it holds
// password hashes).

registerCrudRoutes("hostels", "hostels", ["name"]);

registerCrudRoutes("menu_items", "menu_items", ["name", "category", "price", "emoji", "unit", "vendor_name"], { ownerField: "vendor_name" });

registerCrudRoutes("gas_items", "gas_items", ["name", "category", "price", "emoji", "unit", "vendor_name"], { ownerField: "vendor_name" });

registerCrudRoutes("laundry_items", "laundry_items", ["name", "category", "price", "emoji", "unit", "vendor_name"], { ownerField: "vendor_name" });

registerCrudRoutes("stationery_items", "stationery_items", ["name", "category", "price", "emoji", "unit", "vendor_name"], { ownerField: "vendor_name" });

registerCrudRoutes("orders", "orders", [
  "order_code", "user_id", "service", "hostel_id", "status",
  "step_index", "progress", "minutes_left", "subtotal",
  "delivery_fee", "total", "payment_method",
]);

registerCrudRoutes("order_items", "order_items", [
  "order_id", "source_table", "source_id", "name", "emoji", "price", "qty",
]);

// ================= Checkout (customer-facing) =================
// Public — a logged-in customer isn't an admin, and doesn't need to
// be one just to place an order. This is what actually saves an
// order so vendors can see and act on it (previously orders only
// existed in the browser's memory and were never persisted).
app.post("/api/checkout", asyncRoute(async (req, res) => {
  const { user_id, service, hostel_id, items, subtotal, delivery_fee, total, payment_method, minutes_left } = req.body;

  if (!user_id || !service || !Array.isArray(items) || items.length === 0 || !payment_method || total == null) {
    return res.status(400).json({ error: "Missing required checkout fields" });
  }

  const sourceTableForService = { food: "menu_items", gas: "gas_items", laundry: "laundry_items", stationery: "stationery_items" };
  const sourceTable = sourceTableForService[service];
  if (!sourceTable) return res.status(400).json({ error: "Unknown service" });

  const order_code = "CG-" + Math.floor(1000 + Math.random() * 9000);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query(
      `INSERT INTO orders (order_code, user_id, service, hostel_id, status, step_index, progress, minutes_left, subtotal, delivery_fee, total, payment_method)
       VALUES (?, ?, ?, ?, 'Order placed', 0, 0.08, ?, ?, ?, ?, ?)`,
      [order_code, user_id, service, hostel_id || null, minutes_left ?? 20, subtotal ?? total, delivery_fee ?? 300, total, payment_method]
    );
    const orderId = result.insertId;
    for (const it of items) {
      await connection.query(
        `INSERT INTO order_items (order_id, source_table, source_id, name, emoji, price, qty) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [orderId, sourceTable, it.id, it.name, it.emoji || null, it.price, it.qty]
      );
    }
    await connection.commit();
    const [orderRows] = await pool.query("SELECT * FROM orders WHERE id = ?", [orderId]);
    const [itemRows] = await pool.query("SELECT * FROM order_items WHERE order_id = ?", [orderId]);
    res.status(201).json({ ...orderRows[0], items: itemRows });
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}));

// ================= Vendor-scoped orders =================
// What a vendor's "incoming orders" screen polls. Resolves which
// orders contain THIS vendor's items by joining order_items back to
// whichever catalog table each row came from (source_table), filtered
// to rows owned by the calling vendor. Requires the same admin token
// + X-Vendor-Name header as the catalog write routes.
const CATALOG_TABLES = ["menu_items", "gas_items", "laundry_items", "stationery_items"];

app.get("/api/vendor/orders", requireAdmin, asyncRoute(async (req, res) => {
  const vendorName = (req.headers["x-vendor-name"] || "").trim();
  if (!vendorName) return res.status(400).json({ error: "Missing business name (X-Vendor-Name header)" });

  const rowSets = await Promise.all(CATALOG_TABLES.map((table) =>
    pool.query(
      `SELECT o.id AS order_id, o.order_code, o.service, o.status, o.step_index, o.hostel_id, o.created_at,
              oi.id AS item_id, oi.name AS item_name, oi.emoji AS item_emoji, oi.qty, oi.price
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN ${table} t ON oi.source_table = ? AND oi.source_id = t.id
       WHERE t.vendor_name = ?
       ORDER BY o.created_at DESC`,
      [table, vendorName]
    ).then(([rows]) => rows)
  ));

  const byOrder = new Map();
  for (const rows of rowSets) {
    for (const row of rows) {
      if (!byOrder.has(row.order_id)) {
        byOrder.set(row.order_id, {
          order_id: row.order_id,
          order_code: row.order_code,
          service: row.service,
          status: row.status,
          step_index: row.step_index,
          hostel_id: row.hostel_id,
          created_at: row.created_at,
          items: [],
        });
      }
      byOrder.get(row.order_id).items.push({
        id: row.item_id, name: row.item_name, emoji: row.item_emoji, qty: row.qty, price: row.price,
      });
    }
  }

  const orders = [...byOrder.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(orders);
}));

// ================= Health check =================
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`CampusGo API listening on http://localhost:${PORT}`);
});
