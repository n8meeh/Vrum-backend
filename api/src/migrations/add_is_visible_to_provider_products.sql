ALTER TABLE provider_products
  ADD COLUMN is_visible TINYINT(1) NOT NULL DEFAULT 1
  AFTER is_active;
