export interface AmplifyCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

export interface AmplifyDeploymentResult {
  appId: string;
  branchName: string;
  defaultDomain: string;
  deploymentUrl: string;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return toHex(await crypto.subtle.digest('SHA-256', bytes));
}

function md5Hex(input: Uint8Array): string {
  function safeAdd(x: number, y: number): number {
    const lsw = (x & 0xffff) + (y & 0xffff);
    return (((x >> 16) + (y >> 16) + (lsw >> 16)) << 16) | (lsw & 0xffff);
  }
  function rol(n: number, c: number): number { return (n << c) | (n >>> (32 - c)); }
  function cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
    return safeAdd(rol(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
  }
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number { return cmn((b & c) | (~b & d), a, b, x, s, t); }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number { return cmn(c ^ (b | ~d), a, b, x, s, t); }

  const nw = Math.ceil((input.length + 9) / 64) * 16;
  const w = new Array<number>(nw).fill(0);
  for (let i = 0; i < input.length; i++) w[i >> 2] |= input[i] << ((i & 3) << 3);
  w[input.length >> 2] |= 0x80 << ((input.length & 3) << 3);
  w[nw - 2] = input.length * 8;

  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
  for (let i = 0; i < nw; i += 16) {
    const [aa, bb, cc, dd] = [a, b, c, d];
    const x = (j: number) => w[i + j];
    a=ff(a,b,c,d,x(0),7,-680876936);   d=ff(d,a,b,c,x(1),12,-389564586);
    c=ff(c,d,a,b,x(2),17,606105819);   b=ff(b,c,d,a,x(3),22,-1044525330);
    a=ff(a,b,c,d,x(4),7,-176418897);   d=ff(d,a,b,c,x(5),12,1200080426);
    c=ff(c,d,a,b,x(6),17,-1473231341); b=ff(b,c,d,a,x(7),22,-45705983);
    a=ff(a,b,c,d,x(8),7,1770035416);   d=ff(d,a,b,c,x(9),12,-1958414417);
    c=ff(c,d,a,b,x(10),17,-42063);     b=ff(b,c,d,a,x(11),22,-1990404162);
    a=ff(a,b,c,d,x(12),7,1804603682);  d=ff(d,a,b,c,x(13),12,-40341101);
    c=ff(c,d,a,b,x(14),17,-1502002290);b=ff(b,c,d,a,x(15),22,1236535329);
    a=gg(a,b,c,d,x(1),5,-165796510);   d=gg(d,a,b,c,x(6),9,-1069501632);
    c=gg(c,d,a,b,x(11),14,643717713);  b=gg(b,c,d,a,x(0),20,-373897302);
    a=gg(a,b,c,d,x(5),5,-701558691);   d=gg(d,a,b,c,x(10),9,38016083);
    c=gg(c,d,a,b,x(15),14,-660478335); b=gg(b,c,d,a,x(4),20,-405537848);
    a=gg(a,b,c,d,x(9),5,568446438);    d=gg(d,a,b,c,x(14),9,-1019803690);
    c=gg(c,d,a,b,x(3),14,-187363961);  b=gg(b,c,d,a,x(8),20,1163531501);
    a=gg(a,b,c,d,x(13),5,-1444681467); d=gg(d,a,b,c,x(2),9,-51403784);
    c=gg(c,d,a,b,x(7),14,1735328473);  b=gg(b,c,d,a,x(12),20,-1926607734);
    a=hh(a,b,c,d,x(5),4,-378558);      d=hh(d,a,b,c,x(8),11,-2022574463);
    c=hh(c,d,a,b,x(11),16,1839030562); b=hh(b,c,d,a,x(14),23,-35309556);
    a=hh(a,b,c,d,x(1),4,-1530992060);  d=hh(d,a,b,c,x(4),11,1272893353);
    c=hh(c,d,a,b,x(7),16,-155497632);  b=hh(b,c,d,a,x(10),23,-1094730640);
    a=hh(a,b,c,d,x(13),4,681279174);   d=hh(d,a,b,c,x(0),11,-358537222);
    c=hh(c,d,a,b,x(3),16,-722521979);  b=hh(b,c,d,a,x(6),23,76029189);
    a=hh(a,b,c,d,x(9),4,-640364487);   d=hh(d,a,b,c,x(12),11,-421815835);
    c=hh(c,d,a,b,x(15),16,530742520);  b=hh(b,c,d,a,x(2),23,-995338651);
    a=ii(a,b,c,d,x(0),6,-198630844);   d=ii(d,a,b,c,x(7),10,1126891415);
    c=ii(c,d,a,b,x(14),15,-1416354905);b=ii(b,c,d,a,x(5),21,-57434055);
    a=ii(a,b,c,d,x(12),6,1700485571);  d=ii(d,a,b,c,x(3),10,-1894986606);
    c=ii(c,d,a,b,x(10),15,-1051523);   b=ii(b,c,d,a,x(1),21,-2054922799);
    a=ii(a,b,c,d,x(8),6,1873313359);   d=ii(d,a,b,c,x(15),10,-30611744);
    c=ii(c,d,a,b,x(6),15,-1560198380); b=ii(b,c,d,a,x(13),21,1309151649);
    a=ii(a,b,c,d,x(4),6,-145523070);   d=ii(d,a,b,c,x(11),10,-1120210379);
    c=ii(c,d,a,b,x(2),15,718787259);   b=ii(b,c,d,a,x(9),21,-343485551);
    a=safeAdd(a,aa); b=safeAdd(b,bb); c=safeAdd(c,cc); d=safeAdd(d,dd);
  }
  return [a, b, c, d].map(n =>
    Array.from({length: 4}, (_, j) => ((n >> (j * 8)) & 0xff).toString(16).padStart(2, '0')).join('')
  ).join('');
}

async function hmacSha256(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data));
}

async function deriveSigningKey(
  secret: string, date: string, region: string, service: string
): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(new TextEncoder().encode(`AWS4${secret}`), date);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, 'aws4_request');
}

async function signedFetch(
  method: string,
  url: string,
  creds: AmplifyCredentials,
  body?: object
): Promise<Response> {
  const now = new Date();
  const isoDate = now.toISOString().replace(/[:-]/g, '').slice(0, 15) + 'Z';
  const shortDate = isoDate.slice(0, 8);
  const bodyStr = body !== undefined ? JSON.stringify(body) : '';
  const payloadHash = await sha256Hex(new TextEncoder().encode(bodyStr));
  const urlObj = new URL(url);

  const headerEntries = ([
    ['content-type', 'application/json'],
    ['host', urlObj.host],
    ['x-amz-content-sha256', payloadHash],
    ['x-amz-date', isoDate],
  ] as [string, string][]).sort(([a], [b]) => a.localeCompare(b));

  const signedHeaders = headerEntries.map(([k]) => k).join(';');
  const canonicalHeaders = headerEntries.map(([k, v]) => `${k}:${v}`).join('\n') + '\n';
  const canonicalRequest = [
    method, urlObj.pathname, '', canonicalHeaders, signedHeaders, payloadHash
  ].join('\n');

  const scope = `${shortDate}/${creds.region}/amplify/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256', isoDate, scope, await sha256Hex(canonicalRequest)
  ].join('\n');

  const key = await deriveSigningKey(creds.secretAccessKey, shortDate, creds.region, 'amplify');
  const sig = toHex(await hmacSha256(key, stringToSign));
  const auth = `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}`;

  return fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Amz-Date': isoDate,
      'X-Amz-Content-Sha256': payloadHash,
      'Authorization': auth,
    },
    body: bodyStr || undefined,
  });
}

const endpoint = (region: string) => `https://amplify.${region}.amazonaws.com`;

async function resolveApp(
  creds: AmplifyCredentials,
  appName: string,
  existingAppId?: string
): Promise<{ appId: string; defaultDomain: string }> {
  if (existingAppId) {
    const res = await signedFetch('GET', `${endpoint(creds.region)}/apps/${existingAppId}`, creds);
    if (res.ok) {
      const { app } = await res.json();
      return { appId: app.appId, defaultDomain: app.defaultDomain };
    }
  }

  const listRes = await signedFetch('GET', `${endpoint(creds.region)}/apps`, creds);
  if (listRes.ok) {
    const { apps = [] } = await listRes.json();
    const found = apps.find((a: any) => a.name === appName);
    if (found) return { appId: found.appId, defaultDomain: found.defaultDomain };
  }

  const createRes = await signedFetch('POST', `${endpoint(creds.region)}/apps`, creds, {
    name: appName,
    platform: 'WEB',
    enableBranchAutoBuild: false,
  });
  if (!createRes.ok) throw new Error(`Failed to create Amplify app: ${await createRes.text()}`);
  const { app } = await createRes.json();
  return { appId: app.appId, defaultDomain: app.defaultDomain };
}

async function ensureBranch(
  creds: AmplifyCredentials, appId: string, branch: string
): Promise<void> {
  const get = await signedFetch(
    'GET', `${endpoint(creds.region)}/apps/${appId}/branches/${branch}`, creds
  );
  if (get.ok) return;

  const create = await signedFetch(
    'POST', `${endpoint(creds.region)}/apps/${appId}/branches`, creds,
    { branchName: branch, stage: 'PRODUCTION', enableAutoBuild: false }
  );
  if (!create.ok) throw new Error(`Failed to create branch: ${await create.text()}`);
}

/**
 * Deploys a map of filename → Uint8Array to AWS Amplify Hosting.
 * Creates the app and branch on first run; reuses them on subsequent calls.
 * Uses the Amplify manual deployment API (file-map approach, no zip required).
 */
export async function deployToAmplify(
  creds: AmplifyCredentials,
  appName: string,
  files: Map<string, Uint8Array>,
  existingAppId?: string
): Promise<AmplifyDeploymentResult> {
  const branch = 'main';

  const { appId, defaultDomain } = await resolveApp(creds, appName, existingAppId);
  await ensureBranch(creds, appId, branch);

  const fileMap: Record<string, string> = {};
  for (const [path, content] of files) {
    fileMap[path] = md5Hex(content);
  }

  const deployRes = await signedFetch(
    'POST',
    `${endpoint(creds.region)}/apps/${appId}/branches/${branch}/deployments`,
    creds,
    { fileMap }
  );
  if (!deployRes.ok) throw new Error(`Failed to create deployment: ${await deployRes.text()}`);
  const { jobId, fileUploadUrls } = await deployRes.json();

  for (const [path, content] of files) {
    const uploadUrl = fileUploadUrls[path];
    if (!uploadUrl) continue;
    const ct = path.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream';
    const up = await fetch(uploadUrl, { method: 'PUT', body: content, headers: { 'Content-Type': ct } });
    if (!up.ok) throw new Error(`Failed to upload ${path}: ${up.status} ${up.statusText}`);
  }

  const startRes = await signedFetch(
    'POST',
    `${endpoint(creds.region)}/apps/${appId}/branches/${branch}/deployments/start`,
    creds,
    { jobId }
  );
  if (!startRes.ok) throw new Error(`Failed to start deployment: ${await startRes.text()}`);

  return { appId, branchName: branch, defaultDomain, deploymentUrl: `https://${branch}.${defaultDomain}` };
}
