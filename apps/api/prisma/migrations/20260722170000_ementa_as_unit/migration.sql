-- Migra ementas de metadados para unidade estruturada e agrupa considerandos no Preâmbulo.

-- 1) Cria unidade "ementa" a partir de normative_acts.ementa quando ainda não existir
INSERT INTO "normative_units" (
  "id",
  "act_id",
  "tipo_unidade",
  "identificacao",
  "texto",
  "ordem",
  "parent_unit_id",
  "status",
  "origem_act_id",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid()::text,
  a."id",
  'ementa'::"UnitType",
  'Ementa',
  a."ementa",
  -1,
  NULL,
  'vigente'::"UnitStatus",
  a."id",
  NOW(),
  NOW()
FROM "normative_acts" a
WHERE TRIM(COALESCE(a."ementa", '')) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM "normative_units" u
    WHERE u."act_id" = a."id"
      AND u."tipo_unidade" = 'ementa'::"UnitType"
  );

INSERT INTO "normative_versions" ("id", "unit_id", "texto", "valido_de", "origem_act_id", "criado_em")
SELECT
  gen_random_uuid()::text,
  u."id",
  u."texto",
  CURRENT_DATE,
  u."act_id",
  NOW()
FROM "normative_units" u
WHERE u."tipo_unidade" = 'ementa'::"UnitType"
  AND u."ordem" = -1
  AND NOT EXISTS (
    SELECT 1 FROM "normative_versions" v WHERE v."unit_id" = u."id"
  );

UPDATE "normative_units" u
SET "ordem" = u."ordem" + 1
WHERE EXISTS (
  SELECT 1
  FROM "normative_units" e
  WHERE e."act_id" = u."act_id"
    AND e."tipo_unidade" = 'ementa'::"UnitType"
    AND e."ordem" = -1
)
AND u."ordem" >= 0;

UPDATE "normative_units"
SET "ordem" = 0
WHERE "tipo_unidade" = 'ementa'::"UnitType"
  AND "ordem" = -1;

-- 2) Converte "considerando" → "preambulo"
UPDATE "normative_units"
SET
  "tipo_unidade" = 'preambulo'::"UnitType",
  "identificacao" = 'Preâmbulo'
WHERE "tipo_unidade" = 'considerando'::"UnitType";

-- 3) Funde múltiplos preâmbulos do mesmo ato em um único elemento (ordem mínima)
DO $$
DECLARE
  act_rec RECORD;
  keep_id TEXT;
  merged TEXT;
  victim RECORD;
BEGIN
  FOR act_rec IN
    SELECT "act_id"
    FROM "normative_units"
    WHERE "tipo_unidade" = 'preambulo'::"UnitType"
    GROUP BY "act_id"
    HAVING COUNT(*) > 1
  LOOP
    SELECT "id" INTO keep_id
    FROM "normative_units"
    WHERE "act_id" = act_rec."act_id"
      AND "tipo_unidade" = 'preambulo'::"UnitType"
    ORDER BY "ordem" ASC
    LIMIT 1;

    SELECT string_agg("texto", E'\n\n' ORDER BY "ordem") INTO merged
    FROM "normative_units"
    WHERE "act_id" = act_rec."act_id"
      AND "tipo_unidade" = 'preambulo'::"UnitType";

    UPDATE "normative_units"
    SET "texto" = merged, "identificacao" = 'Preâmbulo'
    WHERE "id" = keep_id;

    FOR victim IN
      SELECT "id"
      FROM "normative_units"
      WHERE "act_id" = act_rec."act_id"
        AND "tipo_unidade" = 'preambulo'::"UnitType"
        AND "id" <> keep_id
    LOOP
      UPDATE "legislative_effects" SET "target_unit_id" = keep_id WHERE "target_unit_id" = victim."id";
      UPDATE "normative_changes" SET "unit_id" = keep_id WHERE "unit_id" = victim."id";
      DELETE FROM "normative_versions" WHERE "unit_id" = victim."id";
      DELETE FROM "normative_units" WHERE "id" = victim."id";
    END LOOP;
  END LOOP;
END $$;
