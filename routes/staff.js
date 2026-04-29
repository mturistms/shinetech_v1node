const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { body, param, validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs');

// Helper to save Base64 image
const saveBase64Image = (base64String, req) => {
    try {
        if (!base64String || !base64String.startsWith('data:image')) return null;

        const matches = base64String.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) return null;

        const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
        const data = matches[2];
        const buffer = Buffer.from(data, 'base64');

        const uploadDir = path.join(__dirname, '../uploads/staff');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const filename = `staff-${Date.now()}-${Math.round(Math.random() * 1E9)}.${ext}`;
        const filepath = path.join(uploadDir, filename);

        fs.writeFileSync(filepath, buffer);
        return `/uploads/staff/${filename}`;
    } catch (err) {
        console.error('Error saving base64 image:', err);
        return null;
    }
};

// GET all staff
router.get('/', authenticate, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM staff ORDER BY name ASC');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error fetching staff' });
    }
});

// GET active employees (for mechanics dropdown)
router.get('/mechanics', authenticate, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT id, name, phone, designation FROM staff WHERE LOWER(designation) != "manager" AND status = "active" ORDER BY name ASC');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error fetching mechanics' });
    }
});

// POST create staff
router.post('/', authenticate, [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('designation').trim().notEmpty().withMessage('Designation is required'),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, age, phone, designation, email, aadhar, address, native_place, status, photo } = req.body;
    const finalDesignation = designation ? designation.trim() : 'Employee';

    // Handle Base64 photo
    let photoPath = null;
    if (photo && photo.startsWith('data:image')) {
        photoPath = saveBase64Image(photo);
    } else if (photo && photo.startsWith('http')) {
        photoPath = photo; // Keep assuming it's a URL
    }

    try {
        const [result] = await db.execute(
            `INSERT INTO staff (name, age, phone, designation, email, aadhar, address, native_place, photo, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, age || null, phone || null, finalDesignation, email || null, aadhar || null, address || null, native_place || null, photoPath, status || 'active']
        );
        res.status(201).json({ id: result.insertId, message: 'Staff member added', photo: photoPath });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error adding staff' });
    }
});

// PUT update staff
router.put('/:id', authenticate, async (req, res) => {
    const { id } = req.params;
    const { name, age, phone, designation, email, aadhar, address, native_place, status, photo } = req.body;

    try {
        let fields = [];
        let values = [];

        let newPhotoPath = undefined;
        if (photo && photo.startsWith('data:image')) {
            newPhotoPath = saveBase64Image(photo);
            if (newPhotoPath) {
                fields.push('photo = ?');
                values.push(newPhotoPath);
            }
        } else if (photo !== undefined) {
            // If photo is sent as null or URL, update it. If undefined, ignore.
            // Note: Frontend should send null or existing URL if no change? 
            // Logic: If photo is NOT base64 but is a string, it might be the existing URL or new URL.
            // If it's the same URL, updating it is harmless.
            fields.push('photo = ?');
            values.push(photo);
        }

        const finalDesignation = designation !== undefined ? (designation ? designation.trim() : '') : undefined;
        console.log('PUT Staff Update:', { id, body: req.body, finalDesignation });

        // Explicitly handle designation to ensure it updates even if empty string
        if (finalDesignation !== undefined) {
            fields.push('designation = ?');
            values.push(finalDesignation);
        }

        const map = { name, age, phone, email, aadhar, address, native_place, status };

        for (const [key, val] of Object.entries(map)) {
            if (val !== undefined) {
                fields.push(`${key} = ?`);
                values.push(val);
            }
        }

        if (fields.length === 0) return res.json({ message: 'No changes' });

        values.push(id);
        await db.execute(`UPDATE staff SET ${fields.join(', ')} WHERE id = ?`, values);
        res.json({ message: 'Staff updated', photo: newPhotoPath });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error updating staff' });
    }
});

// DELETE staff
router.delete('/:id', authenticate, authorize(['admin']), async (req, res) => {
    try {
        await db.execute('DELETE FROM staff WHERE id = ?', [req.params.id]);
        res.json({ message: 'Staff deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error deleting staff' });
    }
});

module.exports = router;
