-- UserRole / UserOriginOrg (itens 75–76)

CREATE TABLE "user_roles" (
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

CREATE TABLE "user_origin_orgs" (
    "user_id" TEXT NOT NULL,
    "orgao_id" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_origin_orgs_pkey" PRIMARY KEY ("user_id","orgao_id")
);

ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_origin_orgs" ADD CONSTRAINT "user_origin_orgs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_origin_orgs" ADD CONSTRAINT "user_origin_orgs_orgao_id_fkey"
    FOREIGN KEY ("orgao_id") REFERENCES "origin_orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migra perfil único existente → vínculo principal
INSERT INTO "user_roles" ("user_id", "role_id", "is_primary")
SELECT "id", "role_id", true FROM "users";

-- Permissão para alternar contexto entre todos os órgãos
INSERT INTO "permissions" ("id", "chave")
SELECT gen_random_uuid()::text, 'orgs:all'
WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "chave" = 'orgs:all');

-- Concede orgs:all ao admin_geral (se existir)
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."nome" = 'admin_geral'
  AND p."chave" = 'orgs:all'
ON CONFLICT DO NOTHING;
