require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  }
});

async function scalar(query) {
  const [rows] = await sequelize.query(query);
  return rows;
}

async function validate() {
  try {
    const normalize = (values) => [...values].map(String).sort();
    const sameSet = (actual, expected) =>
      JSON.stringify(normalize(actual)) === JSON.stringify(normalize(expected));

    const checks = [
      {
        name: 'project_statuses',
        query: `SELECT ARRAY_AGG(DISTINCT status ORDER BY status) AS values FROM project_ideas`,
        expected: ['approved', 'cancelled', 'completed', 'draft', 'in_progress', 'needs_revision', 'open', 'pending_review', 'rejected']
      },
      {
        name: 'milestone_statuses',
        query: `SELECT ARRAY_AGG(DISTINCT status ORDER BY status) AS values FROM milestones`,
        expected: ['cancelled', 'completed', 'in_progress', 'pending']
      },
      {
        name: 'application_statuses',
        query: `SELECT ARRAY_AGG(DISTINCT status ORDER BY status) AS values FROM agreements`,
        expected: ['accepted', 'pending', 'rejected']
      },
      {
        name: 'contract_statuses',
        query: `SELECT ARRAY_AGG(DISTINCT status ORDER BY status) AS values FROM contracts`,
        expected: ['active', 'draft', 'expired', 'pending_signature', 'signed', 'terminated']
      },
      {
        name: 'contract_template_types',
        query: `SELECT ARRAY_AGG(DISTINCT template_type ORDER BY template_type) AS values FROM contracts`,
        expected: ['DUA', 'NDA', 'SOW']
      },
      {
        name: 'attachment_statuses',
        query: `SELECT ARRAY_AGG(DISTINCT status ORDER BY status) AS values FROM project_attachments`,
        expected: ['active', 'deleted', 'failed', 'quarantined']
      },
      {
        name: 'attachment_scan_statuses',
        query: `SELECT ARRAY_AGG(DISTINCT scan_status ORDER BY scan_status) AS values FROM project_attachments`,
        expected: ['clean', 'error', 'infected', 'pending']
      },
      {
        name: 'rating_statuses',
        query: `SELECT ARRAY_AGG(DISTINCT status ORDER BY status) AS values FROM ratings`,
        expected: ['active', 'flagged', 'removed']
      },
      {
        name: 'project_review_actions',
        query: `SELECT ARRAY_AGG(DISTINCT action ORDER BY action) AS values FROM project_reviews`,
        expected: ['approved', 'needs_revision', 'rejected', 'submitted']
      },
      {
        name: 'user_roles',
        query: `SELECT ARRAY_AGG(DISTINCT role ORDER BY role) AS values FROM _user`,
        expected: ['admin', 'nonprofit', 'researcher', 'super_admin']
      },
      {
        name: 'user_account_statuses',
        query: `SELECT ARRAY_AGG(DISTINCT account_status ORDER BY account_status) AS values FROM _user`,
        expected: ['active', 'pending', 'suspended']
      },
      {
        name: 'two_factor_purposes',
        query: `SELECT ARRAY_AGG(DISTINCT purpose ORDER BY purpose) AS values FROM two_factor_codes`,
        expected: ['enable', 'login']
      }
    ];

    let failed = 0;
    for (const check of checks) {
      const rows = await scalar(check.query);
      const values = rows[0]?.values || [];
      const same = sameSet(values, check.expected);
      if (!same) {
        failed += 1;
      }
      console.log(`${same ? 'PASS' : 'FAIL'} ${check.name}`);
      console.log(`  expected: ${JSON.stringify(check.expected)}`);
      console.log(`  actual:   ${JSON.stringify(values)}`);
    }

    const [notifRows] = await sequelize.query(`SELECT COUNT(DISTINCT type) AS distinct_types FROM notifications`);
    console.log(`PASS notification_types_count expected=31 actual=${notifRows[0].distinct_types}`);
    if (Number(notifRows[0].distinct_types) !== 31) {
      failed += 1;
    }

    if (failed > 0) {
      console.error(`Coverage validation failed checks: ${failed}`);
      process.exit(1);
    }

    console.log('Coverage validation passed.');
  } finally {
    await sequelize.close();
  }
}

validate().catch((error) => {
  console.error('Validation script failed:', error);
  process.exit(1);
});
