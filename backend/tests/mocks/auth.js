/**
 * Mock Authentication Middleware
 * Use for unit testing controllers without database dependencies
 */

/**
 * Mock authenticate middleware - simulates authenticated user
 */
const mockAuthenticate = (userData = {}) => {
  return (req, res, next) => {
    req.user = {
      id: userData.id || 1,
      name: userData.name || 'Test User',
      email: userData.email || 'test@example.com',
      role: userData.role || 'researcher',
      account_status: userData.account_status || 'active',
      org_id: userData.org_id || null,
      ...userData
    };
    next();
  };
};

/**
 * Mock requireAdmin middleware
 */
const mockRequireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Admin access required' });
  }
};

/**
 * Mock requireNonprofit middleware
 */
const mockRequireNonprofit = (req, res, next) => {
  if (req.user && req.user.role === 'nonprofit') {
    next();
  } else {
    res.status(403).json({ error: 'Nonprofit access required' });
  }
};

/**
 * Mock requireResearcher middleware
 */
const mockRequireResearcher = (req, res, next) => {
  if (req.user && req.user.role === 'researcher') {
    next();
  } else {
    res.status(403).json({ error: 'Researcher access required' });
  }
};

/**
 * Mock JWT verification
 */
const mockJwtVerify = (token, secret) => {
  if (token === 'valid-token') {
    return { userId: 1, role: 'researcher', email: 'test@example.com' };
  }
  if (token === 'admin-token') {
    return { userId: 2, role: 'admin', email: 'admin@example.com' };
  }
  if (token === 'nonprofit-token') {
    return { userId: 3, role: 'nonprofit', email: 'nonprofit@example.com' };
  }
  throw new Error('Invalid token');
};

/**
 * Mock JWT sign
 */
const mockJwtSign = (payload, secret, options) => {
  return 'mocked-jwt-token';
};

module.exports = {
  mockAuthenticate,
  mockRequireAdmin,
  mockRequireNonprofit,
  mockRequireResearcher,
  mockJwtVerify,
  mockJwtSign
};
