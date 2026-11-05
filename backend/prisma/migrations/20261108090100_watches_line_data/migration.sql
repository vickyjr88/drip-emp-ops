-- Watches get their own line, like kits. This is a separate migration from the one that adds the enum value because
-- PostgreSQL does not let a value added in a transaction be used in the same transaction.

-- 1. A watch has no size: drop any size-like attribute from the Watches category (and its sub-categories), so the catalogue
--    never asks for one. Existing variants keep whatever attributes they had; nothing reads them for a watch.
DELETE FROM "CategoryAttribute"
WHERE "categoryId" IN (
  SELECT c.id FROM "ProductCategory" c
  LEFT JOIN "ProductCategory" p ON p.id = c."parentId"
  WHERE c.slug = 'watches' OR p.slug = 'watches'
);

-- 2. Move the watches already in the shop into their own line.
UPDATE "Product" SET "line" = 'WATCH'
WHERE "line" = 'SHOP'
  AND "categoryId" IN (
    SELECT c.id FROM "ProductCategory" c
    LEFT JOIN "ProductCategory" p ON p.id = c."parentId"
    WHERE c.slug = 'watches' OR p.slug = 'watches'
  );

-- 3. Keep it that way for every code path (the portal, imports, scripts): a product in the Watches category is a watch,
--    and one that is not is a shoe-shop product. Kits are never touched. This is what guarantees a watch cannot appear in
--    the shoe feed because someone created it by a route that forgot to say so.
CREATE OR REPLACE FUNCTION product_line_by_category() RETURNS trigger AS $$
BEGIN
  IF NEW."line" = 'KIT' THEN
    RETURN NEW;
  END IF;
  IF NEW."categoryId" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "ProductCategory" c
    LEFT JOIN "ProductCategory" p ON p.id = c."parentId"
    WHERE c.id = NEW."categoryId" AND (c.slug = 'watches' OR p.slug = 'watches')
  ) THEN
    NEW."line" := 'WATCH';
  ELSE
    NEW."line" := 'SHOP';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Product_line_by_category" ON "Product";
CREATE TRIGGER "Product_line_by_category"
  BEFORE INSERT OR UPDATE OF "categoryId" ON "Product"
  FOR EACH ROW EXECUTE FUNCTION product_line_by_category();
