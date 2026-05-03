const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendServerError } = require('../utils/httpError');

const router = express.Router();

router.get('/admin/notifications', requireAuth, requireAdmin, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const unreadOnly = String(req.query.unreadOnly || '') === '1';
    const [rows] = await db.query(
      `SELECT id, type, title, message, entity_type, entity_id, is_read, created_at
       FROM admin_notifications
       ${unreadOnly ? 'WHERE is_read = 0' : ''}
       ORDER BY created_at DESC
       LIMIT ?`,
      [limit]
    );
    res.json(rows);
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ message: 'Notifications table missing. Update database using server/structure.sql' });
    }
    return sendServerError(res, 'Unable to load notifications', error);
  }
});

router.get('/admin/notifications/unread-count', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [rows] = await db.query('SELECT COUNT(*) AS unreadCount FROM admin_notifications WHERE is_read = 0');
    res.json({ unreadCount: Number(rows[0]?.unreadCount || 0) });
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ message: 'Notifications table missing. Update database using server/structure.sql' });
    }
    return sendServerError(res, 'Unable to load unread count', error);
  }
});

router.put('/admin/notifications/:id/read', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [result] = await db.query('UPDATE admin_notifications SET is_read = 1 WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Notification not found' });
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ message: 'Notifications table missing. Update database using server/structure.sql' });
    }
    return sendServerError(res, 'Unable to mark notification as read', error);
  }
});

router.put('/admin/notifications/read-all', requireAuth, requireAdmin, async (_req, res) => {
  try {
    await db.query('UPDATE admin_notifications SET is_read = 1 WHERE is_read = 0');
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ message: 'Notifications table missing. Update database using server/structure.sql' });
    }
    return sendServerError(res, 'Unable to mark all notifications as read', error);
  }
});

router.delete('/admin/notifications/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM admin_notifications WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Notification not found' });
    res.json({ message: 'Notification deleted' });
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ message: 'Notifications table missing. Update database using server/structure.sql' });
    }
    return sendServerError(res, 'Unable to delete notification', error);
  }
});

router.delete('/admin/notifications', requireAuth, requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM admin_notifications');
    res.json({ message: 'All notifications deleted' });
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ message: 'Notifications table missing. Update database using server/structure.sql' });
    }
    return sendServerError(res, 'Unable to delete notifications', error);
  }
});

module.exports = router;
