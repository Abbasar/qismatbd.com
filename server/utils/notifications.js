const db = require('../db');

const createAdminNotification = async ({
  type,
  title,
  message,
  entityType = null,
  entityId = null,
}) => {
  try {
    await db.query(
      `INSERT INTO admin_notifications
       (type, title, message, entity_type, entity_id, is_read)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [type, title, message, entityType, entityId]
    );
  } catch (error) {
    // Do not block main flow if notifications table is unavailable.
    if (error?.code !== 'ER_NO_SUCH_TABLE') {
      console.error('Notification insert failed:', error.message);
    }
  }
};

module.exports = {
  createAdminNotification,
};
