import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { AdminPage, Role } from "../generated/prisma/client";
import { ADMIN_PAGES_KEY, ROLES_KEY } from "./auth.decorators";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const adminPages = this.reflector.getAllAndMerge<AdminPage[]>(
      ADMIN_PAGES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles?.length && !adminPages?.length) return true;

    const user = context.switchToHttp().getRequest<Request>().user;
    if (user?.role === Role.SUPER_ADMIN) return true;
    if (!user) {
      throw new ForbiddenException("Your role cannot perform this action");
    }
    if (adminPages?.length) {
      if (user.role === Role.CUSTOMER && roles?.includes(user.role)) return true;
      if (!adminPages.some((page) => user.adminPages.includes(page))) {
        throw new ForbiddenException("This admin page is not assigned to you");
      }
      if (roles?.includes(user.role)) return true;
      if (
        adminPages.some((page) => user.expandedAdminPages.includes(page))
      ) {
        return true;
      }
    }
    if (roles?.includes(user.role)) return true;
    throw new ForbiddenException("Your role cannot perform this action");
  }
}
