import assert from 'node:assert/strict';
import { test } from 'node:test';
import { XClient, oauth1Header, xFailure } from '../src/social-posting/channels/x-client';

// The inputs are the worked example from X's documentation (the keys are the published dummy ones). The expected signature was computed
// independently with oauthlib 4.0.1 (a widely used OAuth 1.0 library) from the same inputs, not copied from memory of the docs.
test('the OAuth 1.0a signature matches an independent implementation (oauthlib) for the same inputs', () => {
  const header = oauth1Header(
    'POST',
    'https://api.twitter.com/1.1/statuses/update.json?include_entities=true',
    { apiKey: 'xvz1evFS4wEEPTGEFPHBog', apiSecret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw', accessToken: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb', accessTokenSecret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE' },
    { status: 'Hello Ladies + Louis, Hello Gentlemen, and Hello Everyone!' },
    { nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg', timestamp: '1318622958' },
  );
  assert.match(header, /oauth_signature="laFSYsV%2Fu%2BWDfjZOhOHnt%2FactcU%3D"/);
  assert.match(header, /^OAuth oauth_consumer_key="xvz1evFS4wEEPTGEFPHBog"/);
});

const creds = { apiKey: 'k', apiSecret: 's', accessToken: 't', accessTokenSecret: 'ts' };

test('a post uploads the picture, then posts with its id, and gives the link', async () => {
  const calls: Array<{ url: string; method: string; body: any; auth: string }> = [];
  const call = async (url: string, init: RequestInit) => {
    calls.push({ url, method: String(init.method), body: init.body ? JSON.parse(String(init.body)) : null, auth: String((init.headers as any).Authorization) });
    return url.endsWith('/media/upload') ? { status: 200, data: { data: { id: '1234' } } } : { status: 201, data: { data: { id: '987', text: 'x' } } };
  };
  const out = await new XClient(creds, call).publish(Buffer.from('jpeg-bytes'), 'Nike Air Max');
  assert.deepEqual(out, { ok: true, id: '987', permalink: 'https://x.com/i/web/status/987' });
  assert.equal(calls[0].url, 'https://api.x.com/2/media/upload');
  assert.equal(calls[0].body.media_category, 'tweet_image');
  assert.equal(Buffer.from(calls[0].body.media, 'base64').toString(), 'jpeg-bytes');
  assert.equal(calls[1].url, 'https://api.x.com/2/tweets');
  assert.deepEqual(calls[1].body, { text: 'Nike Air Max', media: { media_ids: ['1234'] } });
  assert.ok(calls.every((c) => c.auth.startsWith('OAuth ')));
});

test('no credit left is said plainly and not retried; a rate limit or an outage is retried; duplicate text is not', () => {
  const credit = xFailure({ status: 402, data: { title: 'CreditsDepleted', detail: 'Your enrolled account does not have any credits' } });
  assert.equal(credit.transient, false);
  assert.match(credit.error, /no credit left/i);
  assert.equal(xFailure({ status: 429, data: {} }).transient, true);
  assert.equal(xFailure({ status: 503, data: {} }).transient, true);
  assert.equal(xFailure(null).transient, true);
  const dup = xFailure({ status: 403, data: { detail: 'You are not allowed to create a Tweet with duplicate content.' } });
  assert.equal(dup.transient, false);
  assert.match(xFailure({ status: 401, data: { title: 'Unauthorized' } }).error, /X_API_KEY/);
});

test('a failed upload stops before posting; a failed post is reported', async () => {
  let posted = 0;
  const failUpload = async (url: string) => { if (url.endsWith('/tweets')) posted += 1; return { status: 400, data: { detail: 'Bad media' } }; };
  const a = await new XClient(creds, failUpload).publish(Buffer.from('x'), 't');
  assert.equal(a.ok, false);
  assert.equal(posted, 0);
  const failPost = async (url: string) => (url.endsWith('/media/upload') ? { status: 200, data: { data: { id: '1' } } } : { status: 403, data: { detail: 'duplicate' } });
  const b = await new XClient(creds, failPost).publish(Buffer.from('x'), 't');
  assert.equal(b.ok, false);
});

test('a post can be taken down, and a refusal is explained', async () => {
  const ok = await new XClient(creds, async () => ({ status: 200, data: { data: { deleted: true } } })).remove('987');
  assert.deepEqual(ok, { removed: true, detail: null });
  const no = await new XClient(creds, async () => ({ status: 403, data: { detail: 'Forbidden' } })).remove('987');
  assert.equal(no.removed, false);
});
