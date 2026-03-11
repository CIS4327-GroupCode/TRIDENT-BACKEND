const { createRateLimiter } = require('../../src/middleware/rateLimit');

describe('rateLimit middleware', () => {
  it('allows requests until limit is reached, then returns 429', () => {
    const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 2, keySelector: () => 'test-key' });

    const makeReq = () => ({ ip: '127.0.0.1', body: {} });
    const next = jest.fn();
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      set: jest.fn()
    };

    limiter(makeReq(), res, next);
    limiter(makeReq(), res, next);
    limiter(makeReq(), res, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.set).toHaveBeenCalledWith('Retry-After', expect.any(String));
    expect(res.json).toHaveBeenCalledWith({ error: 'Too many requests. Please try again later.' });
  });
});
