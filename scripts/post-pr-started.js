#!/usr/bin/env node
/*
Creates or updates the sticky PR comment (same marker as post-pr-report.js)
to indicate that CI testing has started. Designed to run early in workflows
so contributors immediately see progress.

Auth options (same as post-pr-report.js):
  - Preferred: GitHub App via env CI_PR_BOT_APP_ID, CI_PR_BOT_INSTALLATION_ID, CI_PR_BOT_PRIVATE_KEY
  - Fallback: GH_PR_COMMENT_TOKEN (or GITHUB_TOKEN/GH_TOKEN)

Env expected from CircleCI:
  - CIRCLE_PROJECT_SLUG (or CIRCLE_PROJECT_USERNAME + CIRCLE_PROJECT_REPONAME)
  - CIRCLE_BUILD_NUM (for context, optional)
  - CIRCLE_PULL_REQUESTS or CIRCLE_PULL_REQUEST (PR URL) OR CIRCLE_SHA1 (to resolve PR)
*/

const { createAppAuth } = require('@octokit/auth-app');

// Prefer descriptive env var names; fall back to legacy
const GH_TOKEN = process.env.GH_PR_COMMENT_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const APP_ID_ENV = process.env.CI_PR_BOT_APP_ID || process.env.APP_ID;
const INSTALLATION_ID_ENV = process.env.CI_PR_BOT_INSTALLATION_ID || process.env.INSTALLATION_ID;
const APP_PRIVATE_KEY_ENV = process.env.CI_PR_BOT_PRIVATE_KEY || process.env.APP_PRIVATE_KEY;
const HAS_APP_CREDS = !!(APP_ID_ENV && INSTALLATION_ID_ENV && APP_PRIVATE_KEY_ENV);

const SLUG = process.env.CIRCLE_PROJECT_USERNAME && process.env.CIRCLE_PROJECT_REPONAME
  ? `gh/${process.env.CIRCLE_PROJECT_USERNAME}/${process.env.CIRCLE_PROJECT_REPONAME}`
  : (process.env.CIRCLE_PROJECT_SLUG || '');
const PR_URLS = (process.env.CIRCLE_PULL_REQUESTS || process.env.CIRCLE_PULL_REQUEST || '').split(',').map(s=>s.trim()).filter(Boolean);
const SHA = process.env.CIRCLE_SHA1 || '';
const MARKER = '<!-- remix-e2e-report -->';
const STATUS_CONTEXT = 'remix/e2e-report';
const REPORT_SET_STATUS = process.env.REPORT_SET_STATUS === '1';

function exit(msg) { console.error(`[post-pr-started] ${msg}`); process.exit(2); }
function log(...a){ console.log('[post-pr-started]', ...a); }

if (!HAS_APP_CREDS && !GH_TOKEN) exit('Missing GitHub auth: set GH_PR_COMMENT_TOKEN or CI_PR_BOT_* app credentials');
if (!SLUG) exit('Missing CircleCI slug env');

function formatRunTime() {
  const now = new Date();
  return now.toLocaleString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
  });
}

(async () => {
  const { owner, repo } = parseSlug(SLUG);
  const prNumber = await resolvePrNumber(owner, repo, PR_URLS, SHA);
  if (!prNumber) {
    log('Cannot resolve PR number from env; skipping comment update.');
    process.exit(0);
  }

  // Fetch existing comments to find sticky
  const existing = await gh(`GET /repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100`);
  const mine = (existing || []).find(c => typeof c.body === 'string' && c.body.includes(MARKER));

  const runTime = formatRunTime();
  const startedBody = [
    MARKER,
    '🟡 CI: tests have started. Waiting for results…',
    '',
    `_Last update: ${runTime}_`,
    '',
    '_This comment will be updated automatically once results are available._'
  ].join('\n');

  if (mine && mine.id) {
    await gh(`PATCH /repos/${owner}/${repo}/issues/comments/${mine.id}`, { body: startedBody });
    log(`Updated sticky PR comment #${mine.id} to "started" state`);
  } else {
    const created = await gh(`POST /repos/${owner}/${repo}/issues/${prNumber}/comments`, { body: startedBody });
    log(`Created sticky PR comment id=${created.id}`);
  }

  if (REPORT_SET_STATUS && SHA) {
    await gh(`POST /repos/${owner}/${repo}/statuses/${SHA}`, {
      state: 'pending',
      description: 'E2E tests running',
      context: STATUS_CONTEXT
    });
    log(`Set commit status ${STATUS_CONTEXT}: pending`);
  }
})().catch(e => {
  console.error('[post-pr-started] Error (details omitted to avoid logging sensitive data)');
  process.exit(1);
});


function parseSlug(slug) {
  const m = String(slug).match(/^(?:gh|github)\/([^/]+)\/([^/]+)$/);
  if (!m) exit('Bad slug format; expected "gh/owner/repo" or "github/owner/repo"');
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

async function getAuthHeader() {
  const appId = APP_ID_ENV;
  const instId = INSTALLATION_ID_ENV;
  let pk = APP_PRIVATE_KEY_ENV;

  if (appId && instId && pk) {
    // Normalize private key newlines
    if (pk.includes('\\n') && !pk.includes('\n')) pk = pk.replace(/\\n/g, '\n');
    if (!pk.includes('-----BEGIN')) {
      throw new Error('Invalid private key format: missing PEM headers.');
    }
    const auth = createAppAuth({ appId: String(appId), privateKey: String(pk), installationId: String(instId) });
    const { token } = await auth({ type: 'installation' });
    return `token ${token}`;
  }
  if (!GH_TOKEN) throw new Error('GH_PR_COMMENT_TOKEN missing (or configure CI_PR_BOT_* app credentials)');
  return `token ${GH_TOKEN}`;
}
