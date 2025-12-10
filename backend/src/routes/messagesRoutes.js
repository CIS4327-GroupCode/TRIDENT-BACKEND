const express = require("express");
const router = express.Router();
const { encryptMessage, decryptMessage } = require("../utils/encryption");
const sequelize = require("../database"); // your existing DB connection

// SEND MESSAGE (encrypt before storing)
router.post("/send", async (req, res) => {
    try {
        const { thread_id, sender_id, recipient_id, body } = req.body;

        const encryptedBody = encryptMessage(body, process.env.MSG_SECRET);

        await sequelize.query(
            `INSERT INTO messages (thread_id, sender_id, recipient_id, body)
             VALUES ($1, $2, $3, $4);`,
            {
                bind: [thread_id, sender_id, recipient_id, encryptedBody]
            }
        );

        res.json({ success: true, message: "Encrypted message saved." });
    } catch (err) {
        console.error("SEND ERROR:", err);
        res.status(500).json({ error: "Failed to send message" });
    }
});

// GET MESSAGE THREAD (decrypt before sending)
router.get("/thread/:threadId", async (req, res) => {
    try {
        const { threadId } = req.params;

        const [rows] = await sequelize.query(
            `SELECT * FROM messages WHERE thread_id = $1 ORDER BY created_at ASC`,
            { bind: [threadId] }
        );

        const key = process.env.MSG_SECRET;

        const messages = rows.map(row => ({
            id: row.id,
            sender_id: row.sender_id,
            recipient_id: row.recipient_id,
            created_at: row.created_at,
            body: decryptMessage(row.body, key),
            attachments: row.attachments
        }));

        res.json({ success: true, messages });
    } catch (err) {
        console.error("FETCH ERROR:", err);
        res.status(500).json({ error: "Failed to load messages" });
    }
});

module.exports = router;

// ADMIN MESSAGE RETRIEVAL
router.get("/admin/thread/:threadId", async (req, res) => {
  const { threadId } = req.params;

  const [rows] = await sequelize.query(
      "SELECT * FROM messages WHERE thread_id = $1 ORDER BY created_at ASC",
      { bind: [threadId] }
  );

  const messages = rows.map(r => ({
      ...r,
      body: decryptMessage(r.body, process.env.MSG_SECRET)
  }));

  res.json({ success: true, messages });
});

