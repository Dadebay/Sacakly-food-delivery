import { createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  InventoryDocumentKind,
  InventoryLineKind,
  InventoryMovementType,
  OrderStatus,
  Prisma,
} from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../common/auth.types";
import {
  InventoryLocationDto,
  InventoryReceiptDto,
  InventoryTransferDto,
  InventoryProcessDto,
  InventoryWasteDto,
  InventoryStocktakeDto,
  InventoryLotQuantityDto,
} from "./inventory-flow.dto";

const decimal = (value: number | Prisma.Decimal) => new Prisma.Decimal(value);
const MAX_QUANTITY = new Prisma.Decimal("999999999.999");
const MAX_UNIT_COST = new Prisma.Decimal("999999.999999");
const activeReservationStatuses = [
  OrderStatus.COOKING,
  OrderStatus.READY,
  OrderStatus.ASSIGNED_TO_COURIER,
];

const documentInclude = {
  lines: {
    include: {
      lot: { include: { ingredient: { select: { name: true, unit: true } } } },
      location: { select: { name: true, code: true } },
    },
    orderBy: { id: "asc" as const },
  },
} satisfies Prisma.InventoryDocumentInclude;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

@Injectable()
export class InventoryFlowService {
  constructor(private readonly prisma: PrismaService) {}

  private fingerprint(kind: InventoryDocumentKind, dto: object) {
    return createHash("sha256").update(canonical({ kind, dto })).digest("hex");
  }

  private async transaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    try {
      return await this.prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const driver =
        error instanceof Prisma.PrismaClientKnownRequestError
          ? (error.meta?.driverAdapterError as
              | { cause?: { code?: string } }
              | undefined)
          : undefined;
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" ||
          (error.code === "P2039" &&
            ["40P01", "40001"].includes(driver?.cause?.code ?? "")))
      ) {
        throw new ConflictException(
          "Склад изменился. Обновите данные и повторите операцию.",
        );
      }
      throw error;
    }
  }

  private async replay(actorId: string, key: string, fingerprint: string) {
    const existing = await this.prisma.inventoryDocument.findUnique({
      where: { actorId_idempotencyKey: { actorId, idempotencyKey: key } },
      include: documentInclude,
    });
    if (!existing) return null;
    if (existing.requestFingerprint !== fingerprint)
      throw new ConflictException(
        "Этот ключ уже использован для другого складского документа.",
      );
    return this.response(existing);
  }

  private response(
    document: Prisma.InventoryDocumentGetPayload<{
      include: typeof documentInclude;
    }>,
  ) {
    return {
      id: document.id,
      branchId: document.branchId,
      actorId: document.actorId,
      orderId: document.orderId,
      kind: document.kind,
      reason: document.reason,
      stocktakeExpectedQuantity:
        document.stocktakeExpectedQuantity === null
          ? null
          : Number(document.stocktakeExpectedQuantity),
      stocktakeCountedQuantity:
        document.stocktakeCountedQuantity === null
          ? null
          : Number(document.stocktakeCountedQuantity),
      createdAt: document.createdAt,
      lines: document.lines.map((line) => ({
        id: line.id,
        lotId: line.lotId,
        lotCode: line.lot.code,
        orderItemId: line.orderItemId,
        ingredientId: line.lot.ingredientId,
        ingredientName: line.lot.ingredient.name,
        unit: line.lot.ingredient.unit,
        locationId: line.locationId,
        locationName: line.location.name,
        kind: line.kind,
        quantity: Number(line.quantity),
        unitCost: Number(line.unitCost),
      })),
    };
  }

  private async post(
    actor: AuthUser,
    kind: InventoryDocumentKind,
    dto: { branchId: string; idempotencyKey: string; reason: string },
    work: (tx: Prisma.TransactionClient, documentId: string) => Promise<void>,
  ) {
    const fingerprint = this.fingerprint(kind, dto);
    const replay = await this.replay(actor.id, dto.idempotencyKey, fingerprint);
    if (replay) return replay;
    try {
      return await this.transaction(async (tx) => {
        const branch = await tx.branch.findUnique({
          where: { id: dto.branchId },
        });
        if (!branch) throw new NotFoundException("Филиал не найден.");
        const document = await tx.inventoryDocument.create({
          data: {
            branchId: dto.branchId,
            actorId: actor.id,
            idempotencyKey: dto.idempotencyKey,
            requestFingerprint: fingerprint,
            kind,
            reason: dto.reason.trim(),
          },
        });
        await work(tx, document.id);
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: `inventory.document.${kind.toLowerCase()}`,
            entityType: "InventoryDocument",
            entityId: document.id,
            metadata: { branchId: dto.branchId, reason: dto.reason, kind },
          },
        });
        return this.response(
          await tx.inventoryDocument.findUniqueOrThrow({
            where: { id: document.id },
            include: documentInclude,
          }),
        );
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const repeated = await this.replay(
          actor.id,
          dto.idempotencyKey,
          fingerprint,
        );
        if (repeated) return repeated;
        throw new ConflictException("Код партии или документа уже существует.");
      }
      throw error;
    }
  }

  async listLocations(branchId: string) {
    return this.prisma.inventoryLocation.findMany({
      where: { branchId },
      orderBy: { name: "asc" },
    });
  }

  async createLocation(actor: AuthUser, dto: InventoryLocationDto) {
    return this.transaction(async (tx) => {
      const branch = await tx.branch.findUnique({
        where: { id: dto.branchId },
      });
      if (!branch) throw new NotFoundException("Филиал не найден.");
      try {
        const location = await tx.inventoryLocation.create({
          data: {
            branchId: dto.branchId,
            code: dto.code.trim().toUpperCase(),
            name: dto.name.trim(),
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "inventory.location.created",
            entityType: "InventoryLocation",
            entityId: location.id,
            metadata: {
              branchId: dto.branchId,
              code: location.code,
              name: location.name,
            },
          },
        });
        return location;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
          throw new ConflictException("Место с таким кодом уже существует.");
        throw error;
      }
    });
  }

  async listLots(branchId: string) {
    const lots = await this.prisma.inventoryLot.findMany({
      where: { branchId },
      include: {
        ingredient: { select: { name: true, unit: true } },
        balances: {
          include: { location: { select: { name: true, code: true } } },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 500,
    });
    return lots.map((lot) => ({
      id: lot.id,
      branchId: lot.branchId,
      code: lot.code,
      ingredientId: lot.ingredientId,
      ingredientName: lot.ingredient.name,
      unit: lot.ingredient.unit,
      unitCost: Number(lot.unitCost),
      expiresAt: lot.expiresAt,
      originNote: lot.originNote,
      createdAt: lot.createdAt,
      balances: lot.balances.map((balance) => ({
        locationId: balance.locationId,
        locationName: balance.location.name,
        locationCode: balance.location.code,
        quantity: Number(balance.quantity),
      })),
    }));
  }

  async getDocument(id: string) {
    const document = await this.prisma.inventoryDocument.findUnique({
      where: { id },
      include: documentInclude,
    });
    if (!document) throw new NotFoundException("Складской документ не найден.");
    return this.response(document);
  }

  async listDocuments(branchId: string) {
    const documents = await this.prisma.inventoryDocument.findMany({
      where: { branchId },
      include: documentInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
    return documents.map((document) => this.response(document));
  }

  async traceLot(id: string) {
    const lot = await this.prisma.inventoryLot.findUnique({ where: { id } });
    if (!lot) throw new NotFoundException("Партия не найдена.");
    const lines = await this.prisma.inventoryDocumentLine.findMany({
      where: { lotId: id },
      select: { documentId: true },
    });
    const ids = [...new Set(lines.map((line) => line.documentId))];
    const documents = await this.prisma.inventoryDocument.findMany({
      where: { id: { in: ids } },
      include: documentInclude,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return {
      lotId: id,
      documents: documents.map((document) => this.response(document)),
    };
  }

  private async location(
    tx: Prisma.TransactionClient,
    id: string,
    branchId: string,
  ) {
    const location = await tx.inventoryLocation.findUnique({ where: { id } });
    if (!location || location.branchId !== branchId)
      throw new BadRequestException("Место не принадлежит выбранному филиалу.");
    return location;
  }

  private async lot(
    tx: Prisma.TransactionClient,
    id: string,
    branchId: string,
  ) {
    const lot = await tx.inventoryLot.findUnique({
      where: { id },
      include: { ingredient: true },
    });
    if (!lot || lot.branchId !== branchId)
      throw new BadRequestException(
        "Партия не принадлежит выбранному филиалу.",
      );
    return lot;
  }

  private async changeAvailable(
    tx: Prisma.TransactionClient,
    ingredientId: string,
    branchId: string,
    delta: Prisma.Decimal,
  ) {
    await tx.ingredientStock.createMany({
      data: [{ ingredientId, branchId, quantity: 0 }],
      skipDuplicates: true,
    });
    const changed = await tx.ingredientStock.updateMany({
      where: {
        ingredientId,
        branchId,
        quantity: delta.isNegative()
          ? { gte: delta.negated() }
          : { lte: MAX_QUANTITY.minus(delta) },
      },
      data: { quantity: { increment: delta } },
    });
    if (changed.count !== 1)
      throw new ConflictException(
        "Недостаточный доступный остаток или превышен предел количества.",
      );
  }

  private async line(
    tx: Prisma.TransactionClient,
    documentId: string,
    lotId: string,
    locationId: string,
    kind: InventoryLineKind,
    quantity: Prisma.Decimal,
    unitCost: Prisma.Decimal,
    orderItemId?: string,
  ) {
    await tx.inventoryDocumentLine.create({
      data: {
        documentId,
        lotId,
        locationId,
        kind,
        quantity,
        unitCost,
        orderItemId,
      },
    });
  }

  private async increaseLot(
    tx: Prisma.TransactionClient,
    documentId: string,
    lotId: string,
    locationId: string,
    quantity: Prisma.Decimal,
    unitCost: Prisma.Decimal,
  ) {
    await tx.inventoryLotBalance.createMany({
      data: [{ lotId, locationId, quantity: 0 }],
      skipDuplicates: true,
    });
    const changed = await tx.inventoryLotBalance.updateMany({
      where: {
        lotId,
        locationId,
        quantity: { lte: MAX_QUANTITY.minus(quantity) },
      },
      data: { quantity: { increment: quantity } },
    });
    if (changed.count !== 1)
      throw new ConflictException("Превышен предел количества в партии.");
    await this.line(
      tx,
      documentId,
      lotId,
      locationId,
      InventoryLineKind.IN,
      quantity,
      unitCost,
    );
  }

  private async decreaseLot(
    tx: Prisma.TransactionClient,
    documentId: string,
    lotId: string,
    locationId: string,
    quantity: Prisma.Decimal,
    unitCost: Prisma.Decimal,
    kind: InventoryLineKind = InventoryLineKind.OUT,
    orderItemId?: string,
  ) {
    const changed = await tx.inventoryLotBalance.updateMany({
      where: { lotId, locationId, quantity: { gte: quantity } },
      data: { quantity: { decrement: quantity } },
    });
    if (changed.count !== 1)
      throw new ConflictException(
        "Недостаточный остаток партии в указанном месте.",
      );
    await this.line(
      tx,
      documentId,
      lotId,
      locationId,
      kind,
      quantity,
      unitCost,
      orderItemId,
    );
  }

  private async defaultLocation(
    tx: Prisma.TransactionClient,
    branchId: string,
  ) {
    return tx.inventoryLocation.upsert({
      where: { branchId_code: { branchId, code: "WAREHOUSE" } },
      create: { branchId, code: "WAREHOUSE", name: "Основной склад" },
      update: {},
    });
  }

  // Legacy IngredientStock is available, not physical. The opening physical
  // estimate adds active order reservations and explicitly marks provenance
  // unknown; stocktake is needed to confirm the count.
  async ensureOpening(
    tx: Prisma.TransactionClient,
    ingredientId: string,
    branchId: string,
    issuingOrderId?: string,
  ) {
    await tx.ingredientStock.createMany({
      data: [{ ingredientId, branchId, quantity: 0 }],
      skipDuplicates: true,
    });
    await tx.ingredientStock.updateMany({
      where: { ingredientId, branchId },
      data: { quantity: { increment: 0 } },
    });
    const existing = await tx.inventoryLot.findFirst({
      where: { ingredientId, branchId },
    });
    if (existing) return;
    const [stock, ingredient, reserved] = await Promise.all([
      tx.ingredientStock.findUniqueOrThrow({
        where: { ingredientId_branchId: { ingredientId, branchId } },
      }),
      tx.ingredient.findUniqueOrThrow({ where: { id: ingredientId } }),
      tx.inventoryMovement.aggregate({
        where: {
          ingredientId,
          branchId,
          orderId: { not: null },
          OR: [
            { order: { status: { in: activeReservationStatuses } } },
            ...(issuingOrderId ? [{ orderId: issuingOrderId }] : []),
          ],
        },
        _sum: { quantityDelta: true },
      }),
    ]);
    const physical = stock.quantity.minus(reserved._sum.quantityDelta ?? 0);
    if (physical.isNegative() || physical.gt(MAX_QUANTITY))
      throw new ConflictException(
        "Начальный остаток требует сверки до проведения операции.",
      );
    if (physical.isZero()) return;
    const location = await this.defaultLocation(tx, branchId);
    const lot = await tx.inventoryLot.create({
      data: {
        branchId,
        ingredientId,
        code: `LEGACY-${ingredientId}`,
        unitCost: ingredient.costPerUnit,
        originNote:
          "Расчётный остаток старого склада; поставка и физический пересчёт неизвестны.",
      },
    });
    const document = await tx.inventoryDocument.create({
      data: {
        branchId,
        kind: InventoryDocumentKind.LEGACY_ADJUSTMENT,
        reason: "Переходный расчётный остаток. Требуется инвентаризация.",
      },
    });
    await this.increaseLot(
      tx,
      document.id,
      lot.id,
      location.id,
      physical,
      lot.unitCost,
    );
    await tx.auditLog.create({
      data: {
        action: "inventory.legacy.opened",
        entityType: "InventoryDocument",
        entityId: document.id,
        metadata: {
          ingredientId,
          branchId,
          available: stock.quantity.toString(),
          activeReservations: physical.minus(stock.quantity).toString(),
          physicalEstimate: physical.toString(),
        },
      },
    });
  }

  private async requireAvailable(
    tx: Prisma.TransactionClient,
    ingredientId: string,
    branchId: string,
    quantity: Prisma.Decimal,
  ) {
    const stock = await tx.ingredientStock.findUnique({
      where: { ingredientId_branchId: { ingredientId, branchId } },
    });
    if (!stock || stock.quantity.lt(quantity))
      throw new ConflictException(
        "Количество зарезервировано заказами или отсутствует на складе.",
      );
  }

  private async takeFromLots(
    tx: Prisma.TransactionClient,
    documentId: string,
    ingredientId: string,
    branchId: string,
    quantity: Prisma.Decimal,
    orderItemId?: string,
  ) {
    let remaining = quantity;
    const balances = await tx.inventoryLotBalance.findMany({
      where: { lot: { ingredientId, branchId }, quantity: { gt: 0 } },
      include: { lot: true },
      orderBy: [
        { lot: { createdAt: "asc" } },
        { lotId: "asc" },
        { locationId: "asc" },
      ],
    });
    for (const balance of balances) {
      if (remaining.isZero()) break;
      const taken = Prisma.Decimal.min(remaining, balance.quantity);
      await this.decreaseLot(
        tx,
        documentId,
        balance.lotId,
        balance.locationId,
        taken,
        balance.lot.unitCost,
        InventoryLineKind.OUT,
        orderItemId,
      );
      remaining = remaining.minus(taken);
    }
    if (!remaining.isZero())
      throw new ConflictException(
        "Физический остаток меньше учтённого; нужна инвентаризация.",
      );
  }

  receipt(actor: AuthUser, dto: InventoryReceiptDto) {
    return this.post(
      actor,
      InventoryDocumentKind.RECEIPT,
      dto,
      async (tx, documentId) => {
        const [ingredient] = await Promise.all([
          tx.ingredient.findUnique({ where: { id: dto.ingredientId } }),
          this.location(tx, dto.locationId, dto.branchId),
        ]);
        if (!ingredient?.isActive)
          throw new BadRequestException(
            "Активная складская позиция не найдена.",
          );
        await this.ensureOpening(tx, dto.ingredientId, dto.branchId);
        const lot = await tx.inventoryLot.create({
          data: {
            branchId: dto.branchId,
            ingredientId: dto.ingredientId,
            code: dto.lotCode.trim(),
            unitCost: dto.unitCost,
            expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          },
        });
        await this.changeAvailable(
          tx,
          dto.ingredientId,
          dto.branchId,
          decimal(dto.quantity),
        );
        await this.increaseLot(
          tx,
          documentId,
          lot.id,
          dto.locationId,
          decimal(dto.quantity),
          lot.unitCost,
        );
      },
    );
  }

  transfer(actor: AuthUser, dto: InventoryTransferDto) {
    return this.post(
      actor,
      InventoryDocumentKind.TRANSFER,
      dto,
      async (tx, documentId) => {
        if (dto.fromLocationId === dto.toLocationId)
          throw new BadRequestException(
            "Места отправления и получения совпадают.",
          );
        const lot = await this.lot(tx, dto.lotId, dto.branchId);
        await this.location(tx, dto.fromLocationId, dto.branchId);
        await this.location(tx, dto.toLocationId, dto.branchId);
        await this.decreaseLot(
          tx,
          documentId,
          lot.id,
          dto.fromLocationId,
          decimal(dto.quantity),
          lot.unitCost,
        );
        await this.increaseLot(
          tx,
          documentId,
          lot.id,
          dto.toLocationId,
          decimal(dto.quantity),
          lot.unitCost,
        );
      },
    );
  }

  private async inputLines(
    tx: Prisma.TransactionClient,
    documentId: string,
    branchId: string,
    lines: InventoryLotQuantityDto[],
    kind: InventoryLineKind,
  ) {
    const totals = new Map<string, Prisma.Decimal>();
    for (const line of lines) {
      const key = `${line.lotId}:${line.locationId}`;
      totals.set(key, (totals.get(key) ?? decimal(0)).plus(line.quantity));
    }
    const byIngredient = new Map<string, Prisma.Decimal>();
    let totalCost = decimal(0);
    const units = new Set<string>();
    for (const [key, quantity] of [...totals].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const [lotId, locationId] = key.split(":");
      const lot = await this.lot(tx, lotId!, branchId);
      await this.location(tx, locationId!, branchId);
      byIngredient.set(
        lot.ingredientId,
        (byIngredient.get(lot.ingredientId) ?? decimal(0)).plus(quantity),
      );
      units.add(lot.ingredient.unit);
      totalCost = totalCost.plus(lot.unitCost.mul(quantity));
      await this.decreaseLot(
        tx,
        documentId,
        lotId!,
        locationId!,
        quantity,
        lot.unitCost,
        kind,
      );
    }
    return { byIngredient, totalCost, units };
  }

  process(actor: AuthUser, dto: InventoryProcessDto) {
    return this.post(
      actor,
      InventoryDocumentKind.PROCESS,
      dto,
      async (tx, documentId) => {
        const allInputs = dto.inputs;
        const ingredients = new Set<string>();
        for (const item of allInputs)
          ingredients.add(
            (await this.lot(tx, item.lotId, dto.branchId)).ingredientId,
          );
        for (const id of [...ingredients].sort())
          await this.ensureOpening(tx, id, dto.branchId);
        const consumeTotals = new Map<string, Prisma.Decimal>();
        for (const item of allInputs) {
          const lot = await this.lot(tx, item.lotId, dto.branchId);
          consumeTotals.set(
            lot.ingredientId,
            (consumeTotals.get(lot.ingredientId) ?? decimal(0)).plus(
              item.quantity,
            ),
          );
        }
        for (const [id, amount] of [...consumeTotals].sort(([a], [b]) =>
          a.localeCompare(b),
        ))
          await this.requireAvailable(tx, id, dto.branchId, amount);
        const consumed = await this.inputLines(
          tx,
          documentId,
          dto.branchId,
          dto.inputs,
          InventoryLineKind.OUT,
        );
        const inputByLot = new Map<string, Prisma.Decimal>();
        for (const input of dto.inputs) {
          const key = `${input.lotId}:${input.locationId}`;
          inputByLot.set(
            key,
            (inputByLot.get(key) ?? decimal(0)).plus(input.quantity),
          );
        }
        const wasteByLot = new Map<string, Prisma.Decimal>();
        for (const item of dto.waste) {
          const key = `${item.lotId}:${item.locationId}`;
          wasteByLot.set(
            key,
            (wasteByLot.get(key) ?? decimal(0)).plus(item.quantity),
          );
        }
        for (const [key, amount] of wasteByLot) {
          if (amount.gt(inputByLot.get(key) ?? 0))
            throw new BadRequestException(
              "Отходы не могут превышать расход этой партии.",
            );
          const [lotId, locationId] = key.split(":");
          const lot = await this.lot(tx, lotId!, dto.branchId);
          await this.line(
            tx,
            documentId,
            lotId!,
            locationId!,
            InventoryLineKind.PROCESS_WASTE,
            amount,
            lot.unitCost,
          );
        }
        const outputInfo = [] as Array<{
          ingredientId: string;
          locationId: string;
          lotCode: string;
          quantity: Prisma.Decimal;
          costWeight: Prisma.Decimal;
          unit: string;
        }>;
        for (const output of dto.outputs) {
          const ingredient = await tx.ingredient.findUnique({
            where: { id: output.ingredientId },
          });
          if (!ingredient?.isActive)
            throw new BadRequestException(
              "Выходная складская позиция выключена или отсутствует.",
            );
          await this.location(tx, output.locationId, dto.branchId);
          outputInfo.push({
            ingredientId: output.ingredientId,
            locationId: output.locationId,
            lotCode: output.lotCode.trim(),
            quantity: decimal(output.quantity),
            costWeight: decimal(output.quantity).mul(ingredient.costPerUnit),
            unit: ingredient.unit,
          });
        }
        // For a single-material conversion, an unexplained quantity difference
        // must be recorded as measured waste. Mixed-unit cooking is not mass-additive.
        if (
          consumed.units.size === 1 &&
          outputInfo.every((output) => consumed.units.has(output.unit))
        ) {
          const inputQuantity = dto.inputs.reduce(
            (sum, line) => sum.plus(line.quantity),
            decimal(0),
          );
          const wasteQuantity = dto.waste.reduce(
            (sum, line) => sum.plus(line.quantity),
            decimal(0),
          );
          const outputQuantity = outputInfo.reduce(
            (sum, line) => sum.plus(line.quantity),
            decimal(0),
          );
          if (!inputQuantity.eq(outputQuantity.plus(wasteQuantity)))
            throw new BadRequestException(
              "Для одного измерителя вход должен равняться выходу и измеренным отходам.",
            );
        }
        for (const [id, amount] of [...consumeTotals].sort(([a], [b]) =>
          a.localeCompare(b),
        ))
          await this.changeAvailable(tx, id, dto.branchId, amount.negated());
        const totalCost = consumed.totalCost;
        const totalWeight = outputInfo.reduce(
          (sum, output) => sum.plus(output.costWeight),
          decimal(0),
        );
        const equalWeight = decimal(1).div(outputInfo.length);
        for (const output of outputInfo) {
          const share = totalWeight.isZero()
            ? equalWeight
            : output.costWeight.div(totalWeight);
          const unitCost = totalCost
            .mul(share)
            .div(output.quantity)
            .toDecimalPlaces(6);
          if (unitCost.gt(MAX_UNIT_COST))
            throw new BadRequestException(
              "Стоимость единицы после обработки превышает допустимый предел.",
            );
          const lot = await tx.inventoryLot.create({
            data: {
              branchId: dto.branchId,
              ingredientId: output.ingredientId,
              code: output.lotCode,
              unitCost,
              originNote: `Выпуск по акту ${documentId}`,
            },
          });
          await this.increaseLot(
            tx,
            documentId,
            lot.id,
            output.locationId,
            output.quantity,
            unitCost,
          );
          await this.changeAvailable(
            tx,
            output.ingredientId,
            dto.branchId,
            output.quantity,
          );
        }
      },
    );
  }

  waste(actor: AuthUser, dto: InventoryWasteDto) {
    return this.post(
      actor,
      InventoryDocumentKind.WASTE,
      dto,
      async (tx, documentId) => {
        const totals = new Map<string, Prisma.Decimal>();
        for (const line of dto.lines) {
          const lot = await this.lot(tx, line.lotId, dto.branchId);
          totals.set(
            lot.ingredientId,
            (totals.get(lot.ingredientId) ?? decimal(0)).plus(line.quantity),
          );
        }
        for (const [id, amount] of [...totals].sort(([a], [b]) =>
          a.localeCompare(b),
        )) {
          await this.ensureOpening(tx, id, dto.branchId);
          await this.requireAvailable(tx, id, dto.branchId, amount);
        }
        await this.inputLines(
          tx,
          documentId,
          dto.branchId,
          dto.lines,
          InventoryLineKind.OUT,
        );
        for (const [id, amount] of [...totals].sort(([a], [b]) =>
          a.localeCompare(b),
        ))
          await this.changeAvailable(tx, id, dto.branchId, amount.negated());
      },
    );
  }

  stocktake(actor: AuthUser, dto: InventoryStocktakeDto) {
    return this.post(
      actor,
      InventoryDocumentKind.STOCKTAKE,
      dto,
      async (tx, documentId) => {
        const lot = await this.lot(tx, dto.lotId, dto.branchId);
        await this.location(tx, dto.locationId, dto.branchId);
        const balance = await tx.inventoryLotBalance.findUnique({
          where: {
            lotId_locationId: { lotId: dto.lotId, locationId: dto.locationId },
          },
        });
        const delta = decimal(dto.countedQuantity).minus(
          balance?.quantity ?? 0,
        );
        await tx.inventoryDocument.update({
          where: { id: documentId },
          data: {
            stocktakeExpectedQuantity: balance?.quantity ?? decimal(0),
            stocktakeCountedQuantity: decimal(dto.countedQuantity),
          },
        });
        if (delta.isZero())
          throw new BadRequestException(
            "Фактический остаток не отличается от учётного.",
          );
        await this.changeAvailable(tx, lot.ingredientId, dto.branchId, delta);
        if (delta.isNegative())
          await this.decreaseLot(
            tx,
            documentId,
            lot.id,
            dto.locationId,
            delta.negated(),
            lot.unitCost,
          );
        else
          await this.increaseLot(
            tx,
            documentId,
            lot.id,
            dto.locationId,
            delta,
            lot.unitCost,
          );
      },
    );
  }

  async issueOrder(
    tx: Prisma.TransactionClient,
    actorId: string,
    order: { id: string; number: number; branchId: string | null },
  ) {
    if (!order.branchId) return;
    const existing = await tx.inventoryDocument.findUnique({
      where: {
        orderId_kind: {
          orderId: order.id,
          kind: InventoryDocumentKind.ORDER_ISSUE,
        },
      },
    });
    if (existing) return;
    const balances = await tx.inventoryMovement.groupBy({
      by: ["ingredientId", "branchId"],
      where: { orderId: order.id },
      _sum: { quantityDelta: true },
    });
    const required = balances
      .map((balance) => ({
        ingredientId: balance.ingredientId,
        branchId: balance.branchId,
        quantity: (balance._sum.quantityDelta ?? decimal(0)).negated(),
      }))
      .filter((line) => line.quantity.gt(0));
    if (!required.length) return;
    const document = await tx.inventoryDocument.create({
      data: {
        branchId: order.branchId,
        actorId,
        orderId: order.id,
        kind: InventoryDocumentKind.ORDER_ISSUE,
        reason: `Фактическая выдача заказа №${order.number}`,
      },
    });
    for (const line of required.sort((a, b) =>
      `${a.branchId}:${a.ingredientId}`.localeCompare(
        `${b.branchId}:${b.ingredientId}`,
      ),
    )) {
      await this.ensureOpening(tx, line.ingredientId, line.branchId, order.id);
    }
    const snapshots = await tx.inventoryOrderRequirement.findMany({
      where: { orderId: order.id, quantity: { gt: 0 } },
      orderBy: [{ ingredientId: "asc" }, { orderItemId: "asc" }],
    });
    if (snapshots.length) {
      for (const line of required) {
        const snapTotal = snapshots
          .filter((snapshot) => snapshot.ingredientId === line.ingredientId)
          .reduce((sum, snapshot) => sum.plus(snapshot.quantity), decimal(0));
        if (!snapTotal.eq(line.quantity))
          throw new ConflictException(
            "Резерв заказа не совпадает с сохранёнными нормами; требуется сверка.",
          );
      }
      for (const snapshot of snapshots)
        await this.takeFromLots(
          tx,
          document.id,
          snapshot.ingredientId,
          order.branchId,
          snapshot.quantity,
          snapshot.orderItemId,
        );
    } else {
      for (const line of required)
        await this.takeFromLots(
          tx,
          document.id,
          line.ingredientId,
          line.branchId,
          line.quantity,
        );
    }
    await tx.auditLog.create({
      data: {
        actorId,
        action: "inventory.order.issued",
        entityType: "Order",
        entityId: order.id,
        metadata: {
          documentId: document.id,
          branchId: order.branchId,
          items: required.map((line) => ({
            ingredientId: line.ingredientId,
            quantity: line.quantity.toString(),
          })),
        },
      },
    });
  }

  async recordLegacyAdjustment(
    tx: Prisma.TransactionClient,
    actorId: string,
    movement: {
      id: string;
      ingredientId: string;
      branchId: string;
      type: InventoryMovementType;
      quantityDelta: Prisma.Decimal;
      reason: string | null;
    },
  ) {
    const delta = movement.quantityDelta;
    if (delta.isZero()) return;
    const document = await tx.inventoryDocument.create({
      data: {
        branchId: movement.branchId,
        actorId,
        kind:
          movement.type === InventoryMovementType.WASTE
            ? InventoryDocumentKind.WASTE
            : movement.type === InventoryMovementType.RECEIPT
              ? InventoryDocumentKind.RECEIPT
              : InventoryDocumentKind.LEGACY_ADJUSTMENT,
        reason:
          movement.reason ?? "Корректировка старого складского интерфейса",
      },
    });
    if (delta.isPositive()) {
      const ingredient = await tx.ingredient.findUniqueOrThrow({
        where: { id: movement.ingredientId },
      });
      const location = await this.defaultLocation(tx, movement.branchId);
      const lot = await tx.inventoryLot.create({
        data: {
          ingredientId: movement.ingredientId,
          branchId: movement.branchId,
          code: `ADJ-${movement.id}`,
          unitCost: ingredient.costPerUnit,
          originNote: `Корректировка движения ${movement.id}; источник поставки не указан`,
        },
      });
      await this.increaseLot(
        tx,
        document.id,
        lot.id,
        location.id,
        delta,
        lot.unitCost,
      );
    } else {
      await this.takeFromLots(
        tx,
        document.id,
        movement.ingredientId,
        movement.branchId,
        delta.negated(),
      );
    }
  }
}
