const express = require('express');
const router = express.Router();

const messages = []; // [{ id, userId, text, createdAt }]
let nextId = 1;

// list messages (latest 50)
router.get('/', (_req, res) => {
  res.json(messages.slice(-50));
});

// post a message
router.post('/', express.json(), (req, res) => {
  const { userId = 'anon', text } = req.body || {};
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text required' });
  }
  const msg = {
    id: nextId++,
    userId,
    text: text.trim(),
    createdAt: new Date().toISOString(),
  };
  messages.push(msg);
  res.status(201).json(msg);
});

module.exports = router;
