-- Qismat E-commerce Structure
-- Deploy: run structure.sql on the server, then data.sql for seeds (idempotent WHERE NOT EXISTS).
-- Database name (production): qismyirz_qismat — create in cPanel → MySQL® Databases, then import here via phpMyAdmin (select that DB first).
-- Optional local/VPS: uncomment next line if your MySQL user may create databases; on shared cPanel, skip and only use USE below.
-- CREATE DATABASE IF NOT EXISTS `qismyirz_qismat` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `qismyirz_qismat`;

-- settings.setting_key values used by the app (not all required on empty DB):
--   Theme: theme_primary_color, theme_sidebar_color
--   Storefront (public): store_business_address, store_phone_tel, store_whatsapp_tel, store_facebook_url, store_messenger_url
--   Categories: catalog_extra_categories (JSON array of admin-added names; merged with DISTINCT product.category + General),
--               catalog_category_images (JSON object: category name → image URL path under /uploads/…)
--   Brands: `brands` table (id, name, logo_url); `products.brand_id` optional FK-style reference
--   Gallery: `gallery_items` (kind image|video, src path or https embed URL, caption, sort_order)
--   Payments: ssl_store_id, ssl_store_password, ssl_is_live, is_payment_enabled
--   Couriers API: steadfast_api_key, steadfast_secret_key, steadfast_api_base_url (default https://portal.packzy.com/api/v1; old portal.steadfast.com.bd is dead DNS),
--                 steadfast_alternative_phone, steadfast_item_description_template, steadfast_total_lot_default,
--                 steadfast_send_delivery_type (true|false), auto_send_steadfast (true|false),
--                 steadfast_auto_dispatch_on_confirm (true|false, legacy alias — both enable auto-send on Processing),
--                 steadfast_webhook_bearer_token (Bearer auth for POST /api/webhooks/steadfast)
--   Shipping: shipping_inside_dhaka, shipping_outside_dhaka, shipping_inside_point, shipping_inside_home,
--             shipping_outside_point, shipping_outside_home, inside_dhaka_districts (comma-separated English names)
--   Meta ads: facebook_pixel_id, facebook_capi_access_token, facebook_test_event_code (optional)
--   MFS: bkash_mode, bkash_number, nagad_mode, nagad_number
--   Email: admin_email, smtp_user, smtp_pass
--
-- Compatibility block for existing databases:
-- Running this file on an older DB will keep existing data and add missing schema pieces.
ALTER TABLE `products` ADD COLUMN IF NOT EXISTS `gallery` JSON NULL AFTER `image`;
ALTER TABLE `products` ADD COLUMN IF NOT EXISTS `sizes` JSON NULL AFTER `gallery`;
ALTER TABLE `products` ADD COLUMN IF NOT EXISTS `colors` JSON NULL AFTER `sizes`;
ALTER TABLE `products` ADD COLUMN IF NOT EXISTS `regular_price` DECIMAL(10,2) NULL AFTER `price`;
ALTER TABLE `products` ADD COLUMN IF NOT EXISTS `preorder_available_date` DATE NULL AFTER `stock`;
ALTER TABLE `products` ADD COLUMN IF NOT EXISTS `pricing_options` JSON NULL AFTER `colors`;
ALTER TABLE `products` ADD COLUMN IF NOT EXISTS `brand_id` INT NULL AFTER `category`;
ALTER TABLE `couriers` ADD COLUMN IF NOT EXISTS `shipping_inside_dhaka` DECIMAL(10,2) NULL AFTER `base_rate`;
ALTER TABLE `couriers` ADD COLUMN IF NOT EXISTS `shipping_outside_dhaka` DECIMAL(10,2) NULL AFTER `shipping_inside_dhaka`;
ALTER TABLE `orders` ADD COLUMN IF NOT EXISTS `delivery_method` VARCHAR(20) NULL AFTER `customer_address`;
ALTER TABLE `orders` ADD COLUMN IF NOT EXISTS `courier_id` INT NULL AFTER `user_id`;
ALTER TABLE `orders` ADD COLUMN IF NOT EXISTS `coupon_code` VARCHAR(80) NULL AFTER `bkash_number`;
ALTER TABLE `orders` ADD COLUMN IF NOT EXISTS `steadfast_invoice` VARCHAR(150) NULL AFTER `tracking_number`;
ALTER TABLE `orders` ADD COLUMN IF NOT EXISTS `steadfast_consignment_id` VARCHAR(80) NULL AFTER `steadfast_invoice`;
ALTER TABLE `orders` ADD COLUMN IF NOT EXISTS `courier_dispatch_error` TEXT NULL AFTER `steadfast_consignment_id`;
ALTER TABLE `orders` ADD COLUMN IF NOT EXISTS `amount_paid` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `total_price`;
ALTER TABLE `orders` ADD COLUMN IF NOT EXISTS `return_status` VARCHAR(40) NOT NULL DEFAULT 'none' AFTER `status`;
ALTER TABLE `orders` ADD COLUMN IF NOT EXISTS `return_notes` TEXT NULL AFTER `return_status`;
ALTER TABLE `orders` ADD COLUMN IF NOT EXISTS `cancellation_reason` TEXT NULL AFTER `return_notes`;
ALTER TABLE `orders` ADD COLUMN IF NOT EXISTS `cancelled_at` TIMESTAMP NULL AFTER `cancellation_reason`;
ALTER TABLE `coupons` ADD COLUMN IF NOT EXISTS `restrict_product_ids` JSON NULL AFTER `is_active`;
ALTER TABLE `coupons` ADD COLUMN IF NOT EXISTS `restrict_categories` JSON NULL AFTER `restrict_product_ids`;
ALTER TABLE `orders` MODIFY COLUMN `payment_type` VARCHAR(40) NOT NULL;

-- Optional: enforce courier reference when courier_id is set (skip if your data has orphan ids)
-- ALTER TABLE `orders` DROP FOREIGN KEY IF EXISTS `fk_orders_courier`;
-- ALTER TABLE `orders` ADD CONSTRAINT `fk_orders_courier` FOREIGN KEY (`courier_id`) REFERENCES `couriers` (`id`) ON DELETE SET NULL;

-- Table structure for table `users`
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(150) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `role` ENUM('admin', 'customer') NOT NULL DEFAULT 'customer',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Table structure for table `products`
CREATE TABLE IF NOT EXISTS `products` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `sku` VARCHAR(80) UNIQUE,
  `price` DECIMAL(10,2) NOT NULL,
  `regular_price` DECIMAL(10,2) NULL,
  `image` VARCHAR(500) DEFAULT '',
  `gallery` JSON NULL,
  `sizes` JSON NULL,
  `colors` JSON NULL,
  `pricing_options` JSON NULL,
  `description` TEXT,
  `category` VARCHAR(120) DEFAULT 'General',
  `brand_id` INT NULL,
  `stock` INT NOT NULL DEFAULT 0,
  `preorder_available_date` DATE NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Table structure for table `couriers`
CREATE TABLE IF NOT EXISTS `couriers` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL UNIQUE,
  `phone` VARCHAR(20),
  `email` VARCHAR(150),
  `base_rate` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `shipping_inside_dhaka` DECIMAL(10,2) NULL,
  `shipping_outside_dhaka` DECIMAL(10,2) NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Table structure for table `orders`
CREATE TABLE IF NOT EXISTS `orders` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NULL,
  `courier_id` INT NULL,
  `customer_name` VARCHAR(150) NOT NULL,
  `customer_phone` VARCHAR(100) NOT NULL,
  `customer_email` VARCHAR(150),
  `customer_address` TEXT NOT NULL,
  `delivery_method` VARCHAR(20) NULL,
  `payment_type` VARCHAR(40) NOT NULL,
  `bkash_number` VARCHAR(100),
  `coupon_code` VARCHAR(80) NULL,
  `items` JSON NOT NULL,
  `subtotal` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `shipping_fee` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `discount_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `total_price` DECIMAL(10,2) NOT NULL,
  `amount_paid` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `status` ENUM('Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled') NOT NULL DEFAULT 'Pending',
  `return_status` VARCHAR(40) NOT NULL DEFAULT 'none',
  `return_notes` TEXT NULL,
  `cancellation_reason` TEXT NULL,
  `cancelled_at` TIMESTAMP NULL,
  `courier_name` VARCHAR(100),
  `tracking_number` VARCHAR(100) NULL UNIQUE,
  `note` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_orders_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Table structure for table `reviews`
CREATE TABLE IF NOT EXISTS `reviews` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `rating` TINYINT NOT NULL,
  `title` VARCHAR(255),
  `comment` TEXT NOT NULL,
  `is_approved` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `chk_reviews_rating` CHECK (`rating` BETWEEN 1 AND 5),
  CONSTRAINT `uq_reviews_user_product` UNIQUE (`product_id`, `user_id`),
  CONSTRAINT `fk_reviews_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reviews_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Table structure for table `settings`
-- Optional storefront keys (seeded in data.sql): store_logo_url, store_business_address, store_phone_tel,
-- store_whatsapp_tel, store_facebook_url, store_messenger_url — exposed to anonymous GET /api/settings when listed in PUBLIC_SETTING_KEYS (server/routes/settings.js).
CREATE TABLE IF NOT EXISTS `settings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `setting_key` VARCHAR(100) NOT NULL UNIQUE,
  `setting_value` LONGTEXT,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Legacy DB compatibility: allow larger values (video URLs / embed snippets / JSON payloads)
ALTER TABLE `settings` MODIFY COLUMN `setting_value` LONGTEXT;

-- Advertise/Homepage settings bootstrap (safe to run repeatedly)
-- Legacy key rename compatibility (older DBs may have these keys)
UPDATE `settings`
SET `setting_key` = 'advertise_unboxing_video_url'
WHERE `setting_key` = 'advertise_unboxing_video'
  AND NOT EXISTS (
    SELECT 1 FROM (SELECT `setting_key` FROM `settings`) AS s
    WHERE s.`setting_key` = 'advertise_unboxing_video_url'
  );

UPDATE `settings`
SET `setting_key` = 'advertise_newsletter_bg_image'
WHERE `setting_key` = 'advertise_newsletter_bg'
  AND NOT EXISTS (
    SELECT 1 FROM (SELECT `setting_key` FROM `settings`) AS s
    WHERE s.`setting_key` = 'advertise_newsletter_bg_image'
  );

INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'advertise_unboxing_hero_image', ''
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'advertise_unboxing_hero_image');
INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'advertise_unboxing_title', 'Designed to feel as good as unboxing.'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'advertise_unboxing_title');
INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'advertise_unboxing_subtitle', 'A quieter kind of commerce: editorial layouts, precise typography, and checkout that respects your time.'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'advertise_unboxing_subtitle');
INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'advertise_unboxing_media_type', 'image'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'advertise_unboxing_media_type');
INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'advertise_unboxing_video_url', ''
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'advertise_unboxing_video_url');
INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'advertise_newsletter_bg_image', ''
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'advertise_newsletter_bg_image');
INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'hero_slides', '[]'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'hero_slides');

-- Table structure for table `wishlist`
CREATE TABLE IF NOT EXISTS `wishlist` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `product_id` INT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_wishlist_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_wishlist_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `uq_wishlist_user_product` UNIQUE (`user_id`, `product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Table structure for table `payments`
CREATE TABLE IF NOT EXISTS `payments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_id` INT NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `method` VARCHAR(50) NOT NULL,
  `status` ENUM('Pending', 'Paid', 'Failed', 'Refunded') NOT NULL DEFAULT 'Pending',
  `transaction_id` VARCHAR(255),
  `paid_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_payments_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `admin_notifications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `type` ENUM('order', 'user', 'product', 'system') NOT NULL DEFAULT 'system',
  `title` VARCHAR(180) NOT NULL,
  `message` TEXT NOT NULL,
  `entity_type` VARCHAR(40) NULL,
  `entity_id` INT NULL,
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `coupons` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(40) NOT NULL UNIQUE,
  `discount_type` ENUM('percent', 'fixed') NOT NULL DEFAULT 'percent',
  `discount_value` DECIMAL(10,2) NOT NULL,
  `min_subtotal` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `max_uses` INT NULL,
  `used_count` INT NOT NULL DEFAULT 0,
  `expires_at` DATETIME NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `restrict_product_ids` JSON NULL,
  `restrict_categories` JSON NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `newsletter_subscribers` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `password_resets` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `token_hash` CHAR(64) NOT NULL UNIQUE,
  `expires_at` DATETIME NOT NULL,
  `used_at` DATETIME NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_password_resets_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `email_verifications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `code_hash` CHAR(64) NOT NULL,
  `attempts` INT NOT NULL DEFAULT 0,
  `expires_at` DATETIME NOT NULL,
  `used_at` DATETIME NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_email_verifications_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `brands` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(120) NOT NULL,
  `logo_url` VARCHAR(500) NOT NULL DEFAULT '',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_brands_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `gallery_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `kind` ENUM('image', 'video') NOT NULL DEFAULT 'image',
  `src` VARCHAR(800) NOT NULL,
  `caption` VARCHAR(255) NOT NULL DEFAULT '',
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_gallery_sort` (`sort_order`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS `idx_users_role` ON `users` (`role`);
CREATE INDEX IF NOT EXISTS `idx_products_category` ON `products` (`category`);
CREATE INDEX IF NOT EXISTS `idx_products_brand_id` ON `products` (`brand_id`);
CREATE INDEX IF NOT EXISTS `idx_products_stock` ON `products` (`stock`);
CREATE INDEX IF NOT EXISTS `idx_orders_status` ON `orders` (`status`);
CREATE INDEX IF NOT EXISTS `idx_orders_created_at` ON `orders` (`created_at`);
CREATE INDEX IF NOT EXISTS `idx_orders_tracking_number` ON `orders` (`tracking_number`);
CREATE INDEX IF NOT EXISTS `idx_reviews_product_id` ON `reviews` (`product_id`);
CREATE INDEX IF NOT EXISTS `idx_reviews_user_id` ON `reviews` (`user_id`);
CREATE INDEX IF NOT EXISTS `idx_wishlist_user_id` ON `wishlist` (`user_id`);
CREATE INDEX IF NOT EXISTS `idx_wishlist_product_id` ON `wishlist` (`product_id`);
CREATE INDEX IF NOT EXISTS `idx_password_resets_user` ON `password_resets` (`user_id`);
CREATE INDEX IF NOT EXISTS `idx_password_resets_expires` ON `password_resets` (`expires_at`);
CREATE INDEX IF NOT EXISTS `idx_admin_notifications_read` ON `admin_notifications` (`is_read`);
CREATE INDEX IF NOT EXISTS `idx_admin_notifications_created` ON `admin_notifications` (`created_at`);
CREATE INDEX IF NOT EXISTS `idx_email_verifications_user` ON `email_verifications` (`user_id`);
CREATE INDEX IF NOT EXISTS `idx_email_verifications_expires` ON `email_verifications` (`expires_at`);
