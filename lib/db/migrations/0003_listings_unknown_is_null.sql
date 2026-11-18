-- Unknown is NULL, never invented: market_value had to restate the asking price and
-- sleeps defaulted to 2 when the dealer did not publish it. Existing rows are left as-is;
-- re-seed or re-import to replace old placeholder values. Idempotent.
ALTER TABLE "listings" ALTER COLUMN "market_value" DROP NOT NULL;
ALTER TABLE "listings" ALTER COLUMN "sleeps" DROP NOT NULL;
ALTER TABLE "listings" ALTER COLUMN "sleeps" DROP DEFAULT;
