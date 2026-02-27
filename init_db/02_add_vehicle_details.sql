-- ==========================================================
-- MIGRACIÓN: Añadir columnas de detalle a vehicles
-- Fecha: 2026-02-26
-- Descripción: Agrega fuel_type, transmission y engine_size
-- ==========================================================

ALTER TABLE `vehicles`
  ADD COLUMN `fuel_type` ENUM('gasoline', 'diesel', 'electric', 'hybrid', 'gas', 'other')
    NOT NULL DEFAULT 'gasoline'
    AFTER `photo_url`,
  ADD COLUMN `transmission` ENUM('manual', 'automatic')
    NOT NULL DEFAULT 'manual'
    AFTER `fuel_type`,
  ADD COLUMN `engine_size` VARCHAR(20) DEFAULT NULL
    AFTER `transmission`;
