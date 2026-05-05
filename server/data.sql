-- Qismat E-commerce Initial Data
-- Run after structure.sql on database `qismyirz_qismat`. Seeds are idempotent (WHERE NOT EXISTS / NULL-only updates).
USE `qismyirz_qismat`;

-- Initial Users
INSERT INTO `users` (`name`, `email`, `password`, `role`)
SELECT 'Admin User', 'admin@example.com', 'admin123', 'admin'
WHERE NOT EXISTS (SELECT 1 FROM `users` WHERE `email` = 'admin@example.com');

INSERT INTO `users` (`name`, `email`, `password`, `role`)
SELECT 'Regular Customer', 'customer@example.com', 'customer123', 'customer'
WHERE NOT EXISTS (SELECT 1 FROM `users` WHERE `email` = 'customer@example.com');

-- Initial Products (regular_price optional; used for “was” price / promos on storefront)
INSERT INTO `products` (`name`, `sku`, `price`, `regular_price`, `image`, `description`, `category`, `stock`)
SELECT 'Classic Cotton Shirt', 'SKU-SHIRT-001', 890.00, 1190.00, 'https://images.unsplash.com/photo-1523381216845-0cbadbd0bad8?auto=format&fit=crop&w=800&q=80', 'Soft cotton shirt for everyday wear.', 'General', 18
WHERE NOT EXISTS (SELECT 1 FROM `products` WHERE `sku` = 'SKU-SHIRT-001');

INSERT INTO `products` (`name`, `sku`, `price`, `regular_price`, `image`, `description`, `category`, `stock`)
SELECT 'Leather Messenger Bag', 'SKU-BAG-001', 2590.00, 2990.00, 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=800&q=80', 'Stylish leather bag with enough room for work essentials.', 'General', 7
WHERE NOT EXISTS (SELECT 1 FROM `products` WHERE `sku` = 'SKU-BAG-001');

INSERT INTO `products` (`name`, `sku`, `price`, `regular_price`, `image`, `description`, `category`, `stock`)
SELECT 'Sport Sneakers', 'SKU-SHOE-001', 1490.00, 1790.00, 'https://images.unsplash.com/photo-1519741491121-6237070d3d1f?auto=format&fit=crop&w=800&q=80', 'Comfortable sneakers for daily activities and running.', 'General', 25
WHERE NOT EXISTS (SELECT 1 FROM `products` WHERE `sku` = 'SKU-SHOE-001');

-- Backfill regular_price for demo SKUs if DB was seeded before that column existed
UPDATE `products` SET `regular_price` = 1190.00 WHERE `sku` = 'SKU-SHIRT-001' AND `regular_price` IS NULL;
UPDATE `products` SET `regular_price` = 2990.00 WHERE `sku` = 'SKU-BAG-001' AND `regular_price` IS NULL;
UPDATE `products` SET `regular_price` = 1790.00 WHERE `sku` = 'SKU-SHOE-001' AND `regular_price` IS NULL;

-- Initial Couriers
INSERT INTO `couriers` (`name`, `phone`, `email`, `base_rate`)
SELECT 'Pathao', '+8801234567890', 'info@pathao.com', 50.00
WHERE NOT EXISTS (SELECT 1 FROM `couriers` WHERE `name` = 'Pathao');

INSERT INTO `couriers` (`name`, `phone`, `email`, `base_rate`)
SELECT 'Steadfast', '+8801234567891', 'info@steadfast.com', 60.00
WHERE NOT EXISTS (SELECT 1 FROM `couriers` WHERE `name` = 'Steadfast');

INSERT INTO `couriers` (`name`, `phone`, `email`, `base_rate`)
SELECT 'Sundarban', '+8801234567892', 'info@sundarban.com', 55.00
WHERE NOT EXISTS (SELECT 1 FROM `couriers` WHERE `name` = 'Sundarban');

-- Per-courier shipping hints (checkout may use global settings.* shipping_* instead)
UPDATE `couriers` SET `shipping_inside_dhaka` = 60.00 WHERE `name` IN ('Pathao', 'Steadfast', 'Sundarban') AND `shipping_inside_dhaka` IS NULL;
UPDATE `couriers` SET `shipping_outside_dhaka` = 120.00 WHERE `name` IN ('Pathao', 'Steadfast', 'Sundarban') AND `shipping_outside_dhaka` IS NULL;

-- Initial Settings
INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'ssl_store_id', 'your_store_id'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'ssl_store_id');

INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'ssl_store_password', 'your_store_password'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'ssl_store_password');

INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'ssl_is_live', 'false'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'ssl_is_live');

INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'steadfast_api_key', 'YOUR_STEADFAST_API_KEY'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'steadfast_api_key');

INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'steadfast_secret_key', 'YOUR_STEADFAST_SECRET_KEY'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'steadfast_secret_key');

INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'is_payment_enabled', 'true'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'is_payment_enabled');

INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'shipping_inside_dhaka', '60'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'shipping_inside_dhaka');

INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'shipping_outside_dhaka', '120'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'shipping_outside_dhaka');

INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'shipping_inside_point', '60'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'shipping_inside_point');

INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'shipping_inside_home', '80'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'shipping_inside_home');

INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'shipping_outside_point', '120'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'shipping_outside_point');

INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'shipping_outside_home', '120'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'shipping_outside_home');

INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'inside_dhaka_districts', 'Dhaka,Narayanganj,Gazipur,Munshiganj,Manikganj,Narsingdi'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'inside_dhaka_districts');

INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'steadfast_send_delivery_type', 'true'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'steadfast_send_delivery_type');

INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'steadfast_auto_dispatch_on_confirm', 'false'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'steadfast_auto_dispatch_on_confirm');

INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'auto_send_steadfast', 'false'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'auto_send_steadfast');

INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'steadfast_webhook_bearer_token', ''
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'steadfast_webhook_bearer_token');

INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'bkash_mode', 'manual'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'bkash_mode');

INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'bkash_number', '01700000000'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'bkash_number');

INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'nagad_mode', 'manual'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'nagad_mode');

INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'nagad_number', '01800000000'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'nagad_number');

INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'admin_email', 'admin@example.com'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'admin_email');

INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'smtp_user', ''
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'smtp_user');

INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'smtp_pass', ''
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'smtp_pass');

INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'theme_primary_color', '#ff5555'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'theme_primary_color');

INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'theme_sidebar_color', '#ffffff'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'theme_sidebar_color');

-- Admin-added category names (JSON array); merged with DISTINCT products.category in /api/products/meta/categories
INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'catalog_extra_categories', '[]'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'catalog_extra_categories');

INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'catalog_category_images', '{}'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'catalog_category_images');

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

-- Storefront (footer, floating contact — public via /api/settings)
INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'store_business_address', '-40, Inner circular road, first & second floor, naya paltan, Dhaka - 1000, Bangladesh'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'store_business_address');

INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'store_phone_tel', '+8801755579869'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'store_phone_tel');

INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'store_whatsapp_tel', '+8801755579864'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'store_whatsapp_tel');

INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'store_facebook_url', 'https://www.facebook.com/share/1DjnnXDabv/'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'store_facebook_url');

INSERT INTO `settings` (`setting_key`, `setting_value`)
SELECT 'store_messenger_url', 'https://www.facebook.com/share/1DjnnXDabv/'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'store_messenger_url');

-- Coupon seed
INSERT INTO `coupons` (`code`, `discount_type`, `discount_value`, `min_subtotal`, `is_active`)
SELECT 'WELCOME10', 'percent', 10.00, 500.00, 1
WHERE NOT EXISTS (SELECT 1 FROM `coupons` WHERE `code` = 'WELCOME10');

-- Keep coupon seed and existing values consistent with server-side rules.
UPDATE `coupons`
SET
  `discount_type` = 'percent',
  `discount_value` = 10.00,
  `min_subtotal` = 500.00,
  `is_active` = 1
WHERE `code` = 'WELCOME10';

UPDATE `coupons`
SET `discount_value` = 0
WHERE `discount_value` < 0;

UPDATE `coupons`
SET `discount_value` = 100
WHERE `discount_type` = 'percent' AND `discount_value` > 100;

-- Fruit categories and sample fruit products
UPDATE `settings`
SET `setting_value` = '["Mango","Litchi","Jackfruit","Pineapple","Papaya","Banana","Guava","Dragon Fruit","Orange","Watermelon"]'
WHERE `setting_key` = 'catalog_extra_categories';

INSERT INTO `products` (`name`, `sku`, `price`, `regular_price`, `image`, `description`, `category`, `stock`)
SELECT 'Haribhanga Mango (1kg)', 'SKU-FRUIT-MANGO-001', 220.00, 280.00, 'https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&w=1200&q=80', 'Sweet and juicy Haribhanga mango, freshly collected.', 'Mango', 9999
WHERE NOT EXISTS (SELECT 1 FROM `products` WHERE `sku` = 'SKU-FRUIT-MANGO-001');

INSERT INTO `products` (`name`, `sku`, `price`, `regular_price`, `image`, `description`, `category`, `stock`)
SELECT 'Bombai Litchi (500g)', 'SKU-FRUIT-LITCHI-001', 190.00, 240.00, 'https://images.unsplash.com/photo-1641823818171-80f667b6492f?auto=format&fit=crop&w=1200&q=80', 'Fresh seasonal Bombai litchi, hand sorted.', 'Litchi', 9999
WHERE NOT EXISTS (SELECT 1 FROM `products` WHERE `sku` = 'SKU-FRUIT-LITCHI-001');

INSERT INTO `products` (`name`, `sku`, `price`, `regular_price`, `image`, `description`, `category`, `stock`)
SELECT 'Ripe Jackfruit (piece)', 'SKU-FRUIT-JACK-001', 650.00, 790.00, 'https://images.unsplash.com/photo-1563114773-84221bd62daa?auto=format&fit=crop&w=1200&q=80', 'Naturally ripened jackfruit with rich flavor.', 'Jackfruit', 9999
WHERE NOT EXISTS (SELECT 1 FROM `products` WHERE `sku` = 'SKU-FRUIT-JACK-001');

INSERT INTO `products` (`name`, `sku`, `price`, `regular_price`, `image`, `description`, `category`, `stock`)
SELECT 'Sweet Pineapple (piece)', 'SKU-FRUIT-PINE-001', 140.00, 180.00, 'https://images.unsplash.com/photo-1589820296156-2454bb8a6ad1?auto=format&fit=crop&w=1200&q=80', 'Farm-fresh pineapple with balanced sweetness.', 'Pineapple', 9999
WHERE NOT EXISTS (SELECT 1 FROM `products` WHERE `sku` = 'SKU-FRUIT-PINE-001');

INSERT INTO `products` (`name`, `sku`, `price`, `regular_price`, `image`, `description`, `category`, `stock`)
SELECT 'Red Lady Papaya (1kg)', 'SKU-FRUIT-PAPAYA-001', 95.00, 120.00, 'https://images.unsplash.com/photo-1526318472351-c75fcf070305?auto=format&fit=crop&w=1200&q=80', 'Fresh papaya, perfect for breakfast and smoothies.', 'Papaya', 9999
WHERE NOT EXISTS (SELECT 1 FROM `products` WHERE `sku` = 'SKU-FRUIT-PAPAYA-001');

INSERT INTO `products` (`name`, `sku`, `price`, `regular_price`, `image`, `description`, `category`, `stock`)
SELECT 'Sagor Banana (12 pcs)', 'SKU-FRUIT-BANANA-001', 110.00, 135.00, 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=1200&q=80', 'Naturally ripened Sagor bananas, good energy source.', 'Banana', 9999
WHERE NOT EXISTS (SELECT 1 FROM `products` WHERE `sku` = 'SKU-FRUIT-BANANA-001');

INSERT INTO `products` (`name`, `sku`, `price`, `regular_price`, `image`, `description`, `category`, `stock`)
SELECT 'Thai Guava (1kg)', 'SKU-FRUIT-GUAVA-001', 130.00, 165.00, 'https://images.unsplash.com/photo-1594282486552-05a2fd3b4b04?auto=format&fit=crop&w=1200&q=80', 'Crispy and fresh Thai guava for healthy snacks.', 'Guava', 9999
WHERE NOT EXISTS (SELECT 1 FROM `products` WHERE `sku` = 'SKU-FRUIT-GUAVA-001');

INSERT INTO `products` (`name`, `sku`, `price`, `regular_price`, `image`, `description`, `category`, `stock`)
SELECT 'Dragon Fruit (piece)', 'SKU-FRUIT-DRAGON-001', 170.00, 220.00, 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?auto=format&fit=crop&w=1200&q=80', 'Premium dragon fruit with vibrant color and taste.', 'Dragon Fruit', 9999
WHERE NOT EXISTS (SELECT 1 FROM `products` WHERE `sku` = 'SKU-FRUIT-DRAGON-001');

INSERT INTO `products` (`name`, `sku`, `price`, `regular_price`, `image`, `description`, `category`, `stock`)
SELECT 'Imported Orange (1kg)', 'SKU-FRUIT-ORANGE-001', 260.00, 310.00, 'https://images.unsplash.com/photo-1580052614034-c55d20bfee3b?auto=format&fit=crop&w=1200&q=80', 'Juicy oranges ideal for direct eating or juice.', 'Orange', 9999
WHERE NOT EXISTS (SELECT 1 FROM `products` WHERE `sku` = 'SKU-FRUIT-ORANGE-001');

INSERT INTO `products` (`name`, `sku`, `price`, `regular_price`, `image`, `description`, `category`, `stock`)
SELECT 'Red Watermelon (piece)', 'SKU-FRUIT-WM-001', 320.00, 380.00, 'https://images.unsplash.com/photo-1563114773-84221bd62daa?auto=format&fit=crop&w=1200&q=80', 'Hydrating and sweet watermelon, summer favorite.', 'Watermelon', 9999
WHERE NOT EXISTS (SELECT 1 FROM `products` WHERE `sku` = 'SKU-FRUIT-WM-001');
