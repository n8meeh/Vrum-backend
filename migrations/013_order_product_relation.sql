-- Agregar columna product_id a la tabla orders
ALTER TABLE orders ADD COLUMN product_id INT NULL;

-- Foreign key hacia provider_products
ALTER TABLE orders ADD CONSTRAINT fk_orders_product
  FOREIGN KEY (product_id) REFERENCES provider_products(id)
  ON DELETE SET NULL;
