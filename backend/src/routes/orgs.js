import express from "express";
import pool from "../db.js"; 

console.log(">>> Loading routes/orgs.js");

const router = express.Router();

// GET /api/orgs/:id - public view
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "SELECT id, name, mission, focus_areas, needs, contact_email FROM orgs WHERE id = $1",
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Org not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/orgs - create org profile (nonprofit)
router.post("/", async (req, res) => {
	console.log(">>> HIT POST /api/orgs with body:", req.body);
  const { name, mission, focus_areas, needs, contact_email } = req.body;

  if (!name || !contact_email) {
    return res.status(400).json({ error: "Name and contact_email are required" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO orgs (name, mission, focus_areas, needs, contact_email)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, mission, focus_areas, needs, contact_email]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/orgs/:id - update profile
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const { name, mission, focus_areas, needs, contact_email } = req.body;
  try {
    const result = await pool.query(
      `UPDATE orgs
       SET name = COALESCE($1, name),
           mission = COALESCE($2, mission),
           focus_areas = COALESCE($3, focus_areas),
           needs = COALESCE($4, needs),
           contact_email = COALESCE($5, contact_email),
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [name, mission, focus_areas, needs, contact_email, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Org not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
