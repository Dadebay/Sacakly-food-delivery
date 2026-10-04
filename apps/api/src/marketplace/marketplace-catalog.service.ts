import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthUser } from "../common/auth.types";
import { Prisma, Role } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { assertCafeMember, assertModuleEnabled } from "./marketplace-policy";
import {
  CreateCafeBranchDto, CreateCafeCategoryDto, CreateCafeProductDto,
  UpdateCafeBranchDto, UpdateCafeCategoryDto, UpdateCafeProductDto,
} from "./marketplace-catalog.dto";

function rethrowCatalogConflict(error: unknown): never {
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
    throw new ConflictException("Catalog slug is already in use");
  }
  throw error;
}

@Injectable()
export class MarketplaceCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertManager(tx: Prisma.TransactionClient, actor: AuthUser, cafeId: string) {
    const [membership, module, cafe] = await Promise.all([
      tx.cafeMembership.findUnique({ where: { cafeId_userId: { cafeId, userId: actor.id } } }),
      tx.cafeModuleEntitlement.findUnique({ where: { cafeId_key: { cafeId, key: "ORDERING" } } }),
      tx.cafe.findUnique({ where: { id: cafeId }, select: { id: true, isActive: true } }),
    ]);
    assertCafeMember(actor.id, cafeId, membership, [Role.ADMIN, Role.OPERATOR]);
    assertModuleEnabled(module, cafeId);
    if (!cafe?.isActive) throw new NotFoundException("Active cafe not found");
  }

  async catalog(actor: AuthUser, cafeId: string) {
    await this.assertManager(this.prisma, actor, cafeId);
    const [categories, branches] = await Promise.all([
      this.prisma.category.findMany({
        where: { cafeId },
        select: { id: true, cafeId: true, name: true, slug: true, sortOrder: true, isActive: true, version: true,
          products: { select: { id: true, categoryId: true, name: true, slug: true, description: true, price: true, preparationMinutes: true, sortOrder: true, isActive: true, version: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      this.prisma.branch.findMany({
        where: { cafeId },
        select: { id: true, cafeId: true, name: true, address: true, latitude: true, longitude: true, phone: true, isActive: true, version: true },
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
      }),
    ]);
    return { categories, branches };
  }

  async createCategory(actor: AuthUser, cafeId: string, dto: CreateCafeCategoryDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertManager(tx, actor, cafeId);
      const category = await tx.category.create({ data: { cafeId, name: dto.name.trim(), slug: `${cafeId}-${dto.slug}`, sortOrder: dto.sortOrder ?? 0 } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "marketplace.catalog.category.created", entityType: "Category", entityId: category.id, metadata: { cafeId } } });
      return category;
    }).catch(rethrowCatalogConflict);
  }

  async updateCategory(actor: AuthUser, cafeId: string, id: string, dto: UpdateCafeCategoryDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertManager(tx, actor, cafeId);
      const before = await tx.category.findFirst({ where: { id, cafeId } });
      if (!before) throw new NotFoundException("Category not found in this cafe");
      if (before.version !== dto.expectedVersion) throw new ConflictException("Category version changed");
      const changed = await tx.category.updateMany({ where: { id, cafeId, version: dto.expectedVersion }, data: {
        ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
        ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
        ...(dto.sortOrder === undefined ? {} : { sortOrder: dto.sortOrder }),
        version: { increment: 1 },
      } });
      if (changed.count !== 1) throw new ConflictException("Category changed");
      await tx.auditLog.create({ data: { actorId: actor.id, action: "marketplace.catalog.category.updated", entityType: "Category", entityId: id, metadata: { cafeId, beforeVersion: before.version, afterVersion: before.version + 1 } } });
      return tx.category.findUniqueOrThrow({ where: { id } });
    });
  }

  async createProduct(actor: AuthUser, cafeId: string, dto: CreateCafeProductDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertManager(tx, actor, cafeId);
      const category = await tx.category.findFirst({ where: { id: dto.categoryId, cafeId } });
      if (!category) throw new NotFoundException("Category not found in this cafe");
      const product = await tx.product.create({ data: { categoryId: dto.categoryId, name: dto.name.trim(), slug: `${cafeId}-${dto.slug}`, description: dto.description.trim(), price: dto.price, preparationMinutes: dto.preparationMinutes, sortOrder: dto.sortOrder ?? 0 } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "marketplace.catalog.product.created", entityType: "Product", entityId: product.id, metadata: { cafeId, categoryId: dto.categoryId } } });
      return product;
    }).catch(rethrowCatalogConflict);
  }

  async updateProduct(actor: AuthUser, cafeId: string, id: string, dto: UpdateCafeProductDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertManager(tx, actor, cafeId);
      const before = await tx.product.findFirst({ where: { id, category: { cafeId } } });
      if (!before) throw new NotFoundException("Product not found in this cafe");
      if (before.version !== dto.expectedVersion) throw new ConflictException("Product version changed");
      if (dto.categoryId) {
        const category = await tx.category.findFirst({ where: { id: dto.categoryId, cafeId } });
        if (!category) throw new NotFoundException("Category not found in this cafe");
      }
      const changed = await tx.product.updateMany({ where: { id, version: dto.expectedVersion, category: { cafeId } }, data: {
        ...(dto.categoryId === undefined ? {} : { categoryId: dto.categoryId }),
        ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
        ...(dto.description === undefined ? {} : { description: dto.description.trim() }),
        ...(dto.price === undefined ? {} : { price: dto.price }),
        ...(dto.preparationMinutes === undefined ? {} : { preparationMinutes: dto.preparationMinutes }),
        ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
        ...(dto.sortOrder === undefined ? {} : { sortOrder: dto.sortOrder }),
        version: { increment: 1 },
      } });
      if (changed.count !== 1) throw new ConflictException("Product changed");
      await tx.auditLog.create({ data: { actorId: actor.id, action: "marketplace.catalog.product.updated", entityType: "Product", entityId: id, metadata: { cafeId, beforeVersion: before.version, afterVersion: before.version + 1 } } });
      return tx.product.findUniqueOrThrow({ where: { id } });
    });
  }

  async createBranch(actor: AuthUser, cafeId: string, dto: CreateCafeBranchDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertManager(tx, actor, cafeId);
      const branch = await tx.branch.create({ data: { cafeId, name: dto.name.trim(), address: dto.address.trim(), latitude: dto.latitude, longitude: dto.longitude, phone: dto.phone?.trim() || null } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "marketplace.catalog.branch.created", entityType: "Branch", entityId: branch.id, metadata: { cafeId } } });
      return branch;
    });
  }

  async updateBranch(actor: AuthUser, cafeId: string, id: string, dto: UpdateCafeBranchDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertManager(tx, actor, cafeId);
      const before = await tx.branch.findFirst({ where: { id, cafeId } });
      if (!before) throw new NotFoundException("Branch not found in this cafe");
      if (before.version !== dto.expectedVersion) throw new ConflictException("Branch version changed");
      const changed = await tx.branch.updateMany({ where: { id, cafeId, version: dto.expectedVersion }, data: {
        ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
        ...(dto.address === undefined ? {} : { address: dto.address.trim() }),
        ...(dto.latitude === undefined ? {} : { latitude: dto.latitude }),
        ...(dto.longitude === undefined ? {} : { longitude: dto.longitude }),
        ...(dto.phone === undefined ? {} : { phone: dto.phone.trim() || null }),
        ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
        version: { increment: 1 },
      } });
      if (changed.count !== 1) throw new ConflictException("Branch changed");
      await tx.auditLog.create({ data: { actorId: actor.id, action: "marketplace.catalog.branch.updated", entityType: "Branch", entityId: id, metadata: { cafeId, beforeVersion: before.version, afterVersion: before.version + 1 } } });
      return tx.branch.findUniqueOrThrow({ where: { id } });
    });
  }
}
