import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import type { AuthUser } from "../common/auth.types";
import { LoginAttemptStatus, Prisma, Role } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateStaffDto,
  LoginAttemptsQueryDto,
  UpdateStaffDto,
} from "./users.dto";
import { toApiResponse } from "../common/api-response";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException("User not found");
    return toApiResponse(user);
  }

  list(role?: Role) {
    return this.prisma.user.findMany({
      where: {
        ...(role ? { role } : { role: { not: Role.CUSTOMER } }),
      },
      select: {
        id: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
        _count: { select: { courierOrders: true, cookedOrders: true } },
      },
      orderBy: [{ role: "asc" }, { firstName: "asc" }],
    });
  }

  couriers() {
    return this.prisma.user.findMany({
      where: { role: Role.COURIER, isActive: true },
      select: {
        id: true,
        phone: true,
        firstName: true,
        lastName: true,
        courierOrders: {
          where: {
            status: {
              in: ["ASSIGNED_TO_COURIER", "OUT_FOR_DELIVERY"],
            },
          },
          select: { id: true, number: true, status: true },
        },
      },
      orderBy: { firstName: "asc" },
    });
  }

  recentLogins() {
    return this.prisma.user.findMany({
      where: { lastLoginAt: { not: null } },
      select: {
        id: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        lastLoginAt: true,
      },
      orderBy: { lastLoginAt: "desc" },
      take: 50,
    });
  }

  async customerCounts() {
    const [registered, assistedOnly] = await this.prisma.$transaction([
      this.prisma.user.count({
        where: { role: Role.CUSTOMER, lastLoginAt: { not: null } },
      }),
      this.prisma.user.count({
        where: { role: Role.CUSTOMER, lastLoginAt: null },
      }),
    ]);
    return {
      registered,
      assistedOnly,
      totalCustomerAccounts: registered + assistedOnly,
    };
  }

  async loginAttempts(query: LoginAttemptsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const where: Prisma.LoginAttemptWhereInput = {
      ...(query.phone ? { phone: { contains: query.phone } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.platform ? { platform: query.platform } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [items, total, verified, failed, requestedOrExpired] =
      await this.prisma.$transaction([
        this.prisma.loginAttempt.findMany({
          where,
          include: {
            user: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.loginAttempt.count({ where }),
        this.prisma.loginAttempt.count({
          where: { ...where, status: LoginAttemptStatus.VERIFIED },
        }),
        this.prisma.loginAttempt.count({
          where: { ...where, status: LoginAttemptStatus.FAILED },
        }),
        this.prisma.loginAttempt.count({
          where: {
            ...where,
            status: {
              in: [LoginAttemptStatus.REQUESTED, LoginAttemptStatus.EXPIRED],
            },
          },
        }),
      ]);
    return {
      items,
      page,
      limit,
      total,
      summary: { total, verified, failed, requestedOrExpired },
    };
  }

  async create(actor: AuthUser, dto: CreateStaffDto) {
    if (dto.role === Role.CUSTOMER) {
      throw new BadRequestException("Staff role cannot be CUSTOMER");
    }
    if (dto.role === Role.SUPER_ADMIN && actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException(
        "Only a super administrator can grant the SUPER_ADMIN role",
      );
    }
    const phone = this.normalizePhone(dto.phone);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { phone } });
      if (existing && existing.role !== Role.CUSTOMER) {
        throw new ConflictException("A staff member with this phone exists");
      }
      const user = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: {
              role: dto.role,
              firstName: dto.firstName,
              lastName: dto.lastName,
              isActive: true,
            },
          })
        : await tx.user.create({
            data: {
              phone,
              role: dto.role,
              firstName: dto.firstName,
              lastName: dto.lastName,
            },
          });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "staff.created",
          entityType: "User",
          entityId: user.id,
          metadata: { phone: user.phone, role: user.role },
        },
      });
      return user;
    });
  }

  async update(actor: AuthUser, id: string, dto: UpdateStaffDto) {
    if (dto.role === Role.CUSTOMER) {
      throw new BadRequestException("Staff role cannot be CUSTOMER");
    }
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id } });
      if (!target) throw new NotFoundException("Staff member not found");

      const touchesSuperAdmin =
        target.role === Role.SUPER_ADMIN || dto.role === Role.SUPER_ADMIN;
      if (touchesSuperAdmin && actor.role !== Role.SUPER_ADMIN) {
        throw new ForbiddenException(
          "Only a super administrator can manage the SUPER_ADMIN role",
        );
      }

      const removesActiveSuperAdmin =
        target.role === Role.SUPER_ADMIN &&
        target.isActive &&
        (dto.role !== Role.SUPER_ADMIN || dto.isActive === false);
      if (removesActiveSuperAdmin) {
        const activeSuperAdmins = await tx.user.count({
          where: { role: Role.SUPER_ADMIN, isActive: true },
        });
        if (activeSuperAdmins <= 1) {
          throw new BadRequestException(
            "At least one active super administrator is required",
          );
        }
      }

      const updated = await tx.user.update({ where: { id }, data: dto });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "staff.updated",
          entityType: "User",
          entityId: updated.id,
          metadata: {
            before: { firstName: target.firstName, lastName: target.lastName, phone: target.phone, role: target.role, isActive: target.isActive },
            after: { firstName: updated.firstName, lastName: updated.lastName, phone: updated.phone, role: updated.role, isActive: updated.isActive },
            previousRole: target.role,
            role: updated.role,
            previousIsActive: target.isActive,
            isActive: updated.isActive,
          },
        },
      });
      return updated;
    });
  }

  private normalizePhone(value: string) {
    const parsed = parsePhoneNumberFromString(value, "TM");
    if (!parsed?.isValid()) {
      throw new BadRequestException("Phone number is invalid");
    }
    return parsed.number;
  }
}
