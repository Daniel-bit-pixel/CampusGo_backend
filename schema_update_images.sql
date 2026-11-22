-- ============================================================
-- CampusGo — schema_update_images.sql
-- Adds an image_url column to each catalog table so items can show a
-- real photo (hosted on Cloudinary) instead of just an emoji. The
-- emoji stays as the fallback when an item has no picture.
-- One ALTER per table (TiDB handles single statements most reliably).
-- Safe to run once; re-running errors harmlessly on duplicate columns.
-- ============================================================

ALTER TABLE menu_items ADD COLUMN image_url VARCHAR(500) NULL;

ALTER TABLE gas_items ADD COLUMN image_url VARCHAR(500) NULL;

ALTER TABLE laundry_items ADD COLUMN image_url VARCHAR(500) NULL;

ALTER TABLE stationery_items ADD COLUMN image_url VARCHAR(500) NULL;
