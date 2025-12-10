import express from "express";
import pool from "../database/index.js";
import { encryptMessage, decryptMessage } from "../utils/encryption.js";

const router = express.Router();

// SEND MESSAGE (Encrypt)
router.post("/send", async (req, res) => {
    try {
        const { thread_id, sender_id, recipient_id, body } = req.body;

        // Encrypt plaintext
        const encryptedBody = encryptMessage(body, process.env.MSG_SECRET);

        // Store encrypted JSON string in "body" column
        await pool.query(
            `INSERT INTO messages (thread_id, sender_id, recipient_id, body)
             VALUES ($1, $2, $3, $4);`,
            [thread_id, sender_id, recipient_id, encryptedBody]
        );

        res.json({ success: true, message: "Encrypted message saved." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to send message" });
    }
});

// LOAD MESSAGES (Decrypt)
router.get("/thread/:threadId", async (req, res) => {
    try {
        const { threadId } = req.params;

        const result = await pool.query(
            `SELECT * FROM messages WHERE thread_id = $1 ORDER BY created_at ASC`,
            [threadId]
        );

        const key = process.env.MSG_SECRET;

        const messages = result.rows.map(row => ({
            id: row.id,
            sender_id: row.sender_id,
            recipient_id: row.recipient_id,
            created_at: row.created_at,
            body: decryptMessage(row.body, key),   // decrypted text
            attachments: row.attachments
        }));

        res.json({ success: true, messages });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to load messages" });
    }
});

export default router;
