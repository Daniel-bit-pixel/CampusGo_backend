-- ============================================================
-- CampusGo — schema_update_payments.sql
-- Migration: adds Flutterwave payment tracking to orders, plus two
-- new tables for vendor payouts — vendor_bank_accounts (where to
-- send a vendor's money) and vendor_earnings (how much each vendor
-- is owed per order, and whether it's been paid out).
-- Run this AFTER schema.sql. Safe to run once; re-running will error
-- harmlessly on duplicate columns/tables (means it already applied).
-- Written for MySQL / phpMyAdmin.
-- ============================================================

-- ---------------- Payment tracking on orders ----------------
-- Split into separate statements (rather than one ALTER TABLE with
-- three ADD COLUMN clauses) — TiDB doesn't reliably resolve an AFTER
-- clause that references a column added earlier in the SAME
-- statement, even though real MySQL handles this fine.
ALTER TABLE orders
  ADD COLUMN payment_status ENUM('pending', 'paid', 'failed') NOT NULL DEFAULT 'pending' AFTER payment_method;

ALTER TABLE orders
  ADD COLUMN flw_transaction_id VARCHAR(100) NULL AFTER payment_status;

ALTER TABLE orders
  ADD COLUMN payment_ref VARCHAR(100) NULL AFTER flw_transaction_id;

-- ---------------- Vendor bank accounts (payout destination) ----------------
-- One row per business name — where their share of paid orders gets
-- sent. account_name is filled in from Flutterwave's account-resolve
-- response, not typed by the vendor, so it's a real, verified name
-- attached to that account number (a basic fraud-reduction step).
CREATE TABLE vendor_bank_accounts (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  vendor_name     VARCHAR(150) NOT NULL UNIQUE,
  bank_code       VARCHAR(20) NOT NULL,
  bank_name       VARCHAR(150) NOT NULL,
  account_number  VARCHAR(20) NOT NULL,
  account_name    VARCHAR(150) NOT NULL,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------- Vendor earnings (per-order share) ----------------
-- Computed automatically once an order's payment is verified: for
-- each vendor whose items appear in that order, their share of the
-- total (minus platform commission) gets one row here. Items with no
-- vendor_name (unclaimed) contribute nothing to any vendor's earnings
-- — the platform keeps that portion, since there's no one to pay.
CREATE TABLE vendor_earnings (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  order_id            INT NOT NULL,
  vendor_name         VARCHAR(150) NOT NULL,
  gross_amount        INT NOT NULL,
  commission_amount   INT NOT NULL,
  net_amount          INT NOT NULL,
  payout_status       ENUM('pending', 'paid') NOT NULL DEFAULT 'pending',
  paid_at             DATETIME NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vendor_earnings_order FOREIGN KEY (order_id) REFERENCES orders(id)
) ENGINE=InnoDB;
