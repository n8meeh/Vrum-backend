-- ============================================
-- MIGRACIÓN 006: Sistema de Staff (Equipo)
-- ============================================
-- Permite que un negocio (Provider) tenga miembros de equipo
-- con roles diferenciados: provider_admin y provider_staff
-- ============================================

-- 1. Expandir ENUM de roles en users
ALTER TABLE `users`
  MODIFY COLUMN `role` ENUM('user','provider','provider_admin','provider_staff','admin') DEFAULT 'user';

-- 2. Agregar columna provider_id para vincular staff -> negocio
ALTER TABLE `users`
  ADD COLUMN `provider_id` INT DEFAULT NULL AFTER `role`,
  ADD KEY `idx_users_provider_id` (`provider_id`),
  ADD CONSTRAINT `fk_users_provider` FOREIGN KEY (`provider_id`) REFERENCES `providers` (`id`) ON DELETE SET NULL;

-- 3. Tabla de invitaciones de staff
CREATE TABLE `staff_invitations` (
  `id`           INT NOT NULL AUTO_INCREMENT,
  `provider_id`  INT NOT NULL,
  `invited_by`   INT NOT NULL,
  `email`        VARCHAR(255) NOT NULL,
  `role`         ENUM('provider_admin','provider_staff') NOT NULL,
  `token`        VARCHAR(255) NOT NULL,
  `status`       ENUM('pending','accepted','expired','cancelled') DEFAULT 'pending',
  `expires_at`   DATETIME NOT NULL,
  `created_at`   DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_invitation_token` (`token`),
  KEY `idx_invitation_email` (`email`),
  KEY `idx_invitation_provider` (`provider_id`),
  CONSTRAINT `fk_invitation_provider` FOREIGN KEY (`provider_id`) REFERENCES `providers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_invitation_inviter` FOREIGN KEY (`invited_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
