const db = require('../db');
const { ensureLandingColumns } = require('../utils/ensureLandingColumns');

(async () => {
  await ensureLandingColumns(db);
  const [rows] = await db.query(
    "SHOW COLUMNS FROM products WHERE Field LIKE 'landing%'"
  );
  console.log(rows);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
