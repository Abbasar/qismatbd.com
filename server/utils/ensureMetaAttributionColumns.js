/** Adds Meta CAPI attribution columns on orders when missing (safe on MariaDB / MySQL 5.7+). */
async function ensureMetaAttributionColumns(db) {
  const [rows] = await db.query(
    `SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders'
       AND COLUMN_NAME IN (
         'meta_fbp',
         'meta_fbc',
         'meta_client_ip',
         'meta_user_agent',
         'meta_event_source_url',
         'meta_delivery_area',
         'meta_external_id',
         'meta_capi_purchase_sent'
       )`
  );
  const have = new Set((rows || []).map((r) => r.name));

  const add = async (name, sql) => {
    if (have.has(name)) return;
    await db.query(sql);
    console.log(`[migrate] orders.${name} added`);
  };

  await add('meta_fbp', 'ALTER TABLE `orders` ADD COLUMN `meta_fbp` VARCHAR(255) NULL');
  await add('meta_fbc', 'ALTER TABLE `orders` ADD COLUMN `meta_fbc` VARCHAR(255) NULL');
  await add(
    'meta_client_ip',
    'ALTER TABLE `orders` ADD COLUMN `meta_client_ip` VARCHAR(45) NULL'
  );
  await add(
    'meta_user_agent',
    'ALTER TABLE `orders` ADD COLUMN `meta_user_agent` VARCHAR(512) NULL'
  );
  await add(
    'meta_event_source_url',
    'ALTER TABLE `orders` ADD COLUMN `meta_event_source_url` VARCHAR(2048) NULL'
  );
  await add(
    'meta_delivery_area',
    'ALTER TABLE `orders` ADD COLUMN `meta_delivery_area` VARCHAR(80) NULL'
  );
  await add(
    'meta_external_id',
    'ALTER TABLE `orders` ADD COLUMN `meta_external_id` VARCHAR(64) NULL'
  );
  await add(
    'meta_capi_purchase_sent',
    'ALTER TABLE `orders` ADD COLUMN `meta_capi_purchase_sent` TINYINT(1) NOT NULL DEFAULT 0'
  );
}

module.exports = { ensureMetaAttributionColumns };
