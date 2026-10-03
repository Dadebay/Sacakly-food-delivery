import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { IS_PUBLIC_KEY } from "./auth.decorators";
import {
  effectiveAdminPages,
  expandedAdminPages,
} from "../users/admin-page-access.policy";

type AccessPayload = {
  sub: string;
  role: string;
  phone: string;
  sid?: string;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const [scheme, token] = String(request.headers.authorization ?? "").split(
      " ",
    );
    if (scheme !== "Bearer" || !token) {
      throw new UnauthorizedException("Bearer access token is required");
    }

    try {
      const payload = await this.jwt.verifyAsync<AccessPayload>(token);
      if (
        typeof payload.sub !== "string" ||
        (payload.sid !== undefined && typeof payload.sid !== "string")
      ) {
        throw new UnauthorizedException("Access token payload is invalid");
      }
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          phone: true,
          role: true,
          isActive: true,
        },
      });
      if (!user?.isActive) {
        throw new UnauthorizedException("Account is inactive");
      }
      if (payload.sid) {
        const session = await this.prisma.refreshToken.findFirst({
          where: {
            id: payload.sid,
            userId: user.id,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          select: { id: true },
        });
        if (!session) {
          throw new UnauthorizedException("Session is revoked or expired");
        }
      }
      const rolePolicy = await this.prisma.adminRolePageAccess.findUnique({
        where: { role: user.role },
        select: { allowedPages: true },
      });
      request.user = {
        id: user.id,
        phone: user.phone,
        role: user.role,
        adminPages: effectiveAdminPages(
          user.role,
          rolePolicy?.allowedPages ?? null,
        ),
        expandedAdminPages: expandedAdminPages(
          user.role,
          rolePolicy?.allowedPages ?? null,
        ),
      };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException("Access token is invalid or expired");
    }
  }
}
