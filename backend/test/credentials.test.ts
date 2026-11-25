import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { redactSensitive } from '../src/audit/audit.redact';
import { CREDENTIAL_FIELDS, CREDENTIAL_GROUPS, findCredentialField, invalidCredential } from '../src/credentials/credential-catalog';
import { decryptValue, encryptValue, isEncrypted, parseMasterKey } from '../src/credentials/credential-crypto';
import { testGroup } from '../src/credentials/credential-tester';
import { CredentialsService } from '../src/credentials/credentials.service';

const KEY = randomBytes(32);

// --- the encryption ---------------------------------------------------------------------------------------------------------

test('a value comes back as it went in, and what is stored shows nothing of it', () => {
  const secret = 'EAAGm0PX4ZCpsBAKZB-very-secret-page-token-1234';
  const stored = encryptValue(secret, 'FACEBOOK_PAGE_ACCESS_TOKEN', KEY);
  assert.ok(isEncrypted(stored));
  assert.ok(!stored.includes('EAAG') && !stored.includes('secret') && !stored.includes('1234'));
  assert.equal(decryptValue(stored, 'FACEBOOK_PAGE_ACCESS_TOKEN', KEY), secret);
});

test('the same value encrypted twice differs (a fresh IV each time), and an empty value round-trips', () => {
  assert.notEqual(encryptValue('same', 'X_API_KEY', KEY), encryptValue('same', 'X_API_KEY', KEY));
  assert.equal(decryptValue(encryptValue('', 'X_API_KEY', KEY), 'X_API_KEY', KEY), '');
});

test('a value cannot be opened with another key, after being altered, or moved to another credential\'s name', () => {
  const stored = encryptValue('hello', 'X_API_KEY', KEY);
  assert.throws(() => decryptValue(stored, 'X_API_KEY', randomBytes(32)));
  assert.throws(() => decryptValue(stored, 'X_API_SECRET', KEY), 'bound to its name');
  const parts = stored.split(':');
  const body = Buffer.from(parts[4], 'base64url'); body[0] ^= 1;
  assert.throws(() => decryptValue([...parts.slice(0, 4), body.toString('base64url')].join(':'), 'X_API_KEY', KEY), 'altered ciphertext');
  assert.throws(() => decryptValue('plain text', 'X_API_KEY', KEY));
  assert.throws(() => decryptValue('enc:v1:only-one-part', 'X_API_KEY', KEY));
});

test('the master key is 32 bytes as base64 or 64 hex characters; anything else is refused', () => {
  const raw = randomBytes(32);
  assert.deepEqual(parseMasterKey(raw.toString('base64')), raw);
  assert.deepEqual(parseMasterKey(raw.toString('hex')), raw);
  for (const bad of ['', '   ', undefined, null, 'short', randomBytes(16).toString('base64'), randomBytes(40).toString('base64'), 'z'.repeat(64)]) assert.equal(parseMasterKey(bad as any), null, String(bad));
});

// --- what may be saved and what may be shown -------------------------------------------------------------------------------

test('every credential the screen holds is in the catalogue once, and none can reach the audit log, whichever box a value is typed in', () => {
  const names = CREDENTIAL_FIELDS.map((f) => f.key);
  assert.equal(new Set(names).size, names.length, 'no name twice');
  // The body the screen sends. Ids as well as secrets: a token pasted into an id box must not be logged either.
  const sent = { credentials: Object.fromEntries(names.map((n) => [n, 'a-real-value-that-must-not-be-logged'])) };
  const logged = redactSensitive(sent);
  assert.ok(!JSON.stringify(logged).includes('must-not-be-logged'), 'a value would be written to the audit log in the clear');
  for (const f of CREDENTIAL_FIELDS.filter((x) => x.secret)) {
    assert.equal((redactSensitive({ [f.key]: 'the-real-secret' }) as any)[f.key], '[REDACTED]', `${f.key} is redacted by its own name as well`);
  }
});

test('the ids and checks: a pasted token in an id box is refused, a multi-line paste is refused, a fine value passes', () => {
  const pageId = findCredentialField('FACEBOOK_PAGE_ID')!;
  assert.equal(invalidCredential(pageId, '405520572643076'), null);
  assert.match(invalidCredential(pageId, 'EAAGm0PX4ZCpsBAK')!, /long number/);
  assert.match(invalidCredential(findCredentialField('X_API_KEY')!, 'line one\nline two')!, /one line/);
  assert.match(invalidCredential(findCredentialField('X_API_KEY')!, 'x'.repeat(5000))!, /too long/);
  assert.equal(invalidCredential(findCredentialField('X_API_KEY')!, 'abc123'), null);
});

test('the groups: the five platforms and ad tracking, each with its fields; only the ones that can be checked offer a check', () => {
  assert.deepEqual(CREDENTIAL_GROUPS.map((g) => g.id), ['facebook', 'instagram', 'threads', 'x', 'tiktok', 'ads']);
  assert.equal(CREDENTIAL_GROUPS.find((g) => g.id === 'ads')!.testable, false);
});

// --- the connection checks (a fake platform) ---------------------------------------------------------------------------------

const reader = (values: Record<string, string>) => ({ get: (k: string) => values[k] ?? '' });
const fakeFetch = (route: (url: URL, init: any) => { status: number; body: any } | null) =>
  (async (input: any, init: any) => {
    const r = route(new URL(String(input)), init) ?? { status: 404, body: { error: { message: 'unexpected' } } };
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;

test('Facebook check: names the Page, and says which permissions the token lacks', async () => {
  const good = fakeFetch((u) => (u.pathname.endsWith('/debug_token') ? { status: 200, body: { data: { scopes: ['pages_manage_posts', 'pages_read_engagement', 'pages_messaging'] } } } : { status: 200, body: { name: 'Drip Emp' } }));
  assert.deepEqual(await testGroup('facebook', reader({ FACEBOOK_PAGE_ID: '111', FACEBOOK_PAGE_ACCESS_TOKEN: 't' }), good), { ok: true, message: 'Connected to the Page “Drip Emp”. The token can post and reply.' });
  const thin = fakeFetch((u) => (u.pathname.endsWith('/debug_token') ? { status: 200, body: { data: { scopes: ['pages_read_engagement'] } } } : { status: 200, body: { name: 'Drip Emp' } }));
  const out = await testGroup('facebook', reader({ FACEBOOK_PAGE_ID: '111', FACEBOOK_PAGE_ACCESS_TOKEN: 't' }), thin);
  assert.equal(out.ok, false);
  assert.match(out.message, /lacks: pages_manage_posts, pages_messaging/);
  const refused = await testGroup('facebook', reader({ FACEBOOK_PAGE_ID: '111', FACEBOOK_PAGE_ACCESS_TOKEN: 'bad' }), fakeFetch(() => ({ status: 400, body: { error: { message: 'Invalid OAuth access token' } } })));
  assert.match(refused.message, /Invalid OAuth access token/);
  assert.equal((await testGroup('facebook', reader({}), good)).ok, false);
});

test('Instagram check: finds the account linked to the Page and checks the publish permission', async () => {
  const f = (scopes: string[]) => fakeFetch((u) => (u.pathname.endsWith('/debug_token') ? { status: 200, body: { data: { scopes } } } : { status: 200, body: { instagram_business_account: { id: '1784', username: 'dripemp' } } }));
  const creds = reader({ FACEBOOK_PAGE_ID: '111', FACEBOOK_PAGE_ACCESS_TOKEN: 't' });
  assert.match((await testGroup('instagram', creds, f(['instagram_basic', 'instagram_content_publish']))).message, /Posts to @dripemp/);
  const lacking = await testGroup('instagram', creds, f(['instagram_basic']));
  assert.equal(lacking.ok, false);
  assert.match(lacking.message, /lacks: instagram_content_publish/);
  const none = await testGroup('instagram', creds, fakeFetch(() => ({ status: 200, body: {} })));
  assert.match(none.message, /No Instagram Professional account/);
});

test('Threads, X and TikTok checks report the account or the platform\'s reason', async () => {
  assert.match((await testGroup('threads', reader({ THREADS_ACCESS_TOKEN: 't' }), fakeFetch(() => ({ status: 200, body: { id: '9', username: 'dripemporium' } })))).message, /@dripemporium/);
  assert.match((await testGroup('threads', reader({ THREADS_ACCESS_TOKEN: 't' }), fakeFetch(() => ({ status: 400, body: { error: { message: 'Cannot parse access token' } } })))).message, /Cannot parse access token/);

  const xKeys = { X_API_KEY: 'k', X_API_SECRET: 's', X_ACCESS_TOKEN: 't', X_ACCESS_TOKEN_SECRET: 'ts' };
  let sawOAuth = false;
  assert.match((await testGroup('x', reader(xKeys), fakeFetch((u, init) => { sawOAuth = String(init?.headers?.Authorization).startsWith('OAuth '); return { status: 200, body: { data: { username: 'dripemporium' } } }; }))).message, /@dripemporium/);
  assert.ok(sawOAuth);
  assert.match((await testGroup('x', reader(xKeys), fakeFetch(() => ({ status: 402, body: { title: 'CreditsDepleted', detail: 'none' } })))).message, /no credit left/i);
  assert.equal((await testGroup('x', reader({ X_API_KEY: 'k' }), fakeFetch(() => null))).ok, false, 'all four keys are needed');

  assert.equal((await testGroup('tiktok', reader({ TIKTOK_CLIENT_KEY: 'a', TIKTOK_CLIENT_SECRET: 'b' }), fakeFetch(() => ({ status: 200, body: { access_token: 'x' } })))).ok, true);
  assert.match((await testGroup('tiktok', reader({ TIKTOK_CLIENT_KEY: 'a', TIKTOK_CLIENT_SECRET: 'b' }), fakeFetch(() => ({ status: 401, body: { error: 'invalid_client', error_description: 'Client key or secret is incorrect' } })))).message, /incorrect/);
  assert.equal((await testGroup('ads', reader({}), fakeFetch(() => null))).ok, false);
});

test('a check never puts a secret in its answer', async () => {
  const secret = 'SUPER-SECRET-TOKEN-VALUE';
  const out = await testGroup('facebook', reader({ FACEBOOK_PAGE_ID: '111', FACEBOOK_PAGE_ACCESS_TOKEN: secret }), fakeFetch(() => ({ status: 400, body: { error: { message: 'Invalid token' } } })));
  assert.ok(!JSON.stringify(out).includes(secret));
});

// --- the store, against a real database (KITS_TEST_DATABASE_URL) ----------------------------------------------------------------

const url = process.env.KITS_TEST_DATABASE_URL;
const db = url ? test : test.skip;
const NAMES = CREDENTIAL_FIELDS.map((f) => f.key);

async function world(env: Record<string, string> = {}, withKey = true) {
  const saved: Record<string, string | undefined> = {};
  for (const k of [...NAMES, 'CREDENTIALS_ENCRYPTION_KEY']) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, env);
  if (withKey) process.env.CREDENTIALS_ENCRYPTION_KEY = KEY.toString('base64');
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$connect();
  await prisma.credential.deleteMany({});
  const service = new CredentialsService(prisma as any);
  const done = async () => {
    await prisma.credential.deleteMany({});
    await prisma.$disconnect();
    for (const k of [...NAMES, 'CREDENTIALS_ENCRYPTION_KEY']) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  };
  return { prisma, service, done };
}

db('first start copies each .env value into the table, encrypted, and the table\'s copy is what is read; running again changes nothing', async () => {
  const w = await world({ FACEBOOK_PAGE_ID: '405520572643076', FACEBOOK_PAGE_ACCESS_TOKEN: 'EAAG-page-token-xyz', THREADS_ACCESS_TOKEN: 'THAA-threads-abc' });
  try {
    const copied = await w.service.seedFromEnv();
    assert.deepEqual(copied.sort(), ['FACEBOOK_PAGE_ACCESS_TOKEN', 'FACEBOOK_PAGE_ID', 'THREADS_ACCESS_TOKEN']);
    await w.service.refresh();
    assert.equal(w.service.get('FACEBOOK_PAGE_ACCESS_TOKEN'), 'EAAG-page-token-xyz');

    const rows = await w.prisma.credential.findMany();
    assert.equal(rows.length, 3);
    for (const row of rows) {
      assert.ok(isEncrypted(row.value), row.key);
      assert.ok(!/EAAG|THAA|405520572643076/.test(row.value), `${row.key} is stored in the clear`);
      assert.deepEqual([row.source, row.updatedBy], ['ENV_SEED', 'server .env']);
    }
    assert.deepEqual(await w.service.seedFromEnv(), [], 'a second start copies nothing');
    assert.equal(await w.prisma.credential.count(), 3);
  } finally { await w.done(); }
});

db('what the table holds beats the .env, and a name with no row falls back to the .env', async () => {
  const w = await world({ X_API_KEY: 'env-key', X_API_SECRET: 'env-secret' });
  try {
    await w.service.seedFromEnv(); await w.service.refresh();
    await w.service.set({ X_API_KEY: 'portal-key' }, 'staff@dripemporium.store');
    assert.equal(w.service.get('X_API_KEY'), 'portal-key');
    assert.equal(w.service.get('X_API_SECRET'), 'env-secret');
    process.env.X_ACCESS_TOKEN = 'only-in-env';
    assert.equal(w.service.get('X_ACCESS_TOKEN'), 'only-in-env', 'no row: the .env is used');
    process.env.X_API_KEY = 'a-newer-env-key';
    assert.equal(w.service.get('X_API_KEY'), 'portal-key', 'a changed .env does not override the table');
  } finally { await w.done(); }
});

db('clearing a credential empties it for good: the .env value does not come back in its place', async () => {
  const w = await world({ THREADS_ACCESS_TOKEN: 'THAA-old' });
  try {
    await w.service.seedFromEnv(); await w.service.refresh();
    await w.service.clear('THREADS_ACCESS_TOKEN', 'staff');
    assert.equal(w.service.get('THREADS_ACCESS_TOKEN'), '');
    await w.service.seedFromEnv(); await w.service.refresh();
    assert.equal(w.service.get('THREADS_ACCESS_TOKEN'), '', 'not re-seeded from the .env either');
    const view = w.service.describe().groups.flatMap((g) => g.fields).find((f) => f.key === 'THREADS_ACCESS_TOKEN')!;
    assert.deepEqual([view.set, view.source], [false, null]);
  } finally { await w.done(); }
});

db('saving: blank means "leave it", an unknown name or a bad id is refused with nothing saved, and who saved it is recorded', async () => {
  const w = await world();
  try {
    assert.deepEqual(await w.service.set({ X_API_KEY: '  new-key  ', X_API_SECRET: '   ' }, 'staff@dripemporium.store'), ['X_API_KEY']);
    assert.equal(w.service.get('X_API_KEY'), 'new-key', 'trimmed');
    await assert.rejects(() => w.service.set({ NOT_A_CREDENTIAL: 'x' }, 'staff'), /not a credential/);
    await assert.rejects(() => w.service.set({ X_ACCESS_TOKEN: 'fine', FACEBOOK_PAGE_ID: 'EAAG-not-an-id' }, 'staff'), /long number/);
    assert.equal(w.service.get('X_ACCESS_TOKEN'), '', 'nothing from a refused save was kept');
    await assert.rejects(() => w.service.set({ X_API_KEY: 123 as any }, 'staff'), /must be text/);
    const row = await w.prisma.credential.findUniqueOrThrow({ where: { key: 'X_API_KEY' } });
    assert.deepEqual([row.source, row.updatedBy], ['PORTAL', 'staff@dripemporium.store']);
  } finally { await w.done(); }
});

db('what the screen is given describes secrets but never contains one', async () => {
  const w = await world({ FACEBOOK_PAGE_ID: '405520572643076', FACEBOOK_PAGE_ACCESS_TOKEN: 'EAAG-a-long-page-token-value-9f3c', X_API_KEY: 'short' });
  try {
    await w.service.seedFromEnv(); await w.service.refresh();
    const view = w.service.describe();
    const text = JSON.stringify(view);
    assert.ok(!text.includes('EAAG-a-long-page-token-value'), 'the token is not in what the screen is given');
    assert.ok(!text.includes('short'), 'not even a short secret');
    const fields = view.groups.flatMap((g) => g.fields);
    const token = fields.find((f) => f.key === 'FACEBOOK_PAGE_ACCESS_TOKEN')!;
    assert.deepEqual([token.set, token.value, token.last4, token.source], [true, null, '9f3c', 'ENV_SEED']);
    assert.equal(fields.find((f) => f.key === 'X_API_KEY')!.last4, '', 'a short secret shows no characters at all');
    assert.equal(fields.find((f) => f.key === 'FACEBOOK_PAGE_ID')!.value, '405520572643076', 'an id is shown');
    assert.equal(fields.find((f) => f.key === 'X_API_SECRET')!.set, false);
  } finally { await w.done(); }
});

db('a change saved through the other backend slot reaches this one when it next refreshes', async () => {
  const w = await world();
  try {
    const other = new CredentialsService(w.prisma as any);
    await other.set({ X_API_KEY: 'from-the-other-slot' }, 'staff');
    assert.equal(w.service.get('X_API_KEY'), '');
    await w.service.refresh();
    assert.equal(w.service.get('X_API_KEY'), 'from-the-other-slot');
  } finally { await w.done(); }
});

db('without the encryption key nothing is saved or read from the table, the .env keeps working, and the screen can say why', async () => {
  const w = await world({ X_API_KEY: 'env-key' }, false);
  try {
    assert.deepEqual(await w.service.seedFromEnv(), []);
    assert.equal(w.service.get('X_API_KEY'), 'env-key');
    await assert.rejects(() => w.service.set({ X_API_KEY: 'x' }, 'staff'), /CREDENTIALS_ENCRYPTION_KEY/);
    await assert.rejects(() => w.service.clear('X_API_KEY', 'staff'), /CREDENTIALS_ENCRYPTION_KEY/);
    assert.equal(await w.prisma.credential.count(), 0, 'no plaintext was ever written');
    assert.equal(w.service.describe().encryptionReady, false);
  } finally { await w.done(); }
});

db('a saved value that cannot be opened (the key changed) is reported and the .env is used meanwhile; entering it again fixes it', async () => {
  const w = await world({ X_API_KEY: 'env-key' });
  try {
    await w.service.set({ X_API_KEY: 'portal-key' }, 'staff');
    process.env.CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    await w.service.refresh();
    assert.equal(w.service.get('X_API_KEY'), 'env-key');
    const field = w.service.describe().groups.flatMap((g) => g.fields).find((f) => f.key === 'X_API_KEY')!;
    assert.match(field.error!, /cannot be opened/);
    await w.service.set({ X_API_KEY: 'entered-again' }, 'staff');
    assert.equal(w.service.get('X_API_KEY'), 'entered-again');
    assert.equal(w.service.describe().groups.flatMap((g) => g.fields).find((f) => f.key === 'X_API_KEY')!.error, null);
  } finally { await w.done(); }
});

db('a stored value moved to another name is refused rather than used', async () => {
  const w = await world();
  try {
    await w.service.set({ X_API_KEY: 'api-key-value' }, 'staff');
    const stolen = await w.prisma.credential.findUniqueOrThrow({ where: { key: 'X_API_KEY' } });
    await w.prisma.credential.create({ data: { key: 'X_API_SECRET', value: stolen.value, source: 'PORTAL', updatedBy: 'attacker' } });
    await w.service.refresh();
    assert.equal(w.service.get('X_API_SECRET'), '', 'it does not decrypt under the other name');
  } finally { await w.done(); }
});
