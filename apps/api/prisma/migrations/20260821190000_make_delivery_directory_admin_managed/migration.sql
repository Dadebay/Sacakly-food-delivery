-- Future welayats and etraps are created from the protected admin API. The
-- imported numeric identifiers remain stable while PostgreSQL allocates every
-- newly-created identifier safely under concurrent requests.
CREATE SEQUENCE "Welayat_id_seq" AS INTEGER;
SELECT setval(
    '"Welayat_id_seq"',
    COALESCE((SELECT MAX("id") FROM "Welayat"), 0) + 1,
    false
);
ALTER SEQUENCE "Welayat_id_seq" OWNED BY "Welayat"."id";
ALTER TABLE "Welayat"
    ALTER COLUMN "id" SET DEFAULT nextval('"Welayat_id_seq"');

CREATE SEQUENCE "Etrap_id_seq" AS INTEGER;
SELECT setval(
    '"Etrap_id_seq"',
    COALESCE((SELECT MAX("id") FROM "Etrap"), 0) + 1,
    false
);
ALTER SEQUENCE "Etrap_id_seq" OWNED BY "Etrap"."id";
ALTER TABLE "Etrap"
    ALTER COLUMN "id" SET DEFAULT nextval('"Etrap_id_seq"');
