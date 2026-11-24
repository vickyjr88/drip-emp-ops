import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { plan, renditionFromUrl, toJpeg } from '../src/social-posting/social-image';

const picture = (width: number, height: number, format: 'png' | 'webp' | 'jpeg', alpha = false) =>
  sharp({ create: { width, height, channels: alpha ? 4 : 3, background: alpha ? { r: 255, g: 0, b: 0, alpha: 0 } : { r: 200, g: 30, b: 30 } } })[format]().toBuffer();

const describe = async (buf: Buffer) => { const m = await sharp(buf).metadata(); return { format: m.format, width: m.width!, height: m.height!, ratio: m.width! / m.height! }; };

test('whatever the format, the result is a JPEG', async () => {
  for (const format of ['png', 'webp', 'jpeg'] as const) {
    const out = await describe(await toJpeg(await picture(800, 800, format)));
    assert.equal(out.format, 'jpeg', format);
  }
});

test('a square photo stays square; a big one is brought down to 1080 wide; a tiny one is brought up to 320', async () => {
  assert.deepEqual(await describe(await toJpeg(await picture(2000, 2000, 'png'))), { format: 'jpeg', width: 1080, height: 1080, ratio: 1 });
  const small = await describe(await toJpeg(await picture(100, 100, 'png')));
  assert.equal(small.width, 320);
});

test('a shape outside 4:5 to 1.91:1 is centred on a canvas of the nearest allowed shape, never cut off', async () => {
  const tall = await describe(await toJpeg(await picture(500, 1500, 'png')));
  assert.equal(tall.width, 1080);
  assert.ok(tall.ratio >= 0.8 - 0.01 && tall.ratio <= 1.91, `tall ratio ${tall.ratio}`);
  const wide = await describe(await toJpeg(await picture(3000, 500, 'png')));
  assert.ok(wide.ratio <= 1.91 + 0.01 && wide.ratio >= 0.8, `wide ratio ${wide.ratio}`);
  assert.deepEqual(plan(1000, 1000), { width: 1000, height: 1000, pad: false });
});

test('transparency becomes white, not black', async () => {
  const out = await toJpeg(await picture(400, 400, 'png', true));
  const { data } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
  assert.ok(data[0] > 240 && data[1] > 240 && data[2] > 240, `first pixel ${data[0]},${data[1]},${data[2]}`);
});

test('a photo is fetched by https only, and a failed fetch or a non-picture is refused', async () => {
  const png = await picture(600, 600, 'png');
  const ok = (async () => new Response(png, { status: 200, headers: { 'content-type': 'image/png' } })) as unknown as typeof fetch;
  assert.equal((await describe(await renditionFromUrl('https://cdn.example/x.png', ok))).format, 'jpeg');
  await assert.rejects(() => renditionFromUrl('http://cdn.example/x.png', ok), /https/);
  const gone = (async () => new Response('no', { status: 404 })) as unknown as typeof fetch;
  await assert.rejects(() => renditionFromUrl('https://cdn.example/x.png', gone), /404/);
  const notPicture = (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch;
  await assert.rejects(() => renditionFromUrl('https://cdn.example/x.png', notPicture));
});
