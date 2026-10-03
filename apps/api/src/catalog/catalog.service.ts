import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { toApiResponse } from "../common/api-response";
import type { AuthUser } from "../common/auth.types";
import { Prisma, ProductPricingType } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  AddProductImageDto,
  CreateCafeDto,
  CreateCategoryDto,
  CreateProductDto,
  CreateReceiptPrinterDto,
  ListAdminCatalogProductsQueryDto,
  ListCatalogProductsQueryDto,
  ProductVariantInputDto,
  UpdateCafeDto,
  UpdateCategoryDto,
  UpdateProductDto,
  UpdateReceiptPrinterDto,
  UpdateReceiptPrintSettingsDto,
} from "./catalog.dto";
import { availableCatalogSlug, catalogSlug } from "./catalog-slug";
import { DEFAULT_CAFE_ID } from "./catalog.constants";

const MAX_PRODUCT_IMAGES = 10;
const orderablePricingWhere = {
  OR: [
    { pricingType: ProductPricingType.FIXED },
    {
      pricingType: ProductPricingType.VARIANT,
      variants: { some: { isActive: true } },
    },
  ],
} satisfies Prisma.ProductWhereInput;
const productRelations = {
  images: { orderBy: { sortOrder: "asc" as const } },
  variants: {
    include: { images: { orderBy: { sortOrder: "asc" as const } } },
    orderBy: [{ sortOrder: "asc" as const }, { name: "asc" as const }],
  },
  category: { include: { cafe: true, receiptPrinter: true } },
  receiptPrinter: true,
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Prisma.ProductGetPayload<{
  include: typeof productRelations;
}>;

function categoryResponse<
  TCategory extends {
    receiptPrinterId: string | null;
    receiptPrinterIp: string | null;
    receiptPrinter?: {
      id: string;
      ipAddress: string;
    } | null;
  },
>(category: TCategory, includeAdminFields: boolean) {
  const {
    receiptPrinterId,
    receiptPrinterIp: legacyReceiptPrinterIp,
    receiptPrinter = null,
    ...publicCategory
  } = category;
  const receiptPrinterIp = receiptPrinter?.ipAddress ?? legacyReceiptPrinterIp;
  return {
    ...publicCategory,
    ...(includeAdminFields
      ? { receiptPrinterId, receiptPrinterIp, receiptPrinter }
      : {}),
  };
}

function activeVariants(product: ProductWithRelations) {
  return product.variants
    .filter(({ isActive }) => isActive)
    .sort(
      (left, right) =>
        Number(left.price) - Number(right.price) ||
        left.sortOrder - right.sortOrder ||
        left.name.localeCompare(right.name),
    );
}

function productResponse(
  product: ProductWithRelations,
  includeAdminFields: boolean,
) {
  const {
    receiptPrinterId,
    receiptPrinterIp: legacyReceiptPrinterIp,
    receiptPrinter,
    category,
    ...publicProduct
  } = product;
  const categoryReceiptPrinterIp =
    category.receiptPrinter?.ipAddress ?? category.receiptPrinterIp;
  const receiptPrinterIp = receiptPrinter?.ipAddress ?? legacyReceiptPrinterIp;
  const effectiveReceiptPrinter =
    receiptPrinter ??
    (legacyReceiptPrinterIp ? null : (category.receiptPrinter ?? null));
  const active = activeVariants(product);
  const hasVariants = product.pricingType === ProductPricingType.VARIANT;
  const minPrice = hasVariants
    ? (active[0]?.price ?? product.price)
    : product.price;
  const displayImageUrl =
    active[0]?.images[0]?.url ?? product.images[0]?.url ?? null;
  return toApiResponse({
    ...publicProduct,
    ...(includeAdminFields
      ? {
          receiptPrinterId,
          receiptPrinterIp,
          receiptPrinter,
          effectiveReceiptPrinterId:
            receiptPrinterId ??
            (legacyReceiptPrinterIp ? null : category.receiptPrinterId),
          effectiveReceiptPrinterIp:
            receiptPrinterIp ?? categoryReceiptPrinterIp,
          effectiveReceiptPrinter,
        }
      : {}),
    category: categoryResponse(category, false),
    price: minPrice,
    minPrice,
    hasVariants,
    displayImageUrl,
    variants: includeAdminFields
      ? product.variants
      : product.variants.filter(({ isActive }) => isActive),
  });
}

function normalizedVariantLabel(value: string | undefined | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function validateVariantInputs(
  variants: ProductVariantInputDto[],
  options: { allowIds: boolean; variantLabel: string | null },
) {
  if (!variants.length) return;
  if (!options.variantLabel) {
    throw new BadRequestException(
      "variantLabel is required when product variants are configured",
    );
  }
  if (!options.allowIds && variants.some(({ id }) => id)) {
    throw new BadRequestException(
      "Variant IDs are not accepted when creating a product",
    );
  }
  const ids = variants.flatMap(({ id }) => (id ? [id] : []));
  if (new Set(ids).size !== ids.length) {
    throw new BadRequestException("Variant IDs must be unique");
  }
  const names = variants.map(({ name }) => name.trim().toLocaleLowerCase());
  if (names.some((name) => !name) || new Set(names).size !== names.length) {
    throw new BadRequestException("Variant names must be non-empty and unique");
  }
}

function variantCreateData(variant: ProductVariantInputDto) {
  return {
    name: variant.name.trim(),
    description: variant.description?.trim() || null,
    price: variant.price,
    isActive: variant.isActive ?? true,
    sortOrder: variant.sortOrder ?? 0,
    images: {
      create: (variant.imageUrls ?? []).map((url, index) => ({
        url,
        sortOrder: index,
      })),
    },
  };
}

function rethrowDeleteConstraint(error: unknown, message: string): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2003"
  ) {
    throw new ConflictException(message);
  }
  throw error;
}

function printerReferenceData(input: {
  receiptPrinterId?: string | null;
  receiptPrinterIp?: string | null;
}) {
  if (
    input.receiptPrinterId !== undefined &&
    input.receiptPrinterIp !== undefined
  ) {
    throw new BadRequestException(
      "Provide receiptPrinterId or receiptPrinterIp, not both",
    );
  }
  if (input.receiptPrinterId !== undefined) {
    return {
      receiptPrinterId: input.receiptPrinterId,
      receiptPrinterIp: null,
    };
  }
  if (input.receiptPrinterIp !== undefined) {
    return {
      receiptPrinterId: null,
      receiptPrinterIp: input.receiptPrinterIp,
    };
  }
  return {};
}

async function assertActivePrinterReference(
  tx: Prisma.TransactionClient,
  printerId: string | null | undefined,
) {
  if (!printerId) return;
  const printer = await tx.receiptPrinter.findUnique({
    where: { id: printerId },
    select: { isActive: true },
  });
  if (!printer?.isActive) {
    throw new BadRequestException("Receipt printer is missing or inactive");
  }
}

async function assertCafeReference(
  tx: Prisma.TransactionClient,
  cafeId: string,
) {
  const cafe = await tx.cafe.findUnique({
    where: { id: cafeId },
    select: { id: true },
  });
  if (!cafe) throw new BadRequestException("Cafe is missing");
}

function mainPrinterReferenceData(input: UpdateReceiptPrintSettingsDto) {
  if (
    input.mainPrinterId === undefined &&
    input.mainPrinterIp === undefined &&
    input.mainCopies === undefined
  ) {
    throw new BadRequestException(
      "mainPrinterId or mainPrinterIp must be provided",
    );
  }
  if (input.mainPrinterId !== undefined && input.mainPrinterIp !== undefined) {
    throw new BadRequestException(
      "Provide mainPrinterId or mainPrinterIp, not both",
    );
  }
  if (input.mainPrinterId === undefined && input.mainPrinterIp === undefined)
    return {};
  return input.mainPrinterId !== undefined
    ? { mainPrinterId: input.mainPrinterId, mainPrinterIp: null }
    : { mainPrinterId: null, mainPrinterIp: input.mainPrinterIp ?? null };
}

function rethrowPrinterEndpointConflict(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new ConflictException(
      "Аппарат с таким IP-адресом и портом уже существует",
    );
  }
  throw error;
}

function rethrowGeneratedSlugConflict(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new ConflictException(
      "Похожая запись была сохранена одновременно. Повторите сохранение.",
    );
  }
  throw error;
}

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async cafes(includeInactive = false) {
    const cafes = await this.prisma.cafe.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: { _count: { select: { categories: true } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return toApiResponse(
      cafes.map(({ _count, ...cafe }) => ({
        ...cafe,
        ...(includeInactive ? { categoryCount: _count.categories } : {}),
      })),
    );
  }

  async categories(includeInactive = false, cafeId?: string) {
    const categories = await this.prisma.category.findMany({
      where: {
        ...(cafeId ? { cafeId } : {}),
        ...(includeInactive
          ? {}
          : { isActive: true, cafe: { isActive: true } }),
      },
      include: {
        cafe: true,
        receiptPrinter: true,
        products: {
          where: includeInactive
            ? {}
            : { isActive: true, ...orderablePricingWhere },
          include: productRelations,
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        },
      },
      orderBy: [
        { cafe: { sortOrder: "asc" } },
        { cafe: { name: "asc" } },
        { sortOrder: "asc" },
        { name: "asc" },
      ],
    });
    return toApiResponse(
      categories.map(({ products, ...category }) => ({
        ...categoryResponse(category, includeInactive),
        products: products.map((product) =>
          productResponse(product, includeInactive),
        ),
      })),
    );
  }

  async categorySummaries(cafeId?: string) {
    const categories = await this.prisma.category.findMany({
      where: cafeId ? { cafeId } : {},
      include: {
        cafe: true,
        receiptPrinter: true,
        _count: { select: { products: true } },
      },
      orderBy: [
        { cafe: { sortOrder: "asc" } },
        { cafe: { name: "asc" } },
        { sortOrder: "asc" },
        { name: "asc" },
      ],
    });
    return toApiResponse(
      categories.map(({ _count, ...category }) => ({
        ...categoryResponse(category, true),
        productCount: _count.products,
      })),
    );
  }

  async products(query: ListCatalogProductsQueryDto, includeInactive = false) {
    const products = await this.prisma.product.findMany({
      where: {
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(includeInactive
          ? query.cafeId
            ? { category: { cafeId: query.cafeId } }
            : {}
          : {
              isActive: true,
              category: {
                isActive: true,
                cafe: { isActive: true },
                ...(query.cafeId ? { cafeId: query.cafeId } : {}),
              },
              ...orderablePricingWhere,
            }),
      },
      include: productRelations,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return products.map((product) => productResponse(product, includeInactive));
  }

  async productPage(query: ListAdminCatalogProductsQueryDto) {
    const search = query.query?.trim();
    const where = {
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.cafeId ? { category: { is: { cafeId: query.cafeId } } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { slug: { contains: search, mode: "insensitive" as const } },
              {
                description: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              { receiptPrinterIp: { contains: search } },
              {
                receiptPrinter: {
                  is: { ipAddress: { contains: search } },
                },
              },
              {
                category: {
                  is: {
                    OR: [
                      {
                        name: {
                          contains: search,
                          mode: "insensitive" as const,
                        },
                      },
                      { receiptPrinterIp: { contains: search } },
                      {
                        receiptPrinter: {
                          is: { ipAddress: { contains: search } },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    } satisfies Prisma.ProductWhereInput;
    const page = query.page;
    const pageSize = query.limit;
    const [total, products] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: productRelations,
        orderBy: [
          { category: { sortOrder: "asc" } },
          { category: { name: "asc" } },
          { sortOrder: "asc" },
          { name: "asc" },
          { id: "asc" },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: products.map((product) => productResponse(product, true)),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  createCafe(actor: AuthUser, dto: CreateCafeDto) {
    const { slug: requestedSlug, description, ...cafeData } = dto;
    return this.prisma
      .$transaction(async (tx) => {
        const name = cafeData.name.trim();
        const slugBase = catalogSlug(requestedSlug || name, 140);
        const matchingSlugs = await tx.cafe.findMany({
          where: { slug: { startsWith: slugBase } },
          select: { slug: true },
        });
        const cafe = await tx.cafe.create({
          data: {
            ...cafeData,
            name,
            description: description?.trim() || null,
            slug: availableCatalogSlug(
              slugBase,
              matchingSlugs.map(({ slug }) => slug),
              140,
            ),
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "catalog.cafe.created",
            entityType: "Cafe",
            entityId: cafe.id,
            metadata: { name: cafe.name, slug: cafe.slug },
          },
        });
        return toApiResponse({ ...cafe, categoryCount: 0 });
      })
      .catch(rethrowGeneratedSlugConflict);
  }

  updateCafe(actor: AuthUser, id: string, dto: UpdateCafeDto) {
    const {
      slug: requestedSlug,
      description,
      name: requestedName,
      ...data
    } = dto;
    return this.prisma
      .$transaction(async (tx) => {
        const existing = await tx.cafe.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException("Cafe not found");

        let slug: string | undefined;
        if (requestedSlug !== undefined) {
          const slugBase = catalogSlug(
            requestedSlug || requestedName || existing.name,
            140,
          );
          const matchingSlugs = await tx.cafe.findMany({
            where: { id: { not: id }, slug: { startsWith: slugBase } },
            select: { slug: true },
          });
          slug = availableCatalogSlug(
            slugBase,
            matchingSlugs.map(({ slug: value }) => value),
            140,
          );
        }

        const cafe = await tx.cafe.update({
          where: { id },
          data: {
            ...data,
            ...(requestedName === undefined
              ? {}
              : { name: requestedName.trim() }),
            ...(description === undefined
              ? {}
              : { description: description?.trim() || null }),
            ...(slug === undefined ? {} : { slug }),
          },
          include: { _count: { select: { categories: true } } },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "catalog.cafe.updated",
            entityType: "Cafe",
            entityId: cafe.id,
            metadata: { changedFields: Object.keys(dto), before: toApiResponse(existing), after: toApiResponse(cafe) },
          },
        });
        const { _count, ...response } = cafe;
        return toApiResponse({ ...response, categoryCount: _count.categories });
      })
      .catch(rethrowGeneratedSlugConflict);
  }

  async deleteCafe(actor: AuthUser, id: string): Promise<void> {
    if (id === DEFAULT_CAFE_ID) {
      throw new ConflictException(
        "Основное кафе Han tagam нельзя удалить: оно сохраняет совместимость старых клиентов. Его можно скрыть.",
      );
    }
    const conflictMessage =
      "Кафе содержит блюда из истории заказов. Скройте кафе вместо удаления.";
    try {
      await this.prisma.$transaction(async (tx) => {
        const cafe = await tx.cafe.findUnique({
          where: { id },
          include: {
            categories: { select: { id: true } },
          },
        });
        if (!cafe) throw new NotFoundException("Cafe not found");
        const categoryIds = cafe.categories.map(
          ({ id: categoryId }) => categoryId,
        );
        const orderItemCount = await tx.orderItem.count({
          where: { product: { category: { cafeId: id } } },
        });
        if (orderItemCount > 0) throw new ConflictException(conflictMessage);

        await tx.product.deleteMany({
          where: { categoryId: { in: categoryIds } },
        });
        await tx.category.deleteMany({ where: { cafeId: id } });
        await tx.cafe.delete({ where: { id } });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "catalog.cafe.deleted",
            entityType: "Cafe",
            entityId: id,
            metadata: {
              name: cafe.name,
              slug: cafe.slug,
              categoryCount: cafe.categories.length,
              retainedMediaObjects: true,
            },
          },
        });
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      rethrowDeleteConstraint(error, conflictMessage);
    }
  }

  createCategory(actor: AuthUser, dto: CreateCategoryDto) {
    const {
      cafeId = DEFAULT_CAFE_ID,
      receiptPrinterId,
      receiptPrinterIp,
      slug: requestedSlug,
      ...categoryData
    } = dto;
    return this.prisma
      .$transaction(async (tx) => {
        await assertCafeReference(tx, cafeId);
        await assertActivePrinterReference(tx, receiptPrinterId);
        const slugBase = catalogSlug(requestedSlug || categoryData.name, 120);
        const matchingSlugs = await tx.category.findMany({
          where: { slug: { startsWith: slugBase } },
          select: { slug: true },
        });
        const category = await tx.category.create({
          data: {
            ...categoryData,
            cafeId,
            slug: availableCatalogSlug(
              slugBase,
              matchingSlugs.map(({ slug }) => slug),
              120,
            ),
            ...printerReferenceData({ receiptPrinterId, receiptPrinterIp }),
          },
          include: { cafe: true, receiptPrinter: true },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "catalog.category.created",
            entityType: "Category",
            entityId: category.id,
            metadata: {
              name: category.name,
              slug: category.slug,
              cafeId: category.cafeId,
            },
          },
        });
        return toApiResponse(categoryResponse(category, true));
      })
      .catch(rethrowGeneratedSlugConflict);
  }

  updateCategory(actor: AuthUser, id: string, dto: UpdateCategoryDto) {
    const {
      cafeId,
      receiptPrinterId,
      receiptPrinterIp,
      slug: requestedSlug,
      ...categoryData
    } = dto;
    return this.prisma
      .$transaction(async (tx) => {
        const category = await tx.category.findUnique({ where: { id } });
        if (!category) throw new NotFoundException("Category not found");
        if (cafeId !== undefined) await assertCafeReference(tx, cafeId);
        await assertActivePrinterReference(tx, receiptPrinterId);
        let slug: string | undefined;
        if (requestedSlug !== undefined) {
          const slugBase = catalogSlug(
            requestedSlug || categoryData.name || category.name,
            120,
          );
          const matchingSlugs = await tx.category.findMany({
            where: { id: { not: id }, slug: { startsWith: slugBase } },
            select: { slug: true },
          });
          slug = availableCatalogSlug(
            slugBase,
            matchingSlugs.map(({ slug: value }) => value),
            120,
          );
        }
        const updated = await tx.category.update({
          where: { id },
          data: {
            ...categoryData,
            ...(cafeId === undefined ? {} : { cafeId }),
            ...(slug === undefined ? {} : { slug }),
            ...printerReferenceData({ receiptPrinterId, receiptPrinterIp }),
          },
          include: { cafe: true, receiptPrinter: true },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "catalog.category.updated",
            entityType: "Category",
            entityId: id,
            metadata: { changedFields: Object.keys(dto), before: toApiResponse(category), after: toApiResponse(updated) },
          },
        });
        return toApiResponse(categoryResponse(updated, true));
      })
      .catch(rethrowGeneratedSlugConflict);
  }

  async deleteCategory(actor: AuthUser, id: string): Promise<void> {
    const conflictMessage =
      "Категория содержит блюда из истории заказов. Скройте категорию вместо удаления.";
    try {
      await this.prisma.$transaction(async (tx) => {
        const category = await tx.category.findUnique({
          where: { id },
          include: { products: { select: { id: true } } },
        });
        if (!category) throw new NotFoundException("Category not found");

        const orderItemCount = await tx.orderItem.count({
          where: { product: { categoryId: id } },
        });
        if (orderItemCount > 0) {
          throw new ConflictException(conflictMessage);
        }

        await tx.product.deleteMany({ where: { categoryId: id } });
        await tx.category.delete({ where: { id } });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "catalog.category.deleted",
            entityType: "Category",
            entityId: id,
            metadata: {
              name: category.name,
              slug: category.slug,
              productCount: category.products.length,
              retainedMediaObjects: true,
            },
          },
        });
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      rethrowDeleteConstraint(error, conflictMessage);
    }
  }

  async receiptPrintSettings() {
    const settings = await this.prisma.receiptPrintSettings.findUnique({
      where: { id: "default" },
      include: { mainPrinter: true },
    });
    return toApiResponse({
      mainCopies: settings?.mainCopies ?? 2,
      mainPrinterId: settings?.mainPrinterId ?? null,
      mainPrinterIp:
        settings?.mainPrinter?.ipAddress ?? settings?.mainPrinterIp ?? null,
      mainPrinter: settings?.mainPrinter ?? null,
      updatedAt: settings?.updatedAt ?? null,
    });
  }

  async receiptPrinters() {
    return toApiResponse(
      await this.prisma.receiptPrinter.findMany({
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
      }),
    );
  }

  createReceiptPrinter(actor: AuthUser, dto: CreateReceiptPrinterDto) {
    return this.prisma
      .$transaction(async (tx) => {
        const printer = await tx.receiptPrinter.create({
          data: { ...dto, name: dto.name.trim() },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "catalog.receipt-printer.created",
            entityType: "ReceiptPrinter",
            entityId: printer.id,
            metadata: {
              name: printer.name,
              ipAddress: printer.ipAddress,
              port: printer.port,
              transport: printer.transport,
            },
          },
        });
        return toApiResponse(printer);
      })
      .catch(rethrowPrinterEndpointConflict);
  }

  updateReceiptPrinter(
    actor: AuthUser,
    id: string,
    dto: UpdateReceiptPrinterDto,
  ) {
    return this.prisma
      .$transaction(async (tx) => {
        const existing = await tx.receiptPrinter.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException("Receipt printer not found");
        const printer = await tx.receiptPrinter.update({
          where: { id },
          data: {
            ...dto,
            ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "catalog.receipt-printer.updated",
            entityType: "ReceiptPrinter",
            entityId: printer.id,
            metadata: { changedFields: Object.keys(dto), before: toApiResponse(existing), after: toApiResponse(printer) },
          },
        });
        return toApiResponse(printer);
      })
      .catch(rethrowPrinterEndpointConflict);
  }

  async deleteReceiptPrinter(actor: AuthUser, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const printer = await tx.receiptPrinter.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              categories: true,
              products: true,
              mainSettings: true,
            },
          },
        },
      });
      if (!printer) throw new NotFoundException("Receipt printer not found");
      if (
        printer._count.categories > 0 ||
        printer._count.products > 0 ||
        printer._count.mainSettings > 0
      ) {
        throw new ConflictException(
          "Аппарат используется в настройках. Сначала отвяжите его или отключите.",
        );
      }
      await tx.receiptPrinter.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "catalog.receipt-printer.deleted",
          entityType: "ReceiptPrinter",
          entityId: printer.id,
          metadata: {
            name: printer.name,
            ipAddress: printer.ipAddress,
            port: printer.port,
          },
        },
      });
    });
  }

  updateReceiptPrintSettings(
    actor: AuthUser,
    dto: UpdateReceiptPrintSettingsDto,
  ) {
    const reference = mainPrinterReferenceData(dto);
    return this.prisma.$transaction(async (tx) => {
      await assertActivePrinterReference(tx, dto.mainPrinterId);
      const settings = await tx.receiptPrintSettings.upsert({
        where: { id: "default" },
        create: {
          id: "default",
          ...reference,
          mainCopies: dto.mainCopies ?? 2,
        },
        update: {
          ...reference,
          ...(dto.mainCopies === undefined
            ? {}
            : { mainCopies: dto.mainCopies }),
        },
        include: { mainPrinter: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "catalog.receipt-print-settings.updated",
          entityType: "ReceiptPrintSettings",
          entityId: settings.id,
          metadata: {
            changedFields: [
              ...Object.keys(reference),
              ...(dto.mainCopies === undefined ? [] : ["mainCopies"]),
            ],
          },
        },
      });
      return toApiResponse({
        mainCopies: settings.mainCopies,
        mainPrinterId: settings.mainPrinterId,
        mainPrinterIp:
          settings.mainPrinter?.ipAddress ?? settings.mainPrinterIp,
        mainPrinter: settings.mainPrinter,
        updatedAt: settings.updatedAt,
      });
    });
  }

  createProduct(actor: AuthUser, dto: CreateProductDto) {
    const {
      imageUrls = [],
      variants = [],
      variantLabel: rawVariantLabel,
      pricingType: requestedPricingType,
      price: requestedPrice,
      receiptPrinterId,
      receiptPrinterIp,
      slug: requestedSlug,
      ...product
    } = dto;
    const variantLabel = normalizedVariantLabel(rawVariantLabel);
    const pricingType =
      requestedPricingType ??
      (variants.length ? ProductPricingType.VARIANT : ProductPricingType.FIXED);
    validateVariantInputs(variants, { allowIds: false, variantLabel });
    if (pricingType === ProductPricingType.FIXED && variants.length) {
      throw new BadRequestException(
        "FIXED products cannot contain sellable variants",
      );
    }
    if (
      pricingType === ProductPricingType.FIXED &&
      requestedPrice === undefined
    ) {
      throw new BadRequestException("price is required for FIXED products");
    }
    if (pricingType === ProductPricingType.VARIANT && !variants.length) {
      throw new BadRequestException(
        "VARIANT products require at least one variant",
      );
    }
    const active = variants.filter(({ isActive }) => isActive ?? true);
    if (pricingType === ProductPricingType.VARIANT && !active.length) {
      throw new BadRequestException(
        "VARIANT products require at least one active variant",
      );
    }
    const effectivePrice =
      pricingType === ProductPricingType.VARIANT
        ? Math.min(...active.map(({ price }) => price))
        : requestedPrice!;

    return this.prisma
      .$transaction(async (tx) => {
        await assertActivePrinterReference(tx, receiptPrinterId);
        const slugBase = catalogSlug(requestedSlug || product.name, 180);
        const matchingSlugs = await tx.product.findMany({
          where: { slug: { startsWith: slugBase } },
          select: { slug: true },
        });
        const created = await tx.product.create({
          data: {
            ...product,
            slug: availableCatalogSlug(
              slugBase,
              matchingSlugs.map(({ slug }) => slug),
              180,
            ),
            ...printerReferenceData({ receiptPrinterId, receiptPrinterIp }),
            pricingType,
            price: effectivePrice,
            variantLabel:
              pricingType === ProductPricingType.VARIANT ? variantLabel : null,
            images: {
              create: imageUrls.map((url, index) => ({
                url,
                sortOrder: index,
              })),
            },
            variants: { create: variants.map(variantCreateData) },
          },
          include: productRelations,
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "catalog.product.created",
            entityType: "Product",
            entityId: created.id,
            metadata: {
              name: created.name,
              categoryId: created.categoryId,
              imageCount: created.images.length,
              variantCount: created.variants.length,
            },
          },
        });
        return productResponse(created, true);
      })
      .catch(rethrowGeneratedSlugConflict);
  }

  async updateProduct(actor: AuthUser, id: string, dto: UpdateProductDto) {
    const {
      imageUrls,
      variants,
      variantLabel: rawVariantLabel,
      pricingType: requestedPricingType,
      price: requestedPrice,
      receiptPrinterId,
      receiptPrinterIp,
      slug: requestedSlug,
      ...product
    } = dto;

    return this.prisma
      .$transaction(async (tx) => {
        const existing = await tx.product.findUnique({
          where: { id },
          include: { variants: { include: { images: true } }, images: true },
        });
        if (!existing) throw new NotFoundException("Product not found");
        await assertActivePrinterReference(tx, receiptPrinterId);

        let slug: string | undefined;
        if (requestedSlug !== undefined) {
          const slugBase = catalogSlug(
            requestedSlug || product.name || existing.name,
            180,
          );
          const matchingSlugs = await tx.product.findMany({
            where: { id: { not: id }, slug: { startsWith: slugBase } },
            select: { slug: true },
          });
          slug = availableCatalogSlug(
            slugBase,
            matchingSlugs.map(({ slug: value }) => value),
            180,
          );
        }

        const variantLabel = normalizedVariantLabel(
          rawVariantLabel === undefined
            ? existing.variantLabel
            : rawVariantLabel,
        );
        const pricingType =
          requestedPricingType ??
          (variants === undefined
            ? existing.pricingType
            : variants.length
              ? ProductPricingType.VARIANT
              : ProductPricingType.FIXED);
        if (pricingType === ProductPricingType.FIXED && variants?.length) {
          throw new BadRequestException(
            "FIXED products cannot contain sellable variants",
          );
        }
        if (variants !== undefined) {
          validateVariantInputs(variants, { allowIds: true, variantLabel });
          const existingIds = new Set(existing.variants.map(({ id }) => id));
          if (
            variants.some(
              ({ id: variantId }) => variantId && !existingIds.has(variantId),
            )
          ) {
            throw new BadRequestException(
              "One or more variants do not belong to this product",
            );
          }
          const existingByName = new Map(
            existing.variants.map((variant) => [
              variant.name.trim().toLocaleLowerCase(),
              variant.id,
            ]),
          );
          if (
            variants.some((variant) => {
              const ownerId = existingByName.get(
                variant.name.trim().toLocaleLowerCase(),
              );
              return ownerId && ownerId !== variant.id;
            })
          ) {
            throw new BadRequestException(
              "A variant name is already used by this product",
            );
          }
          const submittedIds = variants.flatMap(({ id: variantId }) =>
            variantId ? [variantId] : [],
          );
          await tx.productVariant.updateMany({
            where: {
              productId: id,
              ...(submittedIds.length ? { id: { notIn: submittedIds } } : {}),
            },
            data: { isActive: false },
          });

          for (const variant of variants) {
            if (variant.id) {
              if (variant.imageUrls !== undefined) {
                await tx.productVariantImage.deleteMany({
                  where: { productVariantId: variant.id },
                });
              }
              await tx.productVariant.update({
                where: { id: variant.id },
                data: {
                  name: variant.name.trim(),
                  description: variant.description?.trim() || null,
                  price: variant.price,
                  isActive: variant.isActive ?? true,
                  sortOrder: variant.sortOrder ?? 0,
                  ...(variant.imageUrls !== undefined
                    ? {
                        images: {
                          create: variant.imageUrls.map((url, index) => ({
                            url,
                            sortOrder: index,
                          })),
                        },
                      }
                    : {}),
                },
              });
            } else {
              await tx.productVariant.create({
                data: { productId: id, ...variantCreateData(variant) },
              });
            }
          }
        }

        if (imageUrls !== undefined) {
          await tx.productImage.deleteMany({ where: { productId: id } });
        }

        const activeVariantPrices =
          variants === undefined
            ? existing.variants
                .filter(({ isActive }) => isActive)
                .map(({ price }) => Number(price))
            : variants
                .filter(({ isActive }) => isActive ?? true)
                .map(({ price }) => price);
        if (pricingType === ProductPricingType.VARIANT && !variantLabel) {
          throw new BadRequestException(
            "variantLabel is required while product variants are configured",
          );
        }
        if (
          pricingType === ProductPricingType.VARIANT &&
          !activeVariantPrices.length
        ) {
          throw new BadRequestException(
            "VARIANT products require at least one active variant",
          );
        }
        if (
          pricingType === ProductPricingType.FIXED &&
          existing.pricingType === ProductPricingType.VARIANT &&
          requestedPrice === undefined
        ) {
          throw new BadRequestException(
            "price is required when switching a VARIANT product to FIXED",
          );
        }
        const effectivePrice =
          pricingType === ProductPricingType.VARIANT
            ? Math.min(...activeVariantPrices)
            : (requestedPrice ?? Number(existing.price));

        if (pricingType === ProductPricingType.FIXED) {
          await tx.productVariant.updateMany({
            where: { productId: id, isActive: true },
            data: { isActive: false },
          });
        }

        const updated = await tx.product.update({
          where: { id },
          data: {
            ...product,
            ...(slug === undefined ? {} : { slug }),
            ...printerReferenceData({ receiptPrinterId, receiptPrinterIp }),
            pricingType,
            price: effectivePrice,
            variantLabel:
              pricingType === ProductPricingType.VARIANT ? variantLabel : null,
            ...(imageUrls !== undefined
              ? {
                  images: {
                    create: imageUrls.map((url, index) => ({
                      url,
                      sortOrder: index,
                    })),
                  },
                }
              : {}),
          },
          include: productRelations,
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "catalog.product.updated",
            entityType: "Product",
            entityId: id,
            metadata: {
              before: toApiResponse(existing),
              after: toApiResponse(updated),
              changedFields: Object.keys(dto),
              imageCount: updated.images.length,
              variantCount: updated.variants.length,
              activeVariantCount: updated.variants.filter(
                ({ isActive }) => isActive,
              ).length,
            },
          },
        });
        return productResponse(updated, true);
      })
      .catch(rethrowGeneratedSlugConflict);
  }

  async deleteProduct(actor: AuthUser, id: string): Promise<void> {
    const conflictMessage =
      "Блюдо есть в истории заказов. Скройте блюдо вместо удаления.";
    try {
      await this.prisma.$transaction(async (tx) => {
        const product = await tx.product.findUnique({ where: { id } });
        if (!product) throw new NotFoundException("Product not found");

        const orderItemCount = await tx.orderItem.count({
          where: { productId: id },
        });
        if (orderItemCount > 0) {
          throw new ConflictException(conflictMessage);
        }

        await tx.product.delete({ where: { id } });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "catalog.product.deleted",
            entityType: "Product",
            entityId: id,
            metadata: {
              name: product.name,
              slug: product.slug,
              categoryId: product.categoryId,
              retainedMediaObjects: true,
            },
          },
        });
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      rethrowDeleteConstraint(error, conflictMessage);
    }
  }

  addImage(actor: AuthUser, productId: string, dto: AddProductImageDto) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw new NotFoundException("Product not found");
      const imageCount = await tx.productImage.count({ where: { productId } });
      if (imageCount >= MAX_PRODUCT_IMAGES) {
        throw new ConflictException(
          `A product can have at most ${MAX_PRODUCT_IMAGES} images`,
        );
      }
      const image = await tx.productImage.create({
        data: {
          productId,
          ...dto,
          sortOrder: dto.sortOrder ?? imageCount,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "catalog.product-image.created",
          entityType: "Product",
          entityId: productId,
          metadata: { imageId: image.id },
        },
      });
      return toApiResponse(image);
    });
  }
}
