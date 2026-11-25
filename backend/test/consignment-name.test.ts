import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma } from '@prisma/client';
import { ConsignmentService } from '../src/consignment/consignment.service';

/** The pickups list and its CSV name who has the stock; the customer record only holds the pieces, so the service puts the name together. */
const service = new ConsignmentService(null as any, null as any);
const row = (customer: { businessName: string | null; firstName: string; lastName: string }) => ({
  status: 'OPEN', dueDate: null, soldValue: new Prisma.Decimal(0), amountPaid: new Prisma.Decimal(0),
  customer, lines: [{ quantityOut: 3, quantitySold: 1, quantityReturned: 0 }],
});

test('a trade customer is named by the business, a person by their own name', () => {
  const trade = (service as any).decorate(row({ businessName: 'Otieno Footwear', firstName: 'Brian', lastName: 'Otieno' }));
  assert.equal(trade.customer.name, 'Otieno Footwear');
  const person = (service as any).decorate(row({ businessName: null, firstName: 'Wanjiku', lastName: 'Kamau' }));
  assert.equal(person.customer.name, 'Wanjiku Kamau');
  assert.equal(person.unitsStillOut, 2);
});
