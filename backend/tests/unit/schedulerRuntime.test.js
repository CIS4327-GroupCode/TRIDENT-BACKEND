const { shouldRunProcessSchedulers } = require('../../src/utils/schedulerRuntime');

describe('scheduler runtime ownership', () => {
  test('runs schedulers in local development by default', () => {
    expect(
      shouldRunProcessSchedulers({ NODE_ENV: 'development', VERCEL: '0' })
    ).toBe(true);
  });

  test('does not run schedulers in production without explicit opt-in', () => {
    expect(
      shouldRunProcessSchedulers({ NODE_ENV: 'production', VERCEL: '0' })
    ).toBe(false);
  });

  test('does not run schedulers on vercel by default', () => {
    expect(
      shouldRunProcessSchedulers({ NODE_ENV: 'production', VERCEL: '1' })
    ).toBe(false);
  });

  test('allows explicit dedicated-worker opt-in', () => {
    expect(
      shouldRunProcessSchedulers({ NODE_ENV: 'production', VERCEL: '0', ENABLE_PROCESS_SCHEDULERS: 'true' })
    ).toBe(true);
  });
});