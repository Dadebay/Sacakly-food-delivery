import type { AdminPage, Role } from "../generated/prisma/client";

export type AuthUser = {
  id: string;
  phone: string;
  role: Role;
  adminPages: AdminPage[];
  expandedAdminPages: AdminPage[];
};

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}
