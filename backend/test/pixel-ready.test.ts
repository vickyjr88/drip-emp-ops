import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PIXEL_POLL_MS, PIXEL_WAIT_MS, PixelQueue, whenPixelReady } from '../../web/app/lib/pixel-ready';

const ready = (state: { on: boolean }) => () => state.on;

test('an event that finds no pixel waits, and is sent once the pixel exists', () => {
  const q = new PixelQueue();
  const pixel = { on: false };
  const sent: string[] = [];
  q.push({ isReady: ready(pixel), send: () => sent.push('ViewContent'), deadline: 10_000 });
  assert.equal(q.flush(0), true, 'still waiting');
  assert.deepEqual(sent, []);
  pixel.on = true;
  assert.equal(q.flush(50), false, 'nothing left once it was sent');
  assert.deepEqual(sent, ['ViewContent']);
  assert.equal(q.flush(100), false);
  assert.deepEqual(sent, ['ViewContent'], 'and never sent twice');
});

test('events reach the pixel in the order the page reported them', () => {
  const q = new PixelQueue();
  const pixel = { on: false };
  const sent: string[] = [];
  for (const name of ['PageView', 'ViewContent', 'AddToCart']) q.push({ isReady: ready(pixel), send: () => sent.push(name), deadline: 10_000 });
  pixel.on = true;
  q.flush(1);
  assert.deepEqual(sent, ['PageView', 'ViewContent', 'AddToCart']);
});

test('an event whose pixel never appears (an ad blocker, a failed script) is dropped after its deadline, quietly', () => {
  const q = new PixelQueue();
  const sent: string[] = [];
  q.push({ isReady: () => false, send: () => sent.push('x'), deadline: 1_000 });
  assert.equal(q.flush(999), true, 'still within its time');
  assert.equal(q.flush(1_000), false, 'forgotten at the deadline');
  assert.deepEqual(sent, []);
  assert.equal(q.size, 0);
});

test('each event waits for its own pixel: one pixel being ready does not release another\'s events', () => {
  const q = new PixelQueue();
  const meta = { on: true };
  const tiktok = { on: false };
  const sent: string[] = [];
  q.push({ isReady: ready(tiktok), send: () => sent.push('tiktok'), deadline: 5_000 });
  q.push({ isReady: ready(meta), send: () => sent.push('meta'), deadline: 5_000 });
  assert.equal(q.flush(10), true);
  assert.deepEqual(sent, ['meta'], 'the ready pixel is not held up by the one still loading');
  tiktok.on = true;
  assert.equal(q.flush(20), false);
  assert.deepEqual(sent, ['meta', 'tiktok']);
});

test('a pixel that throws cannot break the page or hold up the events behind it', () => {
  const q = new PixelQueue();
  const sent: string[] = [];
  q.push({ isReady: () => true, send: () => { throw new Error('pixel exploded'); }, deadline: 5_000 });
  q.push({ isReady: () => true, send: () => sent.push('next'), deadline: 5_000 });
  assert.doesNotThrow(() => q.flush(0));
  assert.deepEqual(sent, ['next']);
});

test('the wait is long enough for a slow phone and the polling is quick', () => {
  assert.ok(PIXEL_WAIT_MS >= 5_000 && PIXEL_WAIT_MS <= 30_000);
  assert.ok(PIXEL_POLL_MS >= 10 && PIXEL_POLL_MS <= 200);
});

test('with no browser (server rendering) reporting an event does nothing and does not throw', () => {
  assert.equal(typeof (globalThis as any).window, 'undefined');
  let sent = 0;
  assert.doesNotThrow(() => whenPixelReady({ configured: true, isReady: () => true, send: () => { sent += 1; } }));
  assert.equal(sent, 0, 'a server never reports to an ad pixel');
});
