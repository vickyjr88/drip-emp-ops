import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { MediaService } from '../src/media/media.service';

/** A tiny in-memory stand-in for the MediaAsset table: just the calls the service makes. */
function fakePrisma() {
  const rows: any[] = [];
  let n = 0;
  const match = (row: any, where: any = {}) =>
    Object.entries(where).every(([key, cond]: [string, any]) => {
      if (cond && typeof cond === 'object' && 'startsWith' in cond) return String(row[key]).startsWith(cond.startsWith);
      if (cond && typeof cond === 'object' && 'contains' in cond) return String(row[key]).toLowerCase().includes(cond.contains.toLowerCase());
      return row[key] === cond;
    });
  const withRelations = (row: any) => ({ ...row });
  const mediaAsset = {
    create: async ({ data }: any) => {
      const row = { id: `a${++n}`, createdAt: new Date(2026, 10, 1, 0, 0, n), updatedAt: new Date(2026, 10, 1, 0, 0, n), width: null, height: null, versions: null, uploadedBy: null, purpose: 'LIBRARY', ...data };
      rows.push(row);
      return withRelations(row);
    },
    createMany: async ({ data }: any) => { for (const d of data) if (!rows.some((r) => r.objectKey === d.objectKey)) await mediaAsset.create({ data: d }); },
    findUnique: async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null,
    findMany: async ({ where, take, cursor, skip, select }: any = {}) => {
      let list = rows.filter((r) => match(r, where)).sort((a, b) => +b.createdAt - +a.createdAt);
      if (cursor) list = list.slice(list.findIndex((r) => r.id === cursor.id) + (skip ?? 0));
      if (take) list = list.slice(0, take);
      return select ? list.map((r) => ({ objectKey: r.objectKey })) : list.map(withRelations);
    },
    count: async ({ where }: any) => rows.filter((r) => match(r, where)).length,
    update: async ({ where, data }: any) => Object.assign(rows.find((r) => r.id === where.id), data, { updatedAt: new Date() }),
  };
  return { prisma: { mediaAsset } as any, rows };
}

/** A tiny in-memory object store. */
function fakeStore(listed: Array<{ name: string; size: number; lastModified: Date }> = []) {
  const objects = new Map<string, { data: Buffer; type: string }>();
  const client: any = {
    bucketExists: async () => true,
    putObject: async (_b: string, key: string, data: Buffer, _size: number, meta: any) => { objects.set(key, { data, type: meta['Content-Type'] }); },
    removeObject: async (_b: string, key: string) => { objects.delete(key); },
    statObject: async (_b: string, key: string) => {
      const o = objects.get(key);
      if (!o) throw new Error('missing');
      return { size: o.data.length, etag: require('crypto').createHash('md5').update(o.data).digest('hex'), lastModified: new Date(), metaData: { 'content-type': o.type } };
    },
    getObject: async (_b: string, key: string) => {
      const o = objects.get(key);
      if (!o) throw new Error('missing');
      return (async function* () { yield o.data; })();
    },
    getPartialObject: async (_b: string, key: string, _from: number, len: number) => {
      const o = objects.get(key)!;
      return (async function* () { yield o.data.subarray(0, len); })();
    },
    listObjectsV2: () => {
      const { Readable } = require('stream');
      return Readable.from([...objects.keys()].map((name) => ({ name, size: objects.get(name)!.data.length, lastModified: new Date() })).concat(listed as any));
    },
  };
  return { client, objects };
}

function service(listed: any[] = []) {
  const db = fakePrisma();
  const store = fakeStore(listed);
  const svc = new MediaService(db.prisma);
  (svc as any).client = store.client;
  return { svc, ...db, ...store };
}

const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: '#336699' } }).png().toBuffer();
const upload = async (svc: MediaService, name: string, buffer: Buffer, mimetype = 'image/png', purpose?: 'LIBRARY' | 'DOCUMENT') =>
  svc.uploadProjectAsset({ originalname: name, mimetype, buffer }, { purpose, uploadedBy: 'staff@x' });

test('an upload is recorded with its name, size and dimensions', async () => {
  const { svc, rows } = service();
  const out = await upload(svc, 'shoe.png', await png(200, 100));
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].fileName, rows[0].width, rows[0].height, rows[0].purpose, rows[0].uploadedBy], ['shoe.png', 200, 100, 'LIBRARY', 'staff@x']);
  assert.equal(out.id, rows[0].id);
});

test('cropping REPLACES the image: same address, same library entry, new picture', async () => {
  const { svc, rows, objects } = service();
  const src = await upload(svc, 'shoe.png', await png(400, 300));
  const before = Buffer.from(objects.get(src.objectKey)!.data);

  const out = await svc.cropAsset(src.id!, { x: 50, y: 20, width: 200, height: 200 }, 'staff@x');

  // One image, still at its own address.
  assert.equal(out.id, src.id);
  assert.equal(out.objectKey, src.objectKey);
  assert.equal(out.url, src.url);
  assert.equal(rows.length, 1);
  assert.equal((await svc.listLibrary()).total, 1);
  // The file at that address is now the 200 x 200 picture.
  const meta = await sharp(objects.get(src.objectKey)!.data).metadata();
  assert.deepEqual([meta.width, meta.height], [200, 200]);
  assert.ok(!objects.get(src.objectKey)!.data.equals(before));
  assert.deepEqual([out.width, out.height, rows[0].width, rows[0].height], [200, 200, 200, 200]);
  assert.equal(out.hasPreviousVersion, true);
});

test('the picture as it was is kept as a previous version, not as a library image', async () => {
  const { svc, rows, objects } = service();
  const src = await upload(svc, 'shoe.png', await png(400, 300));
  const before = Buffer.from(objects.get(src.objectKey)!.data);
  await svc.cropAsset(src.id!, { x: 0, y: 0, width: 100, height: 100 });

  const kept = rows[0].versions as any[];
  assert.equal(kept.length, 1);
  assert.match(kept[0].objectKey, /^versions\//);
  assert.ok(objects.get(kept[0].objectKey)!.data.equals(before));
  assert.deepEqual([kept[0].width, kept[0].height], [400, 300]);
  // The library lists the one image only.
  assert.equal((await svc.listLibrary()).items.length, 1);
});

test('the sync never turns a stored previous version into a library image', async () => {
  const { svc, objects } = service();
  const src = await upload(svc, 'shoe.png', await png(300, 300));
  await svc.cropAsset(src.id!, { x: 0, y: 0, width: 100, height: 100 });
  (svc as any).lastSync = 0;
  const lib = await svc.listLibrary();
  assert.equal(lib.total, 1);
  assert.ok([...objects.keys()].some((key) => key.startsWith('versions/')));
});

test('restoring undoes the crop and puts the original back, byte for byte', async () => {
  const { svc, rows, objects } = service();
  const src = await upload(svc, 'shoe.png', await png(400, 300));
  const before = Buffer.from(objects.get(src.objectKey)!.data);
  await svc.cropAsset(src.id!, { x: 10, y: 10, width: 100, height: 100 });
  const versionKey = (rows[0].versions as any[])[0].objectKey;

  const back = await svc.restoreAsset(src.id!);

  assert.ok(objects.get(src.objectKey)!.data.equals(before));
  assert.deepEqual([back.width, back.height, back.hasPreviousVersion], [400, 300, false]);
  assert.equal(objects.has(versionKey), false, 'the spent version is cleaned up');
  await assert.rejects(() => svc.restoreAsset(src.id!), /not been cropped/i);
});

test('cropping twice keeps both earlier versions and restores them in order', async () => {
  const { svc, rows, objects } = service();
  const src = await upload(svc, 'shoe.png', await png(400, 400));
  await svc.cropAsset(src.id!, { x: 0, y: 0, width: 300, height: 300 });
  await svc.cropAsset(src.id!, { x: 0, y: 0, width: 100, height: 100 });
  assert.equal((rows[0].versions as any[]).length, 2);
  await svc.restoreAsset(src.id!);
  assert.deepEqual([rows[0].width, rows[0].height], [300, 300]);
  await svc.restoreAsset(src.id!);
  assert.deepEqual([rows[0].width, rows[0].height], [400, 400]);
  assert.equal([...objects.keys()].filter((k) => k.startsWith('versions/')).length, 0);
});

test('only the last few versions are kept', async () => {
  const { svc, rows, objects } = service();
  const src = await upload(svc, 'shoe.png', await png(600, 600));
  for (let i = 0; i < 7; i++) await svc.cropAsset(src.id!, { x: 0, y: 0, width: 590 - i * 20, height: 590 - i * 20 });
  assert.equal((rows[0].versions as any[]).length, 5);
  assert.equal([...objects.keys()].filter((k) => k.startsWith('versions/')).length, 5);
});

test('one click square takes the largest centred square', async () => {
  const { svc, objects } = service();
  // 400 x 200: three colour bands left to right, so the middle can be told from the ends.
  const bands = await sharp({ create: { width: 400, height: 200, channels: 3, background: '#ff0000' } })
    .composite([
      { input: await sharp({ create: { width: 200, height: 200, channels: 3, background: '#00ff00' } }).png().toBuffer(), left: 100, top: 0 },
    ])
    .png()
    .toBuffer();
  const src = await upload(svc, 'wide.png', bands);
  const out = await svc.cropAsset(src.id!, { square: true });
  assert.deepEqual([out.width, out.height], [200, 200]);
  const { data, info } = await sharp(objects.get(src.objectKey)!.data).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 200);
  // The centre 200 x 200 of the original was the green band.
  assert.deepEqual([...data.subarray(0, 3)], [0, 255, 0]);
});

test('square works on a tall picture too, and on one that is already square it is refused', async () => {
  const { svc } = service();
  const tall = await upload(svc, 'tall.png', await png(100, 300));
  assert.deepEqual([(await svc.cropAsset(tall.id!, { square: true })).width, (await svc.cropAsset(tall.id!, { square: true }).catch(() => null))], [100, null]);
  const sq = await upload(svc, 'sq.png', await png(120, 120));
  await assert.rejects(() => svc.cropAsset(sq.id!, { square: true }), /whole image/i);
});

test('a crop keeps the picture format: JPEG stays JPEG, GIF becomes PNG', async () => {
  const { svc, objects, rows } = service();
  const jpg = await sharp({ create: { width: 120, height: 120, channels: 3, background: '#aa0000' } }).jpeg().toBuffer();
  const j = await upload(svc, 'a.jpg', jpg, 'image/jpeg');
  await svc.cropAsset(j.id!, { x: 10, y: 10, width: 64, height: 64 });
  assert.equal(objects.get(j.objectKey)!.type, 'image/jpeg');

  const gif = await sharp({ create: { width: 120, height: 120, channels: 3, background: '#00aa00' } }).gif().toBuffer();
  const g = await upload(svc, 'b.gif', gif, 'image/gif');
  await svc.cropAsset(g.id!, { x: 0, y: 0, width: 50, height: 50 });
  assert.equal(objects.get(g.objectKey)!.type, 'image/png');
  assert.equal(rows.find((r) => r.id === g.id).contentType, 'image/png');
});

test('a camera-rotated photo is cropped in the orientation people see', async () => {
  const { svc, objects } = service();
  // 200 wide x 100 tall pixels, flagged to display rotated a quarter turn: it looks 100 wide x 200 tall.
  const raw = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#223344' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const src = await upload(svc, 'phone.jpg', raw, 'image/jpeg');
  const out = await svc.cropAsset(src.id!, { x: 0, y: 100, width: 100, height: 100 });
  assert.deepEqual([out.width, out.height], [100, 100]);
  const meta = await sharp(objects.get(src.objectKey)!.data).metadata();
  assert.deepEqual([meta.width, meta.height], [100, 100]);
});

test('impossible crops are refused and the image is left exactly as it was', async () => {
  const { svc, rows, objects } = service();
  const src = await upload(svc, 'shoe.png', await png(100, 100));
  const stored = objects.size;
  const before = Buffer.from(objects.get(src.objectKey)!.data);
  for (const rect of [
    { x: 0, y: 0, width: 8, height: 8 }, // smaller than the minimum
    { x: 90, y: 0, width: 50, height: 50 }, // runs off the right edge
    { x: 0, y: 95, width: 50, height: 50 }, // runs off the bottom
    { x: 200, y: 0, width: 50, height: 50 }, // entirely outside
    { x: -5, y: 0, width: 50, height: 50 }, // negative
    { x: NaN, y: 0, width: 50, height: 50 },
    { x: 0, y: 0, width: 100, height: 100 }, // the whole image
  ]) {
    await assert.rejects(() => svc.cropAsset(src.id!, rect), /crop|inside|outside/i, JSON.stringify(rect));
  }
  assert.equal(objects.size, stored);
  assert.ok(objects.get(src.objectKey)!.data.equals(before));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].versions, null);
});

test('a crop that is a pixel over because of rounding is trimmed to fit', async () => {
  const { svc } = service();
  const src = await upload(svc, 'shoe.png', await png(100, 100));
  const crop = await svc.cropAsset(src.id!, { x: 20, y: 0, width: 80.6, height: 100 });
  assert.deepEqual([crop.width, crop.height], [80, 100]);
});

test('an unknown image and a non-image are refused', async () => {
  const { svc } = service();
  await assert.rejects(() => svc.cropAsset('nope', { x: 0, y: 0, width: 50, height: 50 }), /not found/i);
  const pdf = await upload(svc, 'bill.pdf', Buffer.from('%PDF-1.4 fake'), 'application/pdf');
  await assert.rejects(() => svc.cropAsset(pdf.id!, { x: 0, y: 0, width: 50, height: 50 }), /not found/i);
});

test('receipts uploaded as documents stay out of the library', async () => {
  const { svc } = service();
  await upload(svc, 'photo.png', await png(50, 50));
  await upload(svc, 'receipt.png', await png(50, 50), 'image/png', 'DOCUMENT');
  const lib = await svc.listLibrary();
  assert.deepEqual(lib.items.map((i) => i.fileName), ['photo.png']);
});

test('the library searches by name and pages with a cursor', async () => {
  const { svc } = service();
  for (const name of ['nike-air.png', 'adidas-samba.png', 'nike-dunk.png', 'puma.png']) await upload(svc, name, await png(40, 40));
  assert.deepEqual((await svc.listLibrary({ search: 'NIKE' })).items.map((i) => i.fileName).sort(), ['nike-air.png', 'nike-dunk.png']);
  const first = await svc.listLibrary({ limit: 3 });
  assert.equal(first.items.length, 3);
  assert.ok(first.nextCursor);
  const second = await svc.listLibrary({ limit: 3, cursor: first.nextCursor! });
  assert.equal(second.items.length, 1);
  assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.items, ...second.items].map((i) => i.id)).size, 4);
});

test('images already in the bucket before the table existed are added to the library', async () => {
  const { svc, rows } = service([
    { name: 'old-1.jpg', size: 1000, lastModified: new Date('2026-01-01') },
    { name: 'old-2.png', size: 2000, lastModified: new Date('2026-02-01') },
    { name: 'invoice.pdf', size: 3000, lastModified: new Date('2026-02-01') },
  ]);
  const lib = await svc.listLibrary();
  assert.deepEqual(lib.items.map((i) => i.objectKey).sort(), ['old-1.jpg', 'old-2.png']);
  assert.equal(rows.some((r) => r.objectKey === 'invoice.pdf'), false);
  assert.equal(lib.items.find((i) => i.objectKey === 'old-1.jpg')!.contentType, 'image/jpeg');
});

test('a browser that already has the current picture is told "not modified"; after a crop it gets the new one', async () => {
  const { svc } = service();
  const src = await upload(svc, 'shoe.png', await png(300, 300));

  const first = await svc.getObject(src.objectKey);
  assert.equal(first.notModified, false);
  assert.ok(first.etag);

  const again = await svc.getObject(src.objectKey, `"${first.etag}"`);
  assert.equal(again.notModified, true);

  await svc.cropAsset(src.id!, { x: 0, y: 0, width: 100, height: 100 });
  const afterCrop = await svc.getObject(src.objectKey, `"${first.etag}"`);
  assert.equal(afterCrop.notModified, false, 'the old validator must not match the cropped picture');
  assert.notEqual(afterCrop.etag, first.etag);
});
