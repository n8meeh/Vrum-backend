-- Migración 009: Agregar 'in_progress' al ENUM de status de orders
-- Necesario para el flujo: pending → accepted → in_progress → completed

ALTER TABLE `orders`
  MODIFY COLUMN `status` ENUM('pending','accepted','in_progress','completed','cancelled') DEFAULT 'pending';
