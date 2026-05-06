const shouldRunProcessSchedulers = (env = process.env) => {
  if (env.ENABLE_PROCESS_SCHEDULERS === 'true') {
    return true;
  }

  if (env.ENABLE_PROCESS_SCHEDULERS === 'false') {
    return false;
  }

  if (env.VERCEL === '1') {
    return false;
  }

  return env.NODE_ENV !== 'production';
};

module.exports = {
  shouldRunProcessSchedulers,
};