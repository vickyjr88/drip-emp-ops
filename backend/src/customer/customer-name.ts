/**
 * What to call a customer.
 *
 * A trade account is a shop, so its business name is what appears on
 * consignment paperwork and in the reports; a walk-in is a person. Falling back
 * to the personal name means a trade customer with no business name recorded
 * still reads as something rather than blank.
 */
export function customerDisplayName(customer: {
  businessName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  const business = customer.businessName?.trim();
  if (business) return business;
  return [customer.firstName, customer.lastName]
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(' ');
}
