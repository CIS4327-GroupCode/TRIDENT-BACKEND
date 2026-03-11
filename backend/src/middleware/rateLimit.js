const WINDOW_MS = 15 * 60 * 1000;

function createRateLimiter({ windowMs = WINDOW_MS, maxRequests = 10, keySelector } = {}) {
  const buckets = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = (keySelector && keySelector(req)) || req.ip || 'global';

    const current = buckets.get(key);
    if (!current || now - current.windowStart >= windowMs) {
      buckets.set(key, { count: 1, windowStart: now });
      return next();
    }

    if (current.count >= maxRequests) {
      const retryAfterSeconds = Math.ceil((windowMs - (now - current.windowStart)) / 1000);
      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    current.count += 1;
    return next();
  };
}

module.exports = {
  createRateLimiter,
};
