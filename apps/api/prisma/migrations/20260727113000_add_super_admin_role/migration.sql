-- SUPER_ADMIN is the owner-level role. Authorization rules grant it every
-- administrative permission while protecting the role from regular admins.
ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';
