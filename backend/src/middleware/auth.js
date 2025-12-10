const jwt = require('jsonwebtoken');
const { User } = require('../database/models');

/**
 * Middleware to verify JWT token and attach user to request
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if user exists and is not deleted
    const user = await User.findByPk(decoded.userId, {
      attributes: ['id', 'name', 'email', 'role', 'account_status', 'deleted_at'],
      paranoid: false  // Include soft-deleted users for explicit checking
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid token - user not found' });
    }

    if (user.deleted_at) {
      return res.status(401).json({ error: 'Account has been suspended' });
    }

    if (user.account_status === 'suspended') {
      return res.status(401).json({ error: 'Account has been suspended' });
    }

    if (user.account_status === 'pending') {
      return res.status(401).json({ error: 'Account pending approval' });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    console.error('Authentication error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Middleware to check if user has admin role
 */
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

/**
 * Middleware to check if user has nonprofit role
 */
const requireNonprofit = (req, res, next) => {
  if (req.user.role !== 'nonprofit') {
    return res.status(403).json({ error: 'Nonprofit access required' });
  }
  next();
};

/**
 * Middleware to check if user has researcher role
 */
const requireResearcher = (req, res, next) => {
  if (req.user.role !== 'researcher') {
    return res.status(403).json({ error: 'Researcher access required' });
  }
  next();
};

module.exports = {
  authenticate,
  requireAdmin,
  requireNonprofit,
  requireResearcher
};
