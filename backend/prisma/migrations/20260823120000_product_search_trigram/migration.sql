-- Typo tolerance for storefront search.
--
-- Search was a case-insensitive LIKE on name and brand, so "smaba" found
-- nothing and a shopper watching results appear as they type saw the query
-- fail live. pg_trgm scores how much two strings share, which catches a
-- transposed pair without needing a spellcheck dictionary.
--
-- The extension ships with the postgres image; it is simply not enabled by
-- default. IF NOT EXISTS so a database where it was enabled by hand still
-- migrates.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN rather than GiST: reads dominate here by a wide margin, and GIN answers
-- similarity queries faster at the cost of slower writes, which only happen
-- when a product is edited.
CREATE INDEX IF NOT EXISTS "Product_name_trgm_idx"
  ON "Product" USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Product_brand_trgm_idx"
  ON "Product" USING gin (brand gin_trgm_ops);
