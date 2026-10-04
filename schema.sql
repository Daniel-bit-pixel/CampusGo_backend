-- ============================================================
-- CampusGo — schema.sql
-- Written for MySQL / phpMyAdmin.
--
-- This is the CONSOLIDATED schema: the original tables plus
-- everything added since (Google auth columns on `users`, and
-- `vendor_name` ownership columns on the four catalog tables used by
-- the vendor app). Use this for a fresh database setup instead of
-- running schema.sql + schema_update_google_auth.sql +
-- schema_update_vendor_ownership.sql in sequence.
--
-- IMPORTANT: this DROPS and recreates every table — don't run it
-- against a database you already have real data in. If you already
-- have a live database, keep using the individual migration files
-- instead.
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS stationery_items;
DROP TABLE IF EXISTS laundry_items;
DROP TABLE IF EXISTS gas_items;
DROP TABLE IF EXISTS menu_items;
DROP TABLE IF EXISTS hostels;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------- Users ----------------
-- password_hash is nullable because Google-authenticated users never
-- set a local password. google_id is the stable "sub" claim from the
-- verified ID token — always match returning Google users on this,
-- never on email alone.
CREATE TABLE users (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  full_name       VARCHAR(150) NOT NULL,
  email           VARCHAR(150) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NULL,
  google_id       VARCHAR(255) NULL UNIQUE,
  auth_provider   ENUM('local', 'google') NOT NULL DEFAULT 'local',
  email_verified  TINYINT(1) NOT NULL DEFAULT 0,
  avatar_url      VARCHAR(500) NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO users (full_name, email, password_hash, created_at) VALUES
  ('Daniel Adewale', 'daniel.adewale@student.oauife.edu.ng', '$2b$10$examplehashvalueDanielXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', '2026-01-14 09:12:00'),
  ('Chiamaka Okoro',  'chiamaka.okoro@student.oauife.edu.ng',  '$2b$10$examplehashvalueChiamakaXXXXXXXXXXXXXXXXXXXXXXXXXXXX', '2026-02-02 18:40:00'),
  ('Tunde Balogun',   'tunde.balogun@student.oauife.edu.ng',   '$2b$10$examplehashvalueTundeXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', '2026-03-19 11:05:00');

-- ---------------- Hostels (delivery zones) ----------------
CREATE TABLE hostels (
  id   INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB;

INSERT INTO hostels (name) VALUES
  ('Angola Hall'),
  ('Mozambique Hall'),
  ('Awolowo Hall'),
  ('Fajuyi Hall'),
  ('Off-campus (Ede Road)');

-- ---------------- Food Delivery catalog ----------------
-- vendor_name: which business added this item, self-reported by the
-- vendor app and checked server-side on every edit/delete. NULL means
-- "unclaimed" (e.g. this seed data) — unclaimed items can't be
-- edited/deleted through the vendor app until claimed.
CREATE TABLE menu_items (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(150) NOT NULL,
  category    ENUM('Rice','Swallow','Quick Bites','Snacks','Drinks','Breakfast') NOT NULL,
  vendor_name VARCHAR(150) NULL,
  price       INT NOT NULL,
  emoji       VARCHAR(10),
  unit        VARCHAR(30),
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO menu_items (name, category, price, emoji, unit) VALUES
  ('Jollof Rice & Chicken', 'Rice', 2000, '🍚', 'per plate'),
  ('Fried Rice & Turkey',   'Rice', 2200, '🍛', 'per plate'),
  ('Pounded Yam & Egusi',   'Swallow', 2500, '🍲', 'per plate'),
  ('Amala & Ewedu',         'Swallow', 1800, '🥘', 'per plate'),
  ('Meat Pie',              'Snacks', 600, '🥧', 'each'),
  ('Puff Puff (6 pcs)',     'Snacks', 700, '🍩', 'pack'),
  ('Chicken Shawarma',      'Quick Bites', 2500, '🌯', 'each'),
  ('Egg Roll',              'Quick Bites', 500, '🥐', 'each'),
  ('Chapman',               'Drinks', 1000, '🍹', 'bottle'),
  ('Zobo Drink',            'Drinks', 500, '🧃', 'bottle'),
  ('Akara & Pap',           'Breakfast', 1200, '🥣', 'per plate'),
  ('Bread & Egg Sauce',     'Breakfast', 1000, '🍞', 'per plate');

-- ---------------- Gas Filling catalog ----------------
CREATE TABLE gas_items (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(150) NOT NULL,
  category    ENUM('Refill','Swap','Accessories') NOT NULL,
  vendor_name VARCHAR(150) NULL,
  price       INT NOT NULL,
  emoji       VARCHAR(10),
  unit        VARCHAR(30)
) ENGINE=InnoDB;

INSERT INTO gas_items (name, category, price, emoji, unit) VALUES
  ('3kg Cylinder Refill',    'Refill', 4500, '🛢️', 'per refill'),
  ('6kg Cylinder Refill',    'Refill', 8500, '🛢️', 'per refill'),
  ('12.5kg Cylinder Refill', 'Refill', 16500, '🛢️', 'per refill'),
  ('6kg Cylinder Swap',      'Swap', 9500, '🔄', 'per swap'),
  ('12.5kg Cylinder Swap',   'Swap', 18500, '🔄', 'per swap'),
  ('Gas Regulator',          'Accessories', 3500, '🔧', 'each');

-- ---------------- Laundry catalog ----------------
CREATE TABLE laundry_items (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(150) NOT NULL,
  category    ENUM('Wash','Iron','Dry Clean') NOT NULL,
  vendor_name VARCHAR(150) NULL,
  price       INT NOT NULL,
  emoji       VARCHAR(10),
  unit        VARCHAR(30)
) ENGINE=InnoDB;

INSERT INTO laundry_items (name, category, price, emoji, unit) VALUES
  ('Wash & Fold',              'Wash', 500, '🧺', 'per kg'),
  ('Wash & Iron',               'Wash', 700, '👕', 'per kg'),
  ('Iron Only',                 'Iron', 300, '🔥', 'per kg'),
  ('Dry Cleaning — Suit',       'Dry Clean', 2500, '🧥', 'per item'),
  ('Dry Cleaning — Agbada',     'Dry Clean', 3000, '🥻', 'per item'),
  ('Duvet / Bedspread Wash',    'Wash', 2000, '🛏️', 'per item');

-- ---------------- Stationery catalog ----------------
CREATE TABLE stationery_items (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(150) NOT NULL,
  category    ENUM('Books','Writing','Paper','Printing','Tools') NOT NULL,
  vendor_name VARCHAR(150) NULL,
  price       INT NOT NULL,
  emoji       VARCHAR(10),
  unit        VARCHAR(30)
) ENGINE=InnoDB;

INSERT INTO stationery_items (name, category, price, emoji, unit) VALUES
  ('A4 Exercise Book (Pack of 5)', 'Books', 1500, '📓', NULL),
  ('Ballpoint Pens (Pack of 10)',  'Writing', 800, '🖊️', NULL),
  ('A4 Printing Paper (Ream)',     'Paper', 3500, '📄', NULL),
  ('Printing / Photocopy',         'Printing', 50, '🖨️', 'per page'),
  ('Foolscap Sheets (Pack)',       'Paper', 600, '📝', NULL),
  ('Highlighters (Set of 4)',      'Writing', 1200, '🖍️', NULL),
  ('Textbook Spiral Binding',      'Printing', 1000, '📚', NULL),
  ('Mathematical Set',             'Tools', 1800, '📐', NULL),
  ('Correction Fluid',             'Writing', 500, '🖌️', NULL),
  ('Manila Card (Pack)',           'Paper', 700, '🗂️', NULL);

-- ---------------- Orders ----------------
CREATE TABLE orders (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  order_code      VARCHAR(20) NOT NULL UNIQUE,
  user_id         INT NOT NULL,
  service         ENUM('food','gas','laundry','stationery') NOT NULL,
  hostel_id       INT,
  status          VARCHAR(50) NOT NULL DEFAULT 'Order placed',
  step_index      INT NOT NULL DEFAULT 0,
  progress        DECIMAL(4,2) NOT NULL DEFAULT 0.08,
  minutes_left    INT NOT NULL DEFAULT 18,
  subtotal        INT NOT NULL,
  delivery_fee    INT NOT NULL DEFAULT 300,
  total           INT NOT NULL,
  payment_method  ENUM('card','transfer','cash') NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_orders_hostel FOREIGN KEY (hostel_id) REFERENCES hostels(id)
) ENGINE=InnoDB;

INSERT INTO orders (order_code, user_id, service, hostel_id, status, step_index, progress, minutes_left, subtotal, delivery_fee, total, payment_method, created_at) VALUES
  ('CG-2417', 1, 'gas',     1, 'Out for delivery',   3, 0.62, 6,  8500, 300, 8800, 'transfer', '2026-08-10 12:05:00'),
  ('CG-3391', 2, 'food',    2, 'Delivered',          4, 1.00, 0,  4200, 300, 4500, 'card',     '2026-08-11 08:20:00'),
  ('CG-5810', 3, 'laundry', 3, 'Washing / Ironing',  2, 0.45, 22, 3200, 300, 3500, 'cash',     '2026-08-12 16:45:00');

-- ---------------- Order items ----------------
CREATE TABLE order_items (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  order_id      INT NOT NULL,
  source_table  ENUM('menu_items','gas_items','laundry_items','stationery_items') NOT NULL,
  source_id     INT NOT NULL,
  name          VARCHAR(150) NOT NULL,
  emoji         VARCHAR(10),
  price         INT NOT NULL,
  qty           DECIMAL(6,2) NOT NULL DEFAULT 1,
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id)
) ENGINE=InnoDB;

INSERT INTO order_items (order_id, source_table, source_id, name, emoji, price, qty) VALUES
  (1, 'gas_items',      2, '6kg Cylinder Refill',   '🛢️', 8500, 1),
  (2, 'menu_items',     1, 'Jollof Rice & Chicken',  '🍚', 2000, 1),
  (2, 'menu_items',     9, 'Chapman',                '🍹', 1000, 1),
  (2, 'menu_items',     5, 'Meat Pie',               '🥧', 600,  2),
  (3, 'laundry_items',  1, 'Wash & Fold',            '🧺', 500,  4),
  (3, 'laundry_items',  3, 'Iron Only',              '🔥', 300,  4);
