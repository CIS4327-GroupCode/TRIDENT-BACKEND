const authModels = require("../models/authModel");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");


// Register controller
exports.register = async (req, res) => {
  try {
    const { 
      name, 
      email, 
      password, 
      role, 
      mfa_enabled,
      organizationData,
      researcherData 
    } = req.body || {};
    
    if (!name || !email || !password)
      return res
        .status(400)
        .json({ error: "name, email and password are required" });

    // Validate role
    const validRoles = ['researcher', 'nonprofit', 'admin'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: "invalid role. Must be one of: researcher, nonprofit, admin" });
    }

    // Validate nonprofit-specific requirements
    if (role === 'nonprofit' && !organizationData) {
      return res.status(400).json({ 
        error: "organizationData is required for nonprofit role",
        required: ["name"]
      });
    }

    // Validate researcher-specific requirements
    if (role === 'researcher' && researcherData) {
      // Validate rate range if provided
      if (researcherData.rate_min && researcherData.rate_max) {
        if (researcherData.rate_min > researcherData.rate_max) {
          return res.status(400).json({ error: "rate_min must be less than rate_max" });
        }
      }
    }

    // basic email normalization
    const normEmail = String(email).trim().toLowerCase();

    // check existing - findUserByEmail
    const exists = await authModels.findUserByEmail(normEmail);
    if (exists)
      return res.status(409).json({ error: "email already in use" });

    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);
    
    // create user with profile - createUser
    const user = await authModels.createUser(
      name, 
      normEmail, 
      password_hash, 
      role, 
      mfa_enabled,
      organizationData,
      researcherData
    );

    // Sign JWT and return created user (do not return password_hash)
    const secret = process.env.JWT_SECRET;
    const token = jwt.sign(
      { userId: user.id, role: user.role, email: user.email },
      secret,
      { expiresIn: "7d" }
    );
    return res.status(201).json({ user, token });
  } catch (err) {
    console.error("register error", err);
    return res.status(500).json({ error: "internal error" });
  }
};

// Login controller
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ error: "email and password are required" });

    const normEmail = String(email).trim().toLowerCase();
    // get user by email - getUserByEmail
    const found = await authModels.getUserByEmail(normEmail);
    if (!found)
      return res.status(401).json({ error: "invalid email" });
    // check password
    const ok = await bcrypt.compare(password, found.password_hash || "");
    if (!ok)
      return res.status(401).json({ error: "invalid password" });

    // build a safe user object without sensitive fields
    const user = {
      id: found.id,
      name: found.name,
      email: found.email,
      role: found.role,
      created_at: found.created_at,
    };

    const secret = process.env.JWT_SECRET;
    const token = jwt.sign(
      { userId: user.id, role: user.role, email: user.email },
      secret,
      { expiresIn: "7d" }
    );

    return res.json({ user, token });
  } catch (err) {
    console.error("login error", err);
    return res.status(500).json({ error: "internal error" });
  }
};
