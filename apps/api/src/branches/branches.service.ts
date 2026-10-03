import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthUser } from "../common/auth.types";
import { toApiResponse } from "../common/api-response";
import type { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { distanceBetweenMeters } from "./branch-distance";
import { CreateBranchDto, UpdateBranchDto } from "./branches.dto";

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const branches = await this.prisma.branch.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }, { createdAt: "asc" }],
    });
    return toApiResponse(branches);
  }

  create(actor: AuthUser, dto: CreateBranchDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.branch.updateMany({
          where: { isPrimary: true },
          data: { isPrimary: false },
        });
      }
      const branch = await tx.branch.create({
        data: {
          ...dto,
          name: dto.name.trim(),
          address: dto.address.trim(),
          phone: dto.phone?.trim() || null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "branch.created",
          entityType: "Branch",
          entityId: branch.id,
          metadata: { name: branch.name },
        },
      });
      return toApiResponse(branch);
    });
  }

  update(actor: AuthUser, id: string, dto: UpdateBranchDto) {
    return this.prisma.$transaction(async (tx) => {
      const exists = await tx.branch.findUnique({ where: { id } });
      if (!exists) throw new NotFoundException("Branch not found");
      if (dto.isPrimary) {
        await tx.branch.updateMany({
          where: { isPrimary: true, id: { not: id } },
          data: { isPrimary: false },
        });
      }
      const branch = await tx.branch.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.address !== undefined ? { address: dto.address.trim() } : {}),
          ...(dto.phone !== undefined
            ? { phone: dto.phone.trim() || null }
            : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "branch.updated",
          entityType: "Branch",
          entityId: branch.id,
          metadata: { changedFields: Object.keys(dto), before: toApiResponse(exists), after: toApiResponse(branch) },
        },
      });
      return toApiResponse(branch);
    });
  }

  async findNearestActive(
    tx: Prisma.TransactionClient,
    destination: { latitude: number; longitude: number },
    requireValidCoordinates = false,
    cafeId?: string,
  ) {
    const branches = await tx.branch.findMany({
      where: { isActive: true, ...(cafeId ? { cafeId } : {}) },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const [first, ...rest] = branches;
    if (!first) {
      throw new ConflictException("No active branch can accept orders");
    }

    // The primary branch is the intentional, operator-configured fallback.
    // For legacy data without one, the first active branch remains available.
    const fallback = branches.find((branch) => branch.isPrimary) ?? first;
    const safeDistance = (branch: (typeof branches)[number]) => {
      const coordinates = {
        latitude: Number(branch.latitude),
        longitude: Number(branch.longitude),
      };
      if (
        !Number.isFinite(destination.latitude) ||
        !Number.isFinite(destination.longitude) ||
        !Number.isFinite(coordinates.latitude) ||
        !Number.isFinite(coordinates.longitude)
      ) {
        return null;
      }
      try {
        return distanceBetweenMeters(destination, coordinates);
      } catch {
        return null;
      }
    };

    const fallbackDistance = safeDistance(fallback);
    if (fallbackDistance === null) {
      if (requireValidCoordinates) {
        const valid = branches
          .map((branch) => ({ branch, distanceMeters: safeDistance(branch) }))
          .filter((entry): entry is { branch: (typeof branches)[number]; distanceMeters: number } => entry.distanceMeters !== null)
          .sort((left, right) => left.distanceMeters - right.distanceMeters);
        if (!valid[0]) {
          throw new ConflictException("Active branch coordinates are invalid");
        }
        return valid[0];
      }
      // This can only happen with corrupt coordinates. Keep accepting orders
      // through the primary branch rather than dropping the customer order.
      return { branch: fallback, distanceMeters: 0 };
    }
    let nearest = {
      branch: fallback,
      distanceMeters: fallbackDistance,
    };
    for (const branch of [first, ...rest]) {
      const distanceMeters = safeDistance(branch);
      if (distanceMeters === null) continue;
      if (distanceMeters < nearest.distanceMeters) {
        nearest = { branch, distanceMeters };
      }
    }
    return nearest;
  }
}
