const authModels = require("../models/authModel");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { EmailVerification, PasswordReset, User } = require('../database/models');
const emailService = require('../services/emailService');


// Register new user
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

    // Generate email verification token
    const secret = process.env.JWT_SECRET;
    const verificationToken = jwt.sign(
      { userId: user.id, email: user.email, purpose: 'email-verification' },
      secret,
      { expiresIn: '24h' }
    );

    // Create verification record
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await EmailVerification.create({
      user_id: user.id,
      token: verificationToken,
      token_expires_at: expiresAt
    });

    // Send verification email (non-blocking - don't fail registration if email fails)
    try {
      await emailService.sendVerificationEmail(
        user.email,
        user.name,
        verificationToken
      );
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      // Continue anyway - user is created, they can resend email later
    }

    // Return success message (do not auto-login - require email verification)
    return res.status(201).json({ 
      message: 'Account created successfully! Please check your email to verify your account.',
      email: user.email,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
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

    // Check if email is verified
    const pendingVerification = await EmailVerification.findByUserId(found.id);
    if (pendingVerification) {
      // Check if token expired
      if (pendingVerification.isExpired()) {
        return res.status(401).json({ 
          error: 'Email verification expired',
          code: 'VERIFICATION_EXPIRED',
          message: 'Your verification link has expired. Please request a new one.',
          email: found.email
        });
      }
      
      return res.status(401).json({ 
        error: 'Email not verified',
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email before logging in. Check your inbox.',
        email: found.email
      });
    }

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

// Verify email endpoint
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.query || req.body;

    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    // Verify JWT signature and expiry
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(400).json({ 
          error: 'Verification link has expired',
          code: 'EXPIRED'
        });
      }
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(400).json({ 
          error: 'Invalid verification link' 
        });
      }
      throw jwtError;
    }

    // Validate token purpose
    if (decoded.purpose !== 'email-verification') {
      return res.status(400).json({ error: 'Invalid token purpose' });
    }

    // Find verification record
    const verification = await EmailVerification.findByToken(token);

    if (!verification) {
      return res.status(400).json({ 
        error: 'Invalid or already used verification link',
        code: 'INVALID_TOKEN'
      });
    }

    // Check database expiry (double check)
    if (verification.isExpired()) {
      await verification.destroy(); // Clean up expired
      return res.status(400).json({ 
        error: 'Verification link has expired',
        code: 'EXPIRED'
      });
    }

    // Delete verification record (marks user as verified)
    await verification.destroy();

    res.json({ 
      success: true,
      message: 'Email verified successfully! You can now log in.'
    });

  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
};

// Resend verification email endpoint
exports.resendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const normEmail = String(email).trim().toLowerCase();

    // Find user
    const user = await authModels.getUserByEmail(normEmail);
    if (!user) {
      // Don't reveal if email exists or not (security best practice)
      return res.json({ 
        message: 'If that email is registered and unverified, a verification link has been sent.' 
      });
    }

    // Check if email is already verified (no pending verification)
    const pendingVerification = await EmailVerification.findByUserId(user.id);
    if (!pendingVerification) {
      // Email already verified
      return res.status(400).json({ 
        error: 'Email is already verified. You can log in.',
        code: 'ALREADY_VERIFIED'
      });
    }

    // Generate new token
    const verificationToken = jwt.sign(
      { userId: user.id, email: user.email, purpose: 'email-verification' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Update existing verification record
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await pendingVerification.update({
      token: verificationToken,
      token_expires_at: expiresAt
    });

    // Send verification email
    try {
      await emailService.sendVerificationEmail(
        user.email,
        user.name,
        verificationToken
      );

      res.json({ 
        success: true,
        message: 'Verification email sent. Please check your inbox.' 
      });
    } catch (emailError) {
      console.error('Failed to resend verification email:', emailError);
      res.status(500).json({ 
        error: 'Failed to send verification email. Please try again later.' 
      });
    }

  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'Failed to resend verification email' });
  }
};

// Request password reset endpoint
exports.requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body || {};

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const normEmail = String(email).trim().toLowerCase();
    const user = await authModels.getUserByEmail(normEmail);

    // Always return a generic response to avoid email enumeration
    if (!user) {
      return res.json({
        message: 'If that email is registered, a password reset link has been sent.'
      });
    }

    const resetToken = jwt.sign(
      { userId: user.id, email: user.email, purpose: 'password-reset' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await PasswordReset.upsertForUser(user.id, resetToken, expiresAt);

    try {
      await emailService.sendPasswordResetEmail(user.email, user.name, resetToken);
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);
      return res.status(500).json({ error: 'Failed to send password reset email. Please try again later.' });
    }

    return res.json({
      message: 'If that email is registered, a password reset link has been sent.'
    });
  } catch (error) {
    console.error('Request password reset error:', error);
    return res.status(500).json({ error: 'Failed to request password reset' });
  }
};

// Reset password endpoint
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body || {};

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(400).json({ error: 'Reset link has expired', code: 'EXPIRED' });
      }
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(400).json({ error: 'Invalid reset link' });
      }
      throw jwtError;
    }

    if (decoded.purpose !== 'password-reset') {
      return res.status(400).json({ error: 'Invalid token purpose' });
    }

    const resetRecord = await PasswordReset.findByToken(token);
    if (!resetRecord) {
      return res.status(400).json({ error: 'Invalid or already used reset link' });
    }

    if (resetRecord.isExpired()) {
      await resetRecord.destroy();
      return res.status(400).json({ error: 'Reset link has expired', code: 'EXPIRED' });
    }

    const user = await User.findByPk(decoded.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);
    user.password_hash = password_hash;
    await user.save();

    await resetRecord.destroy();

    return res.json({
      success: true,
      message: 'Password reset successfully. You can now sign in.'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
};
