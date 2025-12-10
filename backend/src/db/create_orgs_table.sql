CREATE TABLE IF NOT EXISTS orgs (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    mission TEXT,
    focus_areas TEXT,
    needs TEXT,
    contact_email TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
