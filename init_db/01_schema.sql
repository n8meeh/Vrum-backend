-- ==========================================================
-- ESTRUCTURA DE BASE DE DATOS - APP VRUM
-- Generado desde: 01_schema(vrum7).sql
-- Versión del servidor: 8.0.45
-- NOTA: Solo estructura (CREATE TABLE, índices, claves foráneas).
--       Sin datos de ejemplo (INSERTs).
-- ==========================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

CREATE DATABASE IF NOT EXISTS `vrum_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE `vrum_db`;

-- --------------------------------------------------------
-- Tabla: categories
-- --------------------------------------------------------
CREATE TABLE `categories` (
  `id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `slug` varchar(100) NOT NULL,
  `icon` varchar(50) DEFAULT NULL,
  `description` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `display_order` int DEFAULT '0',
  `is_active` tinyint(1) DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Tabla: chats
-- --------------------------------------------------------
CREATE TABLE `chats` (
  `id` int NOT NULL,
  `user1_id` int NOT NULL,
  `user2_id` int NOT NULL,
  `order_id` int DEFAULT NULL,
  `last_message` text COLLATE utf8mb4_unicode_ci,
  `last_message_at` datetime DEFAULT NULL,
  `unread_count_user1` int DEFAULT '0',
  `unread_count_user2` int DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Tabla: comments
-- --------------------------------------------------------
CREATE TABLE `comments` (
  `id` int NOT NULL,
  `post_id` int NOT NULL,
  `author_id` int NOT NULL,
  `content` text,
  `is_solution` tinyint(1) DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Tabla: content_reports
-- --------------------------------------------------------
CREATE TABLE `content_reports` (
  `id` int NOT NULL,
  `reporter_id` int NOT NULL,
  `reported_user_id` int NOT NULL,
  `content_type` enum('post','comment','review','user','provider') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `content_id` int NOT NULL,
  `reason` enum('spam','hate_speech','scam','other') DEFAULT NULL,
  `description` text,
  `status` enum('pending','resolved','dismissed') DEFAULT 'pending',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Tabla: messages
-- --------------------------------------------------------
CREATE TABLE `messages` (
  `id` int NOT NULL,
  `chat_id` int NOT NULL,
  `sender_id` int NOT NULL,
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `read_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Tabla: native_ads
-- --------------------------------------------------------
CREATE TABLE `native_ads` (
  `id` int NOT NULL,
  `client_name` varchar(100) DEFAULT NULL,
  `image_url` varchar(255) NOT NULL,
  `target_url` varchar(255) NOT NULL,
  `location` enum('home_feed','map_pin','provider_list') DEFAULT 'home_feed',
  `is_active` tinyint(1) DEFAULT '1',
  `views_count` int DEFAULT '0',
  `clicks_count` int DEFAULT '0',
  `start_date` datetime DEFAULT NULL,
  `end_date` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Tabla: notifications
-- --------------------------------------------------------
CREATE TABLE `notifications` (
  `id` int NOT NULL,
  `user_id` int NOT NULL,
  `type` enum('social_like','social_comment','order_update','chat_message','post_solved','system') NOT NULL,
  `title` varchar(100) DEFAULT NULL,
  `body` varchar(255) DEFAULT NULL,
  `related_id` int DEFAULT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Tabla: orders
-- --------------------------------------------------------
CREATE TABLE `orders` (
  `id` int NOT NULL,
  `client_id` int NOT NULL,
  `provider_id` int NOT NULL,
  `vehicle_id` int DEFAULT NULL,
  `status` enum('pending','accepted','completed','cancelled') DEFAULT 'pending',
  `title` varchar(100) DEFAULT NULL,
  `description` text,
  `is_home_service` tinyint(1) DEFAULT '0',
  `scheduled_date` datetime DEFAULT NULL,
  `final_price` decimal(10,2) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `completed_at` datetime DEFAULT NULL,
  `post_id` int DEFAULT NULL,
  `is_proposal` tinyint(1) NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Tabla: order_negotiations
-- --------------------------------------------------------
CREATE TABLE `order_negotiations` (
  `id` int NOT NULL,
  `order_id` int NOT NULL,
  `author_id` int NOT NULL,
  `message` text,
  `proposed_price` decimal(10,2) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `proposed_date` datetime DEFAULT NULL,
  `proposed_is_home_service` tinyint DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Tabla: poll_votes
-- --------------------------------------------------------
CREATE TABLE `poll_votes` (
  `id` int NOT NULL,
  `user_id` int NOT NULL,
  `post_id` int NOT NULL,
  `option_index` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Tabla: posts
-- --------------------------------------------------------
CREATE TABLE `posts` (
  `id` int NOT NULL,
  `author_id` int NOT NULL,
  `provider_id` int DEFAULT NULL,
  `vehicle_id` int DEFAULT NULL,
  `content` text,
  `media_url` varchar(255) DEFAULT NULL,
  `is_poll` tinyint(1) DEFAULT '0',
  `poll_options` json DEFAULT NULL,
  `is_solved` tinyint(1) DEFAULT '0',
  `visibility` varchar(50) NOT NULL DEFAULT 'public',
  `lat` decimal(10,8) DEFAULT NULL,
  `lng` decimal(11,8) DEFAULT NULL,
  `comments_count` int DEFAULT '0',
  `likes_count` int DEFAULT '0',
  `status` enum('active','hidden','flagged') DEFAULT 'active',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Tabla: post_likes
-- --------------------------------------------------------
CREATE TABLE `post_likes` (
  `user_id` int NOT NULL,
  `post_id` int NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Tabla: post_tags
-- --------------------------------------------------------
CREATE TABLE `post_tags` (
  `post_id` int NOT NULL,
  `tag_id` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Tabla: providers
-- --------------------------------------------------------
CREATE TABLE `providers` (
  `id` int NOT NULL,
  `user_id` int NOT NULL,
  `business_name` varchar(150) NOT NULL,
  `logo_url` varchar(255) DEFAULT NULL,
  `cover_url` varchar(255) DEFAULT NULL,
  `description` text,
  `category` enum('mechanic','electrician','body_shop','tires','audio_security','tow','wash','store','driving_school','other') NOT NULL,
  `contacts` json DEFAULT NULL,
  `opening_hours` varchar(100) DEFAULT NULL,
  `is_multibrand` tinyint(1) DEFAULT '0',
  `is_visible` tinyint(1) DEFAULT '1',
  `lat` decimal(10,8) DEFAULT NULL,
  `lng` decimal(11,8) DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `rating_avg` decimal(3,2) DEFAULT '0.00',
  `is_premium` tinyint(1) DEFAULT '0',
  `is_verified` tinyint(1) DEFAULT '0',
  `identity_docs_url` json DEFAULT NULL,
  `verification_status` enum('unverified','pending','verified','rejected') DEFAULT 'unverified',
  `device_fingerprint` varchar(255) DEFAULT NULL,
  `trial_abuse_score` int DEFAULT '0',
  `deleted_at` datetime DEFAULT NULL,
  `secondary_categories` json DEFAULT NULL,
  `is_home_service` tinyint(1) NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Tabla: provider_brands
-- --------------------------------------------------------
CREATE TABLE `provider_brands` (
  `provider_id` int NOT NULL,
  `brand_id` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Tabla: provider_metrics
-- --------------------------------------------------------
CREATE TABLE `provider_metrics` (
  `id` int NOT NULL,
  `provider_id` int NOT NULL,
  `date` date NOT NULL,
  `appearances` int DEFAULT '0',
  `profile_views` int DEFAULT '0',
  `clicks_whatsapp` int DEFAULT '0',
  `clicks_call` int DEFAULT '0',
  `clicks_route` int DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Tabla: provider_services
-- --------------------------------------------------------
CREATE TABLE `provider_services` (
  `id` int NOT NULL,
  `provider_id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `vehicle_type_id` int NOT NULL,
  `price_min` decimal(10,2) DEFAULT NULL,
  `price_max` decimal(10,2) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Tabla: provider_specialties
-- --------------------------------------------------------
CREATE TABLE `provider_specialties` (
  `provider_id` int NOT NULL,
  `specialty_id` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Tabla: provider_team
-- --------------------------------------------------------
CREATE TABLE `provider_team` (
  `id` int NOT NULL,
  `provider_id` int NOT NULL,
  `user_id` int NOT NULL,
  `role` enum('admin','staff','viewer') DEFAULT 'staff',
  `status` enum('active','inactive') DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Tabla: provider_vehicle_types
-- --------------------------------------------------------
CREATE TABLE `provider_vehicle_types` (
  `provider_id` int NOT NULL,
  `vehicle_type_id` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Tabla: reviews
-- --------------------------------------------------------
CREATE TABLE `reviews` (
  `id` int NOT NULL,
  `order_id` int NOT NULL,
  `provider_id` int NOT NULL,
  `author_id` int NOT NULL,
  `rating_overall` int NOT NULL,
  `comment` text,
  `provider_reply` text,
  `rating_comm` int DEFAULT NULL,
  `rating_speed` int DEFAULT NULL,
  `rating_price` int DEFAULT NULL,
  `rating_quality` int DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Tabla: specialties
-- --------------------------------------------------------
CREATE TABLE `specialties` (
  `id` int NOT NULL,
  `category_id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `slug` varchar(100) NOT NULL,
  `description` text,
  `icon` varchar(255) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `is_active` tinyint(1) DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Tabla: subscriptions
-- --------------------------------------------------------
CREATE TABLE `subscriptions` (
  `id` int NOT NULL,
  `provider_id` int NOT NULL,
  `plan` enum('trial','premium') NOT NULL,
  `status` enum('active','expired','cancelled') DEFAULT 'active',
  `start_date` datetime DEFAULT NULL,
  `end_date` datetime DEFAULT NULL,
  `payment_platform` varchar(50) DEFAULT NULL,
  `external_reference` varchar(255) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Tabla: tags
-- --------------------------------------------------------
CREATE TABLE `tags` (
  `id` int NOT NULL,
  `name` varchar(50) NOT NULL,
  `usage_count` int DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Tabla: users
-- --------------------------------------------------------
CREATE TABLE `users` (
  `id` int NOT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `full_name` varchar(100) DEFAULT NULL,
  `bio` varchar(255) DEFAULT NULL,
  `role` enum('user','provider','admin') DEFAULT 'user',
  `avatar_url` varchar(255) DEFAULT NULL,
  `current_session_token` varchar(255) DEFAULT NULL,
  `fcm_token` varchar(255) DEFAULT NULL,
  `last_login_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `is_visible` tinyint(1) DEFAULT '1',
  `deleted_at` datetime DEFAULT NULL,
  `solutions_count` int DEFAULT '0',
  `strikes_count` int DEFAULT '0',
  `banned_until` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `reset_token` varchar(255) DEFAULT NULL,
  `reset_expires` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Tabla: user_blocks
-- --------------------------------------------------------
CREATE TABLE `user_blocks` (
  `blocker_id` int NOT NULL,
  `blocked_id` int NOT NULL,
  `reason` varchar(50) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Tabla: user_follows
-- --------------------------------------------------------
CREATE TABLE `user_follows` (
  `follower_id` int NOT NULL,
  `followed_id` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Tabla: vehicles
-- --------------------------------------------------------
CREATE TABLE `vehicles` (
  `id` int NOT NULL,
  `user_id` int NOT NULL,
  `model_id` int NOT NULL,
  `year` int DEFAULT NULL,
  `plate` varchar(20) DEFAULT NULL,
  `vin` varchar(100) DEFAULT NULL,
  `alias` varchar(50) DEFAULT NULL,
  `last_mileage` int DEFAULT '0',
  `photo_url` varchar(255) DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Tabla: vehicle_brands
-- --------------------------------------------------------
CREATE TABLE `vehicle_brands` (
  `id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `logo_url` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Tabla: vehicle_brand_types (relacion Marca <-> Tipo de vehiculo)
-- --------------------------------------------------------
CREATE TABLE `vehicle_brand_types` (
  `brand_id` int NOT NULL,
  `type_id` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Tabla: vehicle_models
-- --------------------------------------------------------
CREATE TABLE `vehicle_models` (
  `id` int NOT NULL,
  `brand_id` int NOT NULL,
  `type_id` int NOT NULL,
  `name` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Tabla: vehicle_types
-- --------------------------------------------------------
CREATE TABLE `vehicle_types` (
  `id` int NOT NULL,
  `name` varchar(50) NOT NULL,
  `icon_url` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================
-- INDICES
-- ============================================================

ALTER TABLE `categories`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `slug` (`slug`);

ALTER TABLE `chats`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_chat` (`user1_id`,`user2_id`),
  ADD KEY `idx_user1` (`user1_id`),
  ADD KEY `idx_user2` (`user2_id`),
  ADD KEY `idx_last_message_at` (`last_message_at` DESC),
  ADD KEY `idx_order_id` (`order_id`);

ALTER TABLE `comments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `post_id` (`post_id`),
  ADD KEY `author_id` (`author_id`);

ALTER TABLE `content_reports`
  ADD PRIMARY KEY (`id`),
  ADD KEY `reporter_id` (`reporter_id`);

ALTER TABLE `messages`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_chat_id` (`chat_id`),
  ADD KEY `idx_sender_id` (`sender_id`),
  ADD KEY `idx_created_at` (`created_at` DESC),
  ADD KEY `idx_is_read` (`is_read`);

ALTER TABLE `native_ads`
  ADD PRIMARY KEY (`id`);

ALTER TABLE `notifications`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`);

ALTER TABLE `orders`
  ADD PRIMARY KEY (`id`),
  ADD KEY `client_id` (`client_id`),
  ADD KEY `provider_id` (`provider_id`),
  ADD KEY `vehicle_id` (`vehicle_id`),
  ADD KEY `FK_orders_post` (`post_id`),
  ADD KEY `idx_completed_at` (`completed_at`);

ALTER TABLE `order_negotiations`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK_neg_order` (`order_id`),
  ADD KEY `FK_neg_author` (`author_id`);

ALTER TABLE `poll_votes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `user_id` (`user_id`,`post_id`),
  ADD KEY `post_id` (`post_id`);

ALTER TABLE `posts`
  ADD PRIMARY KEY (`id`),
  ADD KEY `author_id` (`author_id`),
  ADD KEY `vehicle_id` (`vehicle_id`),
  ADD KEY `fk_posts_provider` (`provider_id`);

ALTER TABLE `post_likes`
  ADD PRIMARY KEY (`user_id`,`post_id`),
  ADD KEY `post_id` (`post_id`);

ALTER TABLE `post_tags`
  ADD PRIMARY KEY (`post_id`,`tag_id`),
  ADD KEY `tag_id` (`tag_id`);

ALTER TABLE `providers`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `user_id` (`user_id`),
  ADD KEY `idx_geo` (`lat`,`lng`),
  ADD KEY `idx_provider_status` (`is_premium`,`rating_avg`);

ALTER TABLE `provider_brands`
  ADD PRIMARY KEY (`provider_id`,`brand_id`),
  ADD KEY `brand_id` (`brand_id`);

ALTER TABLE `provider_metrics`
  ADD PRIMARY KEY (`id`),
  ADD KEY `provider_id` (`provider_id`);

ALTER TABLE `provider_services`
  ADD PRIMARY KEY (`id`),
  ADD KEY `provider_id` (`provider_id`),
  ADD KEY `vehicle_type_id` (`vehicle_type_id`);

ALTER TABLE `provider_specialties`
  ADD PRIMARY KEY (`provider_id`,`specialty_id`),
  ADD KEY `specialty_id` (`specialty_id`);

ALTER TABLE `provider_team`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `provider_id` (`provider_id`,`user_id`),
  ADD KEY `user_id` (`user_id`);

ALTER TABLE `provider_vehicle_types`
  ADD PRIMARY KEY (`provider_id`,`vehicle_type_id`),
  ADD KEY `vehicle_type_id` (`vehicle_type_id`);

ALTER TABLE `reviews`
  ADD PRIMARY KEY (`id`),
  ADD KEY `order_id` (`order_id`),
  ADD KEY `provider_id` (`provider_id`),
  ADD KEY `author_id` (`author_id`);

ALTER TABLE `specialties`
  ADD PRIMARY KEY (`id`),
  ADD KEY `category_id` (`category_id`);

ALTER TABLE `subscriptions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `provider_id` (`provider_id`);

ALTER TABLE `tags`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `name` (`name`);

ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `idx_user_activity` (`last_login_at`,`is_visible`,`deleted_at`);

ALTER TABLE `user_blocks`
  ADD PRIMARY KEY (`blocker_id`,`blocked_id`),
  ADD KEY `blocked_id` (`blocked_id`);

ALTER TABLE `user_follows`
  ADD PRIMARY KEY (`follower_id`,`followed_id`),
  ADD KEY `followed_id` (`followed_id`);

ALTER TABLE `vehicles`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `model_id` (`model_id`);

ALTER TABLE `vehicle_brands`
  ADD PRIMARY KEY (`id`);

ALTER TABLE `vehicle_brand_types`
  ADD PRIMARY KEY (`brand_id`,`type_id`),
  ADD KEY `type_id` (`type_id`);

ALTER TABLE `vehicle_models`
  ADD PRIMARY KEY (`id`),
  ADD KEY `brand_id` (`brand_id`),
  ADD KEY `type_id` (`type_id`);

ALTER TABLE `vehicle_types`
  ADD PRIMARY KEY (`id`);

-- ============================================================
-- AUTO_INCREMENT
-- ============================================================

ALTER TABLE `categories`        MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `chats`             MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `comments`          MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `content_reports`   MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `messages`          MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `native_ads`        MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `notifications`     MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `orders`            MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `order_negotiations` MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `poll_votes`        MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `posts`             MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `providers`         MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `provider_metrics`  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `provider_services` MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `provider_team`     MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `reviews`           MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `specialties`       MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `subscriptions`     MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `tags`              MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `users`             MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `vehicles`          MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `vehicle_brands`    MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `vehicle_models`    MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `vehicle_types`     MODIFY `id` int NOT NULL AUTO_INCREMENT;

-- ============================================================
-- CLAVES FORANEAS
-- ============================================================

ALTER TABLE `chats`
  ADD CONSTRAINT `chats_ibfk_1` FOREIGN KEY (`user1_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `chats_ibfk_2` FOREIGN KEY (`user2_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_chats_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE;

ALTER TABLE `comments`
  ADD CONSTRAINT `comments_ibfk_1` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`),
  ADD CONSTRAINT `comments_ibfk_2` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`);

ALTER TABLE `content_reports`
  ADD CONSTRAINT `content_reports_ibfk_1` FOREIGN KEY (`reporter_id`) REFERENCES `users` (`id`);

ALTER TABLE `messages`
  ADD CONSTRAINT `messages_ibfk_1` FOREIGN KEY (`chat_id`) REFERENCES `chats` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `messages_ibfk_2` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

ALTER TABLE `notifications`
  ADD CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

ALTER TABLE `orders`
  ADD CONSTRAINT `FK_orders_post` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `orders_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `orders_ibfk_2` FOREIGN KEY (`provider_id`) REFERENCES `providers` (`id`),
  ADD CONSTRAINT `orders_ibfk_3` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`);

ALTER TABLE `order_negotiations`
  ADD CONSTRAINT `FK_neg_author` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `FK_neg_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE;

ALTER TABLE `poll_votes`
  ADD CONSTRAINT `poll_votes_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `poll_votes_ibfk_2` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE;

ALTER TABLE `posts`
  ADD CONSTRAINT `fk_posts_provider` FOREIGN KEY (`provider_id`) REFERENCES `providers` (`id`),
  ADD CONSTRAINT `posts_ibfk_1` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `posts_ibfk_2` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`);

ALTER TABLE `post_likes`
  ADD CONSTRAINT `post_likes_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `post_likes_ibfk_2` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`);

ALTER TABLE `post_tags`
  ADD CONSTRAINT `post_tags_ibfk_1` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `post_tags_ibfk_2` FOREIGN KEY (`tag_id`) REFERENCES `tags` (`id`) ON DELETE CASCADE;

ALTER TABLE `providers`
  ADD CONSTRAINT `providers_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

ALTER TABLE `provider_brands`
  ADD CONSTRAINT `provider_brands_ibfk_1` FOREIGN KEY (`provider_id`) REFERENCES `providers` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `provider_brands_ibfk_2` FOREIGN KEY (`brand_id`) REFERENCES `vehicle_brands` (`id`) ON DELETE CASCADE;

ALTER TABLE `provider_metrics`
  ADD CONSTRAINT `provider_metrics_ibfk_1` FOREIGN KEY (`provider_id`) REFERENCES `providers` (`id`);

ALTER TABLE `provider_services`
  ADD CONSTRAINT `provider_services_ibfk_1` FOREIGN KEY (`provider_id`) REFERENCES `providers` (`id`),
  ADD CONSTRAINT `provider_services_ibfk_2` FOREIGN KEY (`vehicle_type_id`) REFERENCES `vehicle_types` (`id`);

ALTER TABLE `provider_specialties`
  ADD CONSTRAINT `provider_specialties_ibfk_1` FOREIGN KEY (`provider_id`) REFERENCES `providers` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `provider_specialties_ibfk_2` FOREIGN KEY (`specialty_id`) REFERENCES `specialties` (`id`) ON DELETE CASCADE;

ALTER TABLE `provider_team`
  ADD CONSTRAINT `provider_team_ibfk_1` FOREIGN KEY (`provider_id`) REFERENCES `providers` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `provider_team_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

ALTER TABLE `provider_vehicle_types`
  ADD CONSTRAINT `provider_vehicle_types_ibfk_1` FOREIGN KEY (`provider_id`) REFERENCES `providers` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `provider_vehicle_types_ibfk_2` FOREIGN KEY (`vehicle_type_id`) REFERENCES `vehicle_types` (`id`) ON DELETE CASCADE;

ALTER TABLE `reviews`
  ADD CONSTRAINT `reviews_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  ADD CONSTRAINT `reviews_ibfk_2` FOREIGN KEY (`provider_id`) REFERENCES `providers` (`id`),
  ADD CONSTRAINT `reviews_ibfk_3` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`);

ALTER TABLE `specialties`
  ADD CONSTRAINT `specialties_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE;

ALTER TABLE `subscriptions`
  ADD CONSTRAINT `subscriptions_ibfk_1` FOREIGN KEY (`provider_id`) REFERENCES `providers` (`id`);

ALTER TABLE `user_blocks`
  ADD CONSTRAINT `user_blocks_ibfk_1` FOREIGN KEY (`blocker_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `user_blocks_ibfk_2` FOREIGN KEY (`blocked_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

ALTER TABLE `user_follows`
  ADD CONSTRAINT `user_follows_ibfk_1` FOREIGN KEY (`follower_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `user_follows_ibfk_2` FOREIGN KEY (`followed_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

ALTER TABLE `vehicles`
  ADD CONSTRAINT `vehicles_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `vehicles_ibfk_2` FOREIGN KEY (`model_id`) REFERENCES `vehicle_models` (`id`);

ALTER TABLE `vehicle_brand_types`
  ADD CONSTRAINT `vehicle_brand_types_ibfk_1` FOREIGN KEY (`brand_id`) REFERENCES `vehicle_brands` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `vehicle_brand_types_ibfk_2` FOREIGN KEY (`type_id`) REFERENCES `vehicle_types` (`id`) ON DELETE CASCADE;

ALTER TABLE `vehicle_models`
  ADD CONSTRAINT `vehicle_models_ibfk_1` FOREIGN KEY (`brand_id`) REFERENCES `vehicle_brands` (`id`),
  ADD CONSTRAINT `vehicle_models_ibfk_2` FOREIGN KEY (`type_id`) REFERENCES `vehicle_types` (`id`);

-- ----------------------------------------------------------
-- Tabla: native_ads
-- ----------------------------------------------------------
CREATE TABLE `native_ads` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(100) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `image_url` varchar(500) DEFAULT NULL,
  `target_url` varchar(500) DEFAULT NULL,
  `advertiser` varchar(100) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
