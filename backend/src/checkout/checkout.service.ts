import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { SalesPostingService } from '../sales-posting/sales-posting.service';
import { PaystackService } from '../paystack/paystack.service';
import { CheckoutDto, CustomerSignupDto } from './dto/checkout.dto';

/** Free delivery over this, as advertised on the storefront. */
const FREE_DELIVERY_OVER = 15000;
const DELIVERY_FEE = 500;

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly posting: SalesPostingService,
    private readonly paystack: PaystackService,
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
        return tx.customer.update({
          where: { id: existing.id },
          data: {
            portalPassword: await bcrypt.hash(details.password!, 10),
            portalEnabled: true,
            phone: details.phone || existing.phone,
          },
        });
      }
      return existing;
    }

    return tx.customer.create({
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
    const year = new Date().getFullYear();
    const count = await tx.order.count({ where: { orderNumber: { startsWith: `DE-${year}-` } } });
    return `DE-${year}-${String(count + 1).padStart(5, '0')}`;
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

    const { order, customer } = await this.prisma.$transaction(async (tx) => {
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

      const lines = dto.lines.map((line) => {
        const variant = byId.get(line.variantId);
        if (!variant) throw new NotFoundException(`That item is no longer available.`);
        const unitPrice = Number(variant.priceKes);
        return {
          variantId: variant.id,
          description: `${variant.product.name} — ${variant.name}`,
          quantity: line.quantity,
          unitPrice: new Prisma.Decimal(unitPrice),
          listPrice: new Prisma.Decimal(unitPrice),
          discount: new Prisma.Decimal(0),
          lineTotal: new Prisma.Decimal(unitPrice * line.quantity),
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

      for (const line of dto.lines) {
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
    });

    // Paystack is called outside the transaction: an external call inside one
    // holds a database lock for as long as the network takes.
    const init = await this.paystack.initialise({
      email: customer.email,
      amountKes: Number(order.total),
      reference: order.orderNumber,
      callbackUrl: `${origin}/checkout/complete?ref=${order.orderNumber}`,
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

    const order = await this.prisma.order.findFirst({
      where: { orderNumber: reference },
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

    return { orderNumber: updated.orderNumber, status: updated.status, paid: true };
  }

  /** What the confirmation page shows. Safe to expose: no pricing internals. */
  async lookup(reference: string) {
    const order = await this.prisma.order.findFirst({
      where: { orderNumber: reference },
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
