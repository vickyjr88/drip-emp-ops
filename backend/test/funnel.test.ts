import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { FunnelService } from '../src/insights/funnel.service';

// --- the visit funnel against a real database (KITS_TEST_DATABASE_URL, a scratch database) ---------------------------------

const url = process.env.KITS_TEST_DATABASE_URL;
const skip = url ? false : 'KITS_TEST_DATABASE_URL is not set';

test('the funnel counts a visit once per step, including opening the cart and tapping a call', { skip }, async () => {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    // A source name nothing else uses, so these six visits are the only ones in their row however often this runs.
    const source = `Test${Date.now().toString(36)}`;
    const id = (n: number) => `${source}${n}`.padEnd(14, 'x');
    const at = new Date();
    const from = new Date(at.getTime() - 3_600_000);
    const to = new Date(at.getTime() + 3_600_000);
    const visit = (n: number, extra: string[] = []) => [
      { sessionId: id(n), type: 'SESSION_START', source, medium: 'paid', device: 'mobile', createdAt: at },
      ...extra.map((type) => ({ sessionId: id(n), type, productSlug: type === 'VIEW_PRODUCT' ? 'air-force-1-black' : null, createdAt: at })),
    ];
    await prisma.storefrontEvent.createMany({
      data: [
        ...visit(1, ['VIEW_PRODUCT']),                                                   // looked only
        ...visit(2, ['VIEW_PRODUCT', 'ADD_TO_CART']),                                    // added, never opened the cart
        ...visit(3, ['VIEW_PRODUCT', 'ADD_TO_CART', 'VIEW_CART']),                       // opened the cart, left
        ...visit(4, ['VIEW_PRODUCT', 'ADD_TO_CART', 'VIEW_CART', 'BEGIN_CHECKOUT']),     // pressed Pay
        ...visit(5, ['VIEW_PRODUCT', 'CALL_CLICK', 'CALL_CLICK']),                       // called (twice: still one visit)
        ...visit(6, ['VIEW_PRODUCT', 'WHATSAPP_CLICK', 'CALL_CLICK']),                   // both
      ],
    });

    const f = await new FunnelService(prisma as any).funnel(from, to);
    const row = f.bySource.find((r) => r.source === source && r.medium === 'paid')!;
    assert.ok(row, 'the source row exists');
    assert.deepEqual(
      { sessions: row.sessions, viewedProduct: row.viewedProduct, addedToCart: row.addedToCart, viewedCart: row.viewedCart, beganCheckout: row.beganCheckout, tappedWhatsapp: row.tappedWhatsapp, tappedCall: row.tappedCall },
      { sessions: 6, viewedProduct: 6, addedToCart: 3, viewedCart: 2, beganCheckout: 1, tappedWhatsapp: 1, tappedCall: 2 },
    );
    // The totals include them too (other visits in the database can only add to these).
    assert.ok(f.totals.viewedCart >= 2 && f.totals.tappedCall >= 2);
    // A device row exists for them as well.
    assert.ok(f.byDevice.find((d) => d.device === 'mobile')!.tappedCall >= 2);
  } finally {
    await prisma.$disconnect();
  }
});
