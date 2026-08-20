import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrderLineFulfillmentStatus, OrderLineFulfillmentType, OrderStatus, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { SalesPostingService } from '../sales-posting/sales-posting.service';
import { PaystackService } from '../paystack/paystack.service';
import { OwnerNotificationService } from '../email-log/owner-notification.service';
import { CheckoutDto, CustomerSignupDto } from './dto/checkout.dto';
import { nextReference, retryOnDuplicateReference } from '../common/next-reference';

/** Free delivery over this, as advertised on the storefront. */
const FREE_DELIVERY_OVER = 15000;
const DELIVERY_FEE = 500;

/**
 * The order a payment reference belongs to.
 *
 * References are "DE-2026-00007-M1A2B3": the order number plus a per-attempt
 * suffix, because Paystack will not accept the same reference twice. Anything
 * without a suffix is an older reference and is already an order number.
 */
export function orderNumberFromReference(reference: string): string {
  const match = /^([A-Z]+-\d{4}-\d{5})(?:-.+)?$/.exec(reference.trim());
  return match ? match[1] : reference.trim();
}

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly posting: SalesPostingService,
    private readonly paystack: PaystackService,
    private readonly ownerNotification: OwnerNotificationService,
  ) {}

  /**
   * Creates the account, or attaches to an existing one.
   *
   * An email already in use is not an error here: the shop knows this person,
   * and refusing the purchase to protect a password they may not have set
   * would cost a sale for nothing. A password is only ever set when the
   * account has none.
   */
  private async upsertCustomer(
    tx: Prisma.TransactionClient,
    details: { firstName: string; lastName: string; email: string; phone: string; password?: string },
  ) {
    const email = details.email.trim().toLowerCase();
    const existing = await tx.customer.findUnique({ where: { email } });

    if (existing) {
      const setPassword = details.password && !existing.portalPassword;
      if (setPassword) {
        const updated = await tx.customer.update({
          where: { id: existing.id },
          data: {
            portalPassword: await bcrypt.hash(details.password!, 10),
            portalEnabled: true,
            phone: details.phone || existing.phone,
          },
        });
        // A password being set is the actual "signed up" moment -- a bare
        // customer record from an earlier guest checkout was never that.
        void this.ownerNotification.notifySignup(updated);
        return updated;
      }
      return existing;
    }

    const created = await tx.customer.create({
      data: {
        firstName: details.firstName.trim(),
        lastName: details.lastName.trim(),
        email,
        phone: details.phone.trim(),
        ...(details.password
          ? { portalPassword: await bcrypt.hash(details.password, 10), portalEnabled: true }
          : {}),
      },
    });
    // Same distinction as above: only a password makes this a real signup,
    // not just a new guest-checkout customer row.
    if (details.password) void this.ownerNotification.notifySignup(created);
    return created;
  }

  /** Signup on its own, for someone creating an account before buying. */
  async signup(dto: CustomerSignupDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.customer.findUnique({ where: { email } });
    if (existing?.portalPassword) {
      // Says an account exists only for an address that can already sign in,
      // which the sign-in page would reveal anyway.
      throw new BadRequestException('An account with that email already exists. Sign in instead.');
    }

    const customer = await this.prisma.$transaction((tx) => this.upsertCustomer(tx, dto));
    return { id: customer.id, email: customer.email, firstName: customer.firstName };
  }

  private async nextOrderNumber(tx: Prisma.TransactionClient) {
    return nextReference(tx.order, 'orderNumber', 'DE');
  }

  /**
   * Places an online order and starts the payment.
   *
   * The order is written before Paystack is called so an abandoned payment
   * leaves a PENDING order the shop can follow up, rather than nothing at all.
   * Stock moves with it, for the same reason a counter sale does: two people
   * must not be sold the last pair while one of them is still typing a card
   * number.
   *
   * Prices come from the database, never from the request. A checkout that
   * trusted a posted price would let anyone buy at whatever they sent.
   */
  async start(dto: CheckoutDto, origin: string) {
    // Checked before anything is written. Without this the order was created
    // and the stock taken, and only then did Paystack reject the request --
    // so every attempt on an unconfigured shop quietly drained inventory.
    if (!this.paystack.configured) {
      throw new BadRequestException(
        'Online payment is not available right now. Message us on WhatsApp to reserve your pair.',
      );
    }

    // Retried as a whole: the order number is read inside the transaction, and
    // a unique violation rolls the transaction back, so re-running the create
    // alone is not possible -- the stock reservation goes with it.
    const { order, customer } = await retryOnDuplicateReference(() =>
      this.prisma.$transaction(async (tx) => {
      const store = dto.storeId
        ? await tx.store.findUnique({ where: { id: dto.storeId } })
        : await tx.store.findFirst({ where: { isActive: true }, orderBy: { name: 'asc' } });
      if (!store) throw new NotFoundException('No shop is available to fulfil this order.');

      const customer = await this.upsertCustomer(tx, dto);

      const variants = await tx.productVariant.findMany({
        where: { id: { in: dto.lines.map((line) => line.variantId) }, isActive: true },
        include: { product: { select: { name: true } } },
      });
      const byId = new Map(variants.map((variant) => [variant.id, variant]));

      // What is actually on the shelf at this store, for the variants in this
      // basket -- the storefront shows "order from supplier" for anything
      // with nothing sellable, but the basket is client-side and cannot be
      // trusted to have got that right, so it is re-checked here the same
      // way the till re-checks isDropShip rather than trusting the request.
      const stockLevels = await tx.stockLevel.findMany({
        where: { storeId: store.id, variantId: { in: dto.lines.map((line) => line.variantId) } },
      });
      const sellableByVariant = new Map(stockLevels.map((row) => [row.variantId, row.quantity - row.reserved]));

      // A live offer is the price the shopper was shown, so it is the price
      // they are charged. Read here rather than taken from the request: the
      // basket is client-side and cannot be trusted to name its own discount.
      const now = new Date();
      const offerLines = await tx.offerLine.findMany({
        where: {
          variantId: { in: dto.lines.map((line) => line.variantId) },
          offer: {
            status: 'ACTIVE',
            AND: [
              { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
              { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
            ],
          },
        },
      });
      const offerByVariant = new Map<string, number>();
      for (const offerLine of offerLines) {
        const price = Number(offerLine.offerPriceKes);
        const seen = offerByVariant.get(offerLine.variantId);
        if (seen === undefined || price < seen) offerByVariant.set(offerLine.variantId, price);
      }

      const lines = dto.lines.map((line) => {
        const variant = byId.get(line.variantId);
        if (!variant) throw new NotFoundException(`That item is no longer available.`);
        const listPrice = Number(variant.priceKes);
        const unitPrice = offerByVariant.get(variant.id) ?? listPrice;
        // A drop-ship listing is never held on the shelf, so every order
        // against it is sourced from the supplier -- same rule as the till.
        // A normal listing that has run out gets the same treatment: there is
        // nothing on the shelf to reserve, so it is sourced from the supplier
        // instead of failing the order outright. Each line's quantity is
        // drawn down from the running sellable total so a basket with two
        // lines against the same low-stock variant doesn't let both claim
        // the same last unit.
        const remaining = sellableByVariant.get(variant.id) ?? 0;
        const fulfillmentType: OrderLineFulfillmentType =
          variant.isDropShip || remaining < line.quantity ? 'SUPPLIER_ORDER' : 'STOCK';
        sellableByVariant.set(variant.id, remaining - line.quantity);
        return {
          variantId: variant.id,
          description: `${variant.product.name} — ${variant.name}`,
          quantity: line.quantity,
          unitPrice: new Prisma.Decimal(unitPrice),
          // Kept apart so the markdown is visible on the order and totals
          // into the discount reported by the margin reports.
          listPrice: new Prisma.Decimal(listPrice),
          discount: new Prisma.Decimal((listPrice - unitPrice) * line.quantity),
          lineTotal: new Prisma.Decimal(unitPrice * line.quantity),
          fulfillmentType,
          fulfillmentStatus: fulfillmentType === 'SUPPLIER_ORDER' ? OrderLineFulfillmentStatus.AWAITING_SUPPLIER : null,
        };
      });

      const subtotal = lines.reduce((sum, line) => sum + Number(line.lineTotal), 0);
      // Delivery only applies when there is somewhere to deliver to.
      const shipping = dto.shippingAddress?.trim()
        ? subtotal >= FREE_DELIVERY_OVER
          ? 0
          : DELIVERY_FEE
        : 0;

      const order = await tx.order.create({
        data: {
          orderNumber: await this.nextOrderNumber(tx),
          storeId: store.id,
          customerId: customer.id,
          channel: 'WEBSITE',
          customerName: `${customer.firstName} ${customer.lastName}`.trim(),
          customerPhone: customer.phone,
          customerEmail: customer.email,
          shippingAddress: dto.shippingAddress?.trim() || null,
          subtotal: new Prisma.Decimal(subtotal),
          shipping: new Prisma.Decimal(shipping),
          total: new Prisma.Decimal(subtotal + shipping),
          createdBy: 'storefront',
          lines: { create: lines },
        },
        include: { lines: true },
      });

      for (const line of lines) {
        // A SUPPLIER_ORDER line was never on the shelf, so there is nothing
        // to draw down here -- its cost is booked separately once the
        // supplier bill that fulfils it is approved.
        if (line.fulfillmentType !== 'STOCK') continue;
        await this.inventory.record(
          {
            variantId: line.variantId,
            storeId: store.id,
            type: 'SALE',
            quantity: line.quantity,
            reference: order.orderNumber,
          },
          'storefront',
          tx,
        );
      }

      return { order, customer };
      }),
    );

    // Paystack is called outside the transaction: an external call inside one
    // holds a database lock for as long as the network takes.
    // The payment reference is per attempt, not per order.
    //
    // Paystack keeps every reference it has ever seen, including abandoned
    // ones, and refuses a repeat with "Duplicate Transaction Reference". Using
    // the order number directly meant an order whose first payment was
    // abandoned could never be paid at all -- and a retry would strand a
    // second order row with stock held against it.
    const paymentReference = `${order.orderNumber}-${Date.now().toString(36).toUpperCase()}`;

    const init = await this.paystack.initialise({
      email: customer.email,
      amountKes: Number(order.total),
      reference: paymentReference,
      callbackUrl: `${origin}/checkout/complete?ref=${paymentReference}`,
      metadata: { orderId: order.id, orderNumber: order.orderNumber },
    });

    return {
      orderNumber: order.orderNumber,
      total: Number(order.total),
      authorizationUrl: init.authorization_url,
      reference: init.reference,
    };
  }

  /**
   * Settles an order against what Paystack says happened.
   *
   * Used by both the browser callback and the webhook, and safe to run twice:
   * the payment is keyed on the provider reference, so a webhook arriving
   * after the customer has already landed on the confirmation page records
   * nothing new.
   */
  async settle(reference: string) {
    const verified = await this.paystack.verify(reference);

    // A payment reference is "<orderNumber>-<attempt>"; older ones are the
    // bare order number, so both have to resolve.
    const order = await this.prisma.order.findFirst({
      where: { orderNumber: orderNumberFromReference(reference) },
      include: { payments: true },
    });
    if (!order) throw new NotFoundException(`No order for reference ${reference}`);

    if (verified.status !== 'success') {
      return { orderNumber: order.orderNumber, status: order.status, paid: false };
    }

    const already = await this.prisma.orderPayment.findUnique({
      where: { providerRef: verified.reference },
    });
    if (already) {
      return { orderNumber: order.orderNumber, status: order.status, paid: true, duplicate: true };
    }

    // Paystack reports in the smallest unit; convert back before recording.
    const amount = verified.amount / 100;

    const updated = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.orderPayment.create({
        data: {
          orderId: order.id,
          amount: new Prisma.Decimal(amount),
          method: 'PAYSTACK',
          reference: verified.reference,
          providerRef: verified.reference,
          providerStatus: verified.status,
          receivedBy: 'paystack',
        },
      });

      await this.posting.postOrderPayment(payment.id, tx);

      const paid = Number(order.amountPaid) + amount;
      return tx.order.update({
        where: { id: order.id },
        data: {
          amountPaid: new Prisma.Decimal(paid),
          ...(paid >= Number(order.total) - 0.001 ? { status: OrderStatus.PAID } : {}),
        },
      });
    });

    // Only on the transition into PAID, not every settle() call this order
    // will ever see -- a part-payment or a webhook replay must not re-notify.
    if (updated.status === OrderStatus.PAID && order.status !== OrderStatus.PAID) {
      void this.ownerNotification.notifyOrderPaid({
        orderNumber: updated.orderNumber,
        channel: updated.channel,
        customerName: updated.customerName,
        customerPhone: updated.customerPhone,
        customerEmail: updated.customerEmail,
        total: Number(updated.total),
      });
    }

    return { orderNumber: updated.orderNumber, status: updated.status, paid: true };
  }

  /** What the confirmation page shows. Safe to expose: no pricing internals. */
  async lookup(reference: string) {
    const order = await this.prisma.order.findFirst({
      where: { orderNumber: orderNumberFromReference(reference) },
      include: {
        lines: true,
        store: { select: { name: true, location: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    return {
      orderNumber: order.orderNumber,
      status: order.status,
      total: Number(order.total),
      amountPaid: Number(order.amountPaid),
      customerName: order.customerName,
      shippingAddress: order.shippingAddress,
      store: order.store,
      lines: order.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        lineTotal: Number(line.lineTotal),
      })),
    };
  }
}
