/** Adds product landing-page columns when missing (safe on MariaDB / MySQL 5.7+). */
async function ensureLandingColumns(db) {
  const [rows] = await db.query(
    `SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products'
       AND COLUMN_NAME IN ('landing_enabled', 'landing_slides', 'landing_video_url')`
  );
  const have = new Set((rows || []).map((r) => r.name));

  if (!have.has('landing_enabled')) {
    await db.query(
      'ALTER TABLE `products` ADD COLUMN `landing_enabled` TINYINT(1) NOT NULL DEFAULT 0'
    );
    console.log('[migrate] products.landing_enabled added');
  }
  if (!have.has('landing_slides')) {
    await db.query('ALTER TABLE `products` ADD COLUMN `landing_slides` JSON NULL');
    console.log('[migrate] products.landing_slides added');
  }
  if (!have.has('landing_video_url')) {
    await db.query(
      'ALTER TABLE `products` ADD COLUMN `landing_video_url` VARCHAR(500) NULL'
    );
    console.log('[migrate] products.landing_video_url added');
  }
}

module.exports = { ensureLandingColumns };
