-- Why an order was cancelled or refunded.
ALTER TABLE "Order" ADD COLUMN "closeReason" TEXT;
