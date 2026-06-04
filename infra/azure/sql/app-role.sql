-- Least-privilege application role for project50.
--
-- The running app connects as `p50app` (NOT the Postgres admin). p50app can
-- read/write rows in the public schema but cannot create/drop objects, manage
-- roles, or act as superuser. Migrations (`prisma migrate deploy`) still run as
-- the admin, which OWNS the tables; the ALTER DEFAULT PRIVILEGES below makes
-- every future migration-created table readable/writable by p50app automatically.
--
-- Idempotent — safe to re-run. Run as the admin, passing the password:
--   psql "<admin database-url-admin>" -v ON_ERROR_STOP=1 -v pw="<app_db_password>" -f app-role.sql
-- (the postgresql Terraform provider can't reach the firewalled Azure DB at
--  plan-time, so this bootstrap is run by the deployer alongside migrations.)

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'p50app') THEN
    CREATE ROLE p50app LOGIN;
  END IF;
END $$;

ALTER ROLE p50app LOGIN PASSWORD :'pw';

GRANT CONNECT ON DATABASE project50 TO p50app;
GRANT USAGE ON SCHEMA public TO p50app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO p50app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO p50app;

-- Future tables/sequences created by the admin (via migrations) → auto-grant.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO p50app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO p50app;
