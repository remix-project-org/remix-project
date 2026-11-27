#!/usr/bin/env node
/*
Posts a PR comment linking to the latest failed-report artifact (index.html)
Requires:
  - CIRCLECI_TOKEN (read artifacts)
  - GITHUB_TOKEN (repo:public_repo or repo)
Relies on:
  - reports/ci-latest-failed/summary.json uploaded as artifact by this same job
*/

const fs = require('fs');
const path = require('path');
const { createAppAuth } = require('@octokit/auth-app');

const CIRCLE_TOKEN = process.env.CIRCLECI_TOKEN || '';
// Prefer GH_PR_COMMENT_TOKEN; fallback to legacy names for compatibility
const GH_TOKEN = process.env.GH_PR_COMMENT_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
// Prefer descriptive env var names; fall back to legacy for compatibility
const APP_ID_ENV = process.env.CI_PR_BOT_APP_ID || process.env.APP_ID;
const INSTALLATION_ID_ENV = process.env.CI_PR_BOT_INSTALLATION_ID || process.env.INSTALLATION_ID;
const APP_PRIVATE_KEY_ENV = process.env.CI_PR_BOT_PRIVATE_KEY || process.env.APP_PRIVATE_KEY;
const HAS_APP_CREDS = !!(APP_ID_ENV && INSTALLATION_ID_ENV && APP_PRIVATE_KEY_ENV);
const SLUG = process.env.CIRCLE_PROJECT_USERNAME && process.env.CIRCLE_PROJECT_REPONAME
  ? `gh/${process.env.CIRCLE_PROJECT_USERNAME}/${process.env.CIRCLE_PROJECT_REPONAME}` : (process.env.CIRCLE_PROJECT_SLUG || '');
const JOB_NUM = process.env.CIRCLE_BUILD_NUM || process.env.CIRCLE_JOB_NUMBER || '';
const PR_URLS = (process.env.CIRCLE_PULL_REQUESTS || process.env.CIRCLE_PULL_REQUEST || '').split(',').map(s=>s.trim()).filter(Boolean);
const SHA = process.env.CIRCLE_SHA1 || '';
const OUTDIR = process.argv[2] || 'reports/ci-latest-failed';
const REPORT_SET_STATUS = process.env.REPORT_SET_STATUS === '1';
const MARKER = '<!-- remix-e2e-report -->';
const STATUS_CONTEXT = 'remix/e2e-report';

function exit(msg) { console.error(`[post-pr-report] ${msg}`); process.exit(2); }
function log(...a){ console.log('[post-pr-report]', ...a); }

if (!CIRCLE_TOKEN) exit('CIRCLECI_TOKEN missing');
if (!HAS_APP_CREDS && !GH_TOKEN) exit('Missing GitHub auth: set GH_PR_COMMENT_TOKEN or APP_ID/INSTALLATION_ID/APP_PRIVATE_KEY');
if (!SLUG || !JOB_NUM) exit('Missing CircleCI env (slug or job number)');

  const summaryPath = path.join(OUTDIR, 'summary.json');
if (!fs.existsSync(summaryPath)) {
  log('summary.json not found; no failures or generator did not run. Skipping.');
  process.exit(0);
}

function formatRunTime() {
  const now = new Date();
  return now.toLocaleString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

(async () => {
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  const failures = Array.isArray(summary.failures) ? summary.failures : [];
  const runTime = formatRunTime();
  
  const { owner, repo } = parseSlug(SLUG);
  const prNumber = await resolvePrNumber(owner, repo, PR_URLS, SHA);
  if (!prNumber) {
    log('Cannot resolve PR number from env; skipping comment update.');
    process.exit(0);
  }

  // Check if there's an existing sticky comment
  const existing = await gh(`GET /repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100`);
  const mine = (existing || []).find(c => typeof c.body === 'string' && c.body.includes(MARKER));

  // If no failures, update or delete the sticky comment to show success
  if (!failures.length) {
    if (mine && mine.id) {
      const successBody = [
        MARKER,
        `✅ E2E tests passed (workflow: ${escapeMd(summary.workflowName || '')})`,
        '',
        `_Last run: ${runTime}_`,
        '',
        '_All tests are now passing! Previous failures have been resolved._'
      ].join('\n');
      await gh(`PATCH /repos/${owner}/${repo}/issues/comments/${mine.id}`, { body: successBody });
      log(`Updated sticky PR comment #${mine.id} with success status`);
    } else {
      log('No failures and no existing comment; nothing to update.');
    }
    
    // Optional: set success commit status
    if (REPORT_SET_STATUS && SHA) {
      await gh(`POST /repos/${owner}/${repo}/statuses/${SHA}`, {
        state: 'success',
        description: 'E2E tests passed',
        context: STATUS_CONTEXT
      });
      log(`Set commit status ${STATUS_CONTEXT}: success`);
    }
    process.exit(0);
  }

  // Find the artifact URL for index.html uploaded by THIS job
  const artifacts = await circle(`/project/${SLUG}/${JOB_NUM}/artifacts`);
  const index = artifacts.items?.find(a => /ci-latest-failed\/index\.html$/.test(a.path));
  if (!index) exit('index.html artifact not found; ensure store_artifacts ran before this step');
  const indexUrl = index.url;

  // Compose failure comment
  const top = failures.slice(0, 10);
  const list = top.map(f => `- ${escapeMd(f.name)}${f.file ? ` (${escapeMd(f.file)})` : ''}`).join('\n');
  const body = [
    MARKER,
    `❌ E2E failures detected (workflow: ${escapeMd(summary.workflowName || '')})`,
    '',
    `_Last run: ${runTime}_`,
    '',
    `[View HTML report](${indexUrl})`,
    '',
    `Top failing tests (${top.length}/${failures.length}):`,
    list,
    '',
    '_Report generated by CI; artifacts are retained per CircleCI retention settings._'
  ].join('\n');

  // Sticky comment behavior: update if existing, else create
  if (mine && mine.id) {
    await gh(`PATCH /repos/${owner}/${repo}/issues/comments/${mine.id}`, { body });
    log(`Updated sticky PR comment #${mine.id}`);
  } else {
    const created = await gh(`POST /repos/${owner}/${repo}/issues/${prNumber}/comments`, { body });
    log(`Comment posted to PR #${prNumber}: ${indexUrl} (id=${created.id})`);
  }

  // Optional: set failure commit status pointing to the report
  if (REPORT_SET_STATUS && SHA) {
    await gh(`POST /repos/${owner}/${repo}/statuses/${SHA}`, {
      state: 'failure',
      target_url: indexUrl,
      description: `${failures.length} failing E2E test(s)`,
      context: STATUS_CONTEXT
    });
    log(`Set commit status ${STATUS_CONTEXT}: failure`);
  }
})().catch(e => { console.error(e); process.exit(1); });

function parseSlug(slug) {
  const m = String(slug).match(/^(?:gh|github)\/([^/]+)\/([^/]+)$/);
  if (!m) exit(`Bad slug: ${slug}`);
  return { owner: m[1], repo: m[2] };
}

async function resolvePrNumber(owner, repo, prUrls, sha) {
  for (const u of prUrls) {
    const m = String(u).trim().match(/\/pull\/(\d+)/);
    if (m) return Number(m[1]);
  }
  if (!sha) return null;
  const res = await gh(`GET /repos/${owner}/${repo}/commits/${sha}/pulls`, null,
    { accept: 'application/vnd.github.groot-preview+json' });
  if (Array.isArray(res) && res[0]?.number) return res[0].number;
  return null;
}

async function circle(pathname) {
  const res = await fetch(`https://circleci.com/api/v2${pathname}`, {
    headers: { 'Circle-Token': CIRCLE_TOKEN }
  });
  if (!res.ok) throw new Error(`CircleCI ${res.status} ${pathname}`);
  return res.json();
}

async function gh(pathname, body, extraHeaders) {
  const [method, endpoint] = pathname.includes(' ') ? pathname.split(' ', 2) : ['GET', pathname];
  const authHeader = await getAuthHeader();
  const res = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      ...(extraHeaders || {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GitHub ${res.status} ${endpoint}: ${t}`);
  }
  return res.json();
}

function escapeMd(s) {
  return String(s).replace(/[\\\[\]\(\)`*_~]/g, '\\$&');
}

async function getAuthHeader() {
  const appId = APP_ID_ENV;
  const instId = INSTALLATION_ID_ENV;
  const pk = APP_PRIVATE_KEY_ENV;
  
  log('Auth method detection:');
  log(`  - CI_PR_BOT_APP_ID: ${appId ? '✓ set' : '✗ missing'}`);
  log(`  - CI_PR_BOT_INSTALLATION_ID: ${instId ? '✓ set' : '✗ missing'}`);
  log(`  - CI_PR_BOT_PRIVATE_KEY: ${pk ? `✓ set (${pk.length} chars)` : '✗ missing'}`);
  log(`  - GH_PR_COMMENT_TOKEN: ${GH_TOKEN ? '✓ set (fallback)' : '✗ missing'}`);
  
  if (appId && instId && pk) {
    log('→ Using GitHub App authentication');
    // Handle both literal newlines and escaped \n in the private key
    let privateKey = String(pk);
    // If the key contains literal \n (two characters), replace with actual newlines
    if (privateKey.includes('\\n') && !privateKey.includes('\n')) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }
    // Ensure the key has proper PEM headers
    if (!privateKey.includes('-----BEGIN')) {
      throw new Error('Invalid private key format: missing PEM headers. Ensure CI_PR_BOT_PRIVATE_KEY contains the full PEM including headers.');
    }
    try {
      const auth = createAppAuth({
        appId: String(appId),
        privateKey: privateKey,
        installationId: String(instId)
      });
      const { token } = await auth({ type: 'installation' });
      log('✓ GitHub App token obtained');
      return `token ${token}`;
    } catch (err) {
      throw new Error(`Failed to authenticate as GitHub App (id=${appId}): ${err.message}. Check that CI_PR_BOT_PRIVATE_KEY is a valid PEM-encoded RSA private key.`);
    }
  }
  log('→ Using personal access token (GH_PR_COMMENT_TOKEN)');
  if (!GH_TOKEN) throw new Error('GH_PR_COMMENT_TOKEN missing (or configure CI_PR_BOT_APP_ID / CI_PR_BOT_INSTALLATION_ID / CI_PR_BOT_PRIVATE_KEY)');
  return `token ${GH_TOKEN}`;
}
