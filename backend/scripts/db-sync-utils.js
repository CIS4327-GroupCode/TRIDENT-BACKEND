const { Pool } = require('pg');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    i += 1;
  }

  return args;
}

function parsePgUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('Missing PostgreSQL URL');
  }

  const trimmed = rawUrl.trim().replace(/^'+|'+$/g, '').replace(/^"+|"+$/g, '');
  const url = new URL(trimmed);

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error(`Invalid protocol for database URL: ${url.protocol}`);
  }

  return url;
}

function redactPgUrl(rawUrl) {
  const url = parsePgUrl(rawUrl);
  return `${url.protocol}//${url.username ? `${url.username}@` : ''}${url.host}${url.pathname}`;
}

function assertSafety({ sourceUrl, targetUrl, expectedTargetHost }) {
  const source = parsePgUrl(sourceUrl);
  const target = parsePgUrl(targetUrl);

  if (source.toString() === target.toString()) {
    throw new Error('Source and target database URLs are identical. Aborting.');
  }

  if (expectedTargetHost && !target.hostname.includes(expectedTargetHost)) {
    throw new Error(
      `Target host "${target.hostname}" does not include required pattern "${expectedTargetHost}".`
    );
  }

  return {
    sourceHost: source.hostname,
    targetHost: target.hostname,
    sourceDb: source.pathname.replace('/', ''),
    targetDb: target.pathname.replace('/', ''),
  };
}

function createPool(connectionString) {
  return new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
  });
}

async function fetchRows(pool, queryText, values = []) {
  const result = await pool.query(queryText, values);
  return result.rows;
}

async function closePools(pools) {
  await Promise.all(
    pools
      .filter(Boolean)
      .map(async (pool) => {
        try {
          await pool.end();
        } catch (_) {
          // no-op
        }
      })
  );
}

module.exports = {
  parseArgs,
  parsePgUrl,
  redactPgUrl,
  assertSafety,
  createPool,
  fetchRows,
  closePools,
};
