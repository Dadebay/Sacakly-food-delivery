import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import type { AuthUser } from "../common/auth.types";
import { AdminPage, Prisma, Role } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { UpdateAdminPageAccessDto } from "./admin-page-access.dto";
import {
  ADMIN_PAGES,
  ADMIN_PAGE_ACCESS_MATRIX_ROLES,
  availableAdminPages,
  effectiveAdminPages,
  expandedAdminPages,
  isConfigurableAdminPageRole,
} from "./admin-page-access.policy";

@Injectable()
export class AdminPageAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async mine(role: Role) {
    const policy = await this.prisma.adminRolePageAccess.findUnique({
      where: { role },
    });
    return this.toResponse(
      role,
      policy?.allowedPages ?? null,
      policy?.version ?? 0,
    );
  }

  async matrix() {
    const policies = await this.prisma.adminRolePageAccess.findMany({
      where: { role: { in: [...ADMIN_PAGE_ACCESS_MATRIX_ROLES] } },
    });
    const byRole = new Map(policies.map((policy) => [policy.role, policy]));
    return {
      roles: ADMIN_PAGE_ACCESS_MATRIX_ROLES.map((role) => {
        const policy = byRole.get(role);
        return this.toResponse(
          role,
          policy?.allowedPages ?? null,
          policy?.version ?? 0,
        );
      }),
    };
  }

  async update(actor: AuthUser, role: Role, dto: UpdateAdminPageAccessDto) {
    if (!isConfigurableAdminPageRole(role)) {
      throw new BadRequestException(
        "Page access can be configured only for staff web roles",
      );
    }

    const normalized = ADMIN_PAGES.filter((page) =>
      dto.allowedPages.includes(page),
    );

    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.adminRolePageAccess.findUnique({
          where: { role },
        });
        const currentVersion = current?.version ?? 0;
        if (currentVersion !== dto.version) {
          throw new ConflictException(
            "Page access changed in another session. Reload and try again",
          );
        }

        const saved = current
          ? await this.updateExisting(tx, role, normalized, currentVersion)
          : await tx.adminRolePageAccess.create({
              data: { role, allowedPages: normalized, version: 1 },
            });

        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "admin_role_page_access.updated",
            entityType: "AdminRolePageAccess",
            entityId: role,
            metadata: {
              previousAllowedPages: effectiveAdminPages(
                role,
                current?.allowedPages ?? null,
              ),
              allowedPages: normalized,
              previousVersion: currentVersion,
              version: saved.version,
            },
          },
        });

        return this.toResponse(role, saved.allowedPages, saved.version);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException(
          "Page access changed in another session. Reload and try again",
        );
      }
      throw error;
    }
  }

  private async updateExisting(
    tx: Prisma.TransactionClient,
    role: Role,
    allowedPages: AdminPage[],
    version: number,
  ) {
    const updated = await tx.adminRolePageAccess.updateMany({
      where: { role, version },
      data: { allowedPages, version: { increment: 1 } },
    });
    if (updated.count !== 1) {
      throw new ConflictException(
        "Page access changed in another session. Reload and try again",
      );
    }
    return tx.adminRolePageAccess.findUniqueOrThrow({ where: { role } });
  }

  private toResponse(
    role: Role,
    storedPages: readonly AdminPage[] | null,
    version: number,
  ) {
    return {
      role,
      allowedPages: effectiveAdminPages(role, storedPages),
      availablePages: availableAdminPages(role),
      expandedPages: expandedAdminPages(role, storedPages),
      editable: isConfigurableAdminPageRole(role),
      version,
    };
  }
}
