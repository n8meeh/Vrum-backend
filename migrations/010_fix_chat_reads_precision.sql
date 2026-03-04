-- Migración 010: Corregir precisión de datetime en chat_reads
-- Problema: last_read_at era DATETIME(0) (solo segundos) mientras que
-- order_negotiations.created_at es DATETIME(6) (microsegundos).
-- Al copiar el timestamp del mensaje, los microsegundos se truncaban,
-- causando que createdAt > lastReadAt sea siempre TRUE (badge no desaparece).

-- 1. Cambiar a DATETIME(6) y quitar ON UPDATE CURRENT_TIMESTAMP
ALTER TABLE `chat_reads`
  MODIFY COLUMN `last_read_at` DATETIME(6) NOT NULL;

-- 2. Limpiar registros existentes con timestamps incorrectos
-- Se regenerarán automáticamente cuando el usuario abra cada chat
DELETE FROM `chat_reads`;
