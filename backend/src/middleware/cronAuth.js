const validateCronRequest = (req, res, next) => {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL === '1') {
      return res.status(500).json({ error: 'CRON_SECRET is not configured' });
    }

    return next();
  }

  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized cron request' });
  }

  return next();
};

module.exports = {
  validateCronRequest,
};