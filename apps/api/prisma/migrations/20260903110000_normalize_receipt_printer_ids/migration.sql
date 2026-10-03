-- Earlier receipt-printer imports cast raw MD5 hashes directly to PostgreSQL
-- UUID values. PostgreSQL accepts those values, but HTTP and form validators
-- correctly reject UUIDs whose version and variant bits are not RFC 9562
-- compliant. Replace every legacy printer identifier with a generated v4 UUID;
-- the catalog foreign keys use ON UPDATE CASCADE and retain their assignments.
UPDATE "ReceiptPrinter"
SET "id" = gen_random_uuid()
WHERE "id"::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
