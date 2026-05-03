const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sendServerError } = require('../utils/httpError');
const { parseProductRow } = require('../utils/parseProductRow');
const router = express.Router();

router.post('/add', requireAuth, async (req, res) => {
    try {
        const productId = Number(req.body.productId);
        const userId = Number(req.authUser.id);
        if (!productId) {
            return res.status(400).json({ message: 'Product ID is required' });
        }
        await db.query(
            'INSERT IGNORE INTO wishlist (user_id, product_id) VALUES (?, ?)',
            [userId, productId]
        );
        res.json({ message: 'Product added to wishlist!' });
    } catch (error) {
        return sendServerError(res, 'Unable to add to wishlist', error);
    }
});

router.get('/:userId', requireAuth, async (req, res) => {
    try {
        const uid = Number(req.params.userId);
        if (Number(req.authUser.id) !== uid && req.authUser.role !== 'admin') {
            return res.status(403).json({ message: 'Forbidden' });
        }
        const [rows] = await db.query(
            `SELECT p.*
             FROM wishlist w
             JOIN products p ON w.product_id = p.id
             WHERE w.user_id = ?
             ORDER BY w.id DESC`,
            [uid]
        );
        res.json(rows.map(parseProductRow));
    } catch (error) {
        return sendServerError(res, 'Unable to load wishlist', error);
    }
});

router.delete('/:userId/:productId', requireAuth, async (req, res) => {
    try {
        const uid = Number(req.params.userId);
        const productId = Number(req.params.productId);
        if (Number(req.authUser.id) !== uid && req.authUser.role !== 'admin') {
            return res.status(403).json({ message: 'Forbidden' });
        }
        await db.query(
            'DELETE FROM wishlist WHERE user_id = ? AND product_id = ?',
            [uid, productId]
        );
        res.json({ message: 'Product removed from wishlist' });
    } catch (error) {
        return sendServerError(res, 'Unable to remove from wishlist', error);
    }
});

module.exports = router;
