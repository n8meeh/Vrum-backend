-- ============================================================
-- Migration 007: Notification Types Enhancement
-- Agrega social_follow y business_invite al ENUM de notifications.type
-- ============================================================

ALTER TABLE `notifications`
  MODIFY COLUMN `type` ENUM(
    'social_like',
    'social_comment',
    'social_follow',
    'order_update',
    'chat_message',
    'post_solved',
    'business_invite',
    'system'
  ) DEFAULT 'system';
