# Telling Nairobi Gents about new products

When a product or size is created or changed here, the backend tells the shops-platform storefront that follows this
catalogue (nairobigents.com) to look again, so a new product appears there within seconds.

- Code: `backend/src/catalogue-sync/catalogue-sync.service.ts`, called from `ProductService` (create, update,
  duplicate, add or update a size) and the product data import.
- The call is a signed `POST` with no product data. It is debounced (4 s of quiet, never more than 20 s), retried
  twice on a network or 5xx failure, and never blocks or fails the save that triggered it.
- Off until `CATALOGUE_SYNC_URL` and `CATALOGUE_SYNC_SECRET` are both set in the backend's environment.
- What the other side does with it, the rules it follows, and the one-time setup are in shops-platform's
  `docs/DRIP-SYNC.md`.
