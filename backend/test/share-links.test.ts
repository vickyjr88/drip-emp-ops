import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildShareLink, channelHref, pictureFileName, shareMessage } from '../../web/app/lib/share-links';
import { affiliateLink } from '../src/share-kit/share-kit';

test('an affiliate\'s link carries their code and tags the channel; a customer\'s has no code', () => {
  assert.equal(
    buildShareLink('https://dripemporium.store/shop/nike-af1', { code: 'kZ3F9pQd', channel: 'whatsapp' }),
    'https://dripemporium.store/shop/nike-af1?ref=kZ3F9pQd&utm_source=whatsapp&utm_medium=social&utm_campaign=affiliate',
  );
  assert.equal(
    buildShareLink('https://dripemporium.store/shop/nike-af1', { channel: 'facebook' }),
    'https://dripemporium.store/shop/nike-af1?utm_source=facebook&utm_medium=social&utm_campaign=customer-share',
  );
  assert.ok(!buildShareLink('https://x.test/shop/a', { code: null, channel: 'x' }).includes('ref='));
  assert.ok(!buildShareLink('https://x.test/shop/a', { code: '', channel: 'x' }).includes('ref='));
});

test('the page and the server make the very same address for an affiliate, so a link is the same wherever it is made', () => {
  for (const channel of ['whatsapp', 'facebook', 'telegram'] as const) {
    assert.equal(buildShareLink('https://dripemporium.store/shop/nike-af1', { code: 'kZ3F9pQd', channel }), affiliateLink('https://dripemporium.store', 'nike-af1', 'kZ3F9pQd', channel));
  }
});

test('a code can never break out of its parameter, and a watch keeps its own address', () => {
  const link = buildShareLink('https://dripemporium.store/watches/casio-f91w', { code: 'a b&c=d', channel: 'x' });
  assert.equal(new URL(link).searchParams.get('ref'), 'a b&c=d');
  assert.equal(new URL(link).pathname, '/watches/casio-f91w');
});

test('each channel gets the address it needs, with the words and the link in the right places', () => {
  const link = 'https://dripemporium.store/shop/af1?ref=K&utm_source=whatsapp';
  const input = { link, text: 'Nike Air Force 1\nKSh 4,200' };
  const wa = channelHref('whatsapp', input)!;
  assert.ok(wa.startsWith('https://wa.me/?text='));
  assert.equal(decodeURIComponent(wa.split('text=')[1]), `Nike Air Force 1\nKSh 4,200\n\n🛒 ${link}`);
  assert.equal(channelHref('facebook', input), `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`);
  const x = new URL(channelHref('x', input)!);
  assert.deepEqual([x.host, x.searchParams.get('url'), x.searchParams.get('text')], ['twitter.com', link, 'Nike Air Force 1\nKSh 4,200']);
  const tg = new URL(channelHref('telegram', input)!);
  assert.deepEqual([tg.host, tg.searchParams.get('url')], ['t.me', link]);
  assert.equal(channelHref('share', input), null);
  assert.equal(channelHref('link', input), null);
});

test('the message and the picture\'s file name', () => {
  assert.equal(shareMessage({ name: 'Nike AF1', priceText: 'KSh 4,200', link: 'https://x.test/a' }), 'Nike AF1\nKSh 4,200\n\n🛒 https://x.test/a');
  assert.equal(pictureFileName('nike-air-force-1'), 'status-nike-air-force-1.jpg');
  assert.equal(pictureFileName('../../etc/passwd'), 'status-etcpasswd.jpg');
  assert.equal(pictureFileName(''), 'status-product.jpg');
});
