import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { toApiResponse } from "../common/api-response";
import type { AuthUser } from "../common/auth.types";
import { BranchesService } from "../branches/branches.service";
import {
  Prisma,
  type DeliverySettings,
  type Etrap,
} from "../generated/prisma/client";
import { GeocodingService } from "../geocoding/geocoding.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateDeliveryEtrapDto,
  CreateDeliveryWelayatDto,
  QuoteDeliveryDto,
  QuoteDeliveryTariffDto,
  DeliveryZonePointDto,
  UpdateDeliveryEtrapDto,
  UpdateDeliverySettingsDto,
  UpdateDeliveryWelayatDto,
} from "./delivery.dto";
import {
  calculateDeliveryFee,
  calculateDistanceDeliveryFee,
  resolveDeliveryPeriod,
  DELIVERY_TIME_ZONE,
} from "./delivery-pricing";
import { findDeliveryAreaForAddress } from "./delivery-area-matcher";
import {
  parseDistancePriceTiers,
  type DistancePriceTier,
} from "./distance-price-tiers";
import {
  deliveryZoneFromJson,
  deliveryZonesOverlap,
  deliveryZoneValidationError,
  findDeliveryAreaForCoordinates,
  normalizeDeliveryZone,
  type DeliveryZonePoint,
} from "./delivery-zone";

const SETTINGS_ID = "default";

@Injectable()
export class DeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geocoding: GeocodingService,
    private readonly branches: BranchesService,
  ) {}

  publicConfig() {
    return this.getConfig(true);
  }

  adminConfig() {
    return this.getConfig(false);
  }

  async suggestZone(dto: DeliveryZonePointDto) {
    const suggestion = await this.geocoding.suggestDistrictBoundary(
      dto.latitude,
      dto.longitude,
    );
    if (!suggestion) {
      return {
        label: null,
        nameRu: null,
        nameTk: null,
        nameEn: null,
        boundary: null,
        provider: null,
      };
    }
    const boundary = suggestion.boundary
      ? normalizeDeliveryZone(suggestion.boundary)
      : null;
    return {
      ...suggestion,
      boundary:
        boundary && !deliveryZoneValidationError(boundary) ? boundary : null,
    };
  }

  async quote(dto: QuoteDeliveryDto) {
    const [addressLine, settings, etraps] = await Promise.all([
      this.geocoding.reverseGeocode(dto.latitude, dto.longitude),
      this.prisma.deliverySettings.findUnique({ where: { id: SETTINGS_ID } }),
      this.prisma.etrap.findMany({
        where: { isDeliveryEnabled: true },
        include: { welayat: true },
      }),
    ]);
    if (!settings) throw new NotFoundException("Delivery settings not found");

    const etrap = settings.mapPricingEnabled
      ? findDeliveryAreaForCoordinates(etraps, {
          latitude: dto.latitude,
          longitude: dto.longitude,
        })
      : findDeliveryAreaForAddress(etraps, addressLine);
    const nearest = settings.distancePricingEnabled
      ? await this.prisma.$transaction((tx) =>
          this.branches.findNearestActive(tx, {
            latitude: dto.latitude,
            longitude: dto.longitude,
          }, true),
        )
      : null;
    const pricing = this.priceDelivery(
      settings,
      etrap,
      dto.subtotal,
      new Date(),
      nearest?.distanceMeters,
    );

    return toApiResponse({
      ...pricing,
      addressLine,
      latitude: dto.latitude,
      longitude: dto.longitude,
      subtotal: dto.subtotal,
      etrap,
      welayat: etrap?.welayat ?? null,
      matched: Boolean(etrap),
      matchSource: etrap
        ? settings.mapPricingEnabled
          ? "MAP_ZONE"
          : "LEGACY_TEXT"
        : "FALLBACK",
    });
  }

  async tariffQuote(dto: QuoteDeliveryTariffDto) {
    const pricing = await this.prisma.$transaction((tx) =>
      this.resolvePricing(
        tx,
        dto.subtotal,
        dto.deliveryEtrapId ?? null,
        new Date(),
        dto.latitude !== undefined && dto.longitude !== undefined
          ? { latitude: dto.latitude, longitude: dto.longitude }
          : undefined,
      ),
    );
    return toApiResponse({ ...pricing, subtotal: dto.subtotal });
  }

  async resolvePricing(
    tx: Prisma.TransactionClient,
    subtotal: number,
    deliveryEtrapId: number | null,
    at = new Date(),
    coordinates?: DeliveryZonePoint,
    distanceMeters?: number,
  ) {
    const settings = await tx.deliverySettings.findUnique({
      where: { id: SETTINGS_ID },
    });
    if (!settings) throw new NotFoundException("Delivery settings not found");
    const usesCoordinates = settings.mapPricingEnabled && coordinates;
    const etrap = settings.distancePricingEnabled
      ? null
      : usesCoordinates
      ? findDeliveryAreaForCoordinates(
          await tx.etrap.findMany({
            where: { isDeliveryEnabled: true },
            include: { welayat: true },
          }),
          coordinates,
        )
      : deliveryEtrapId === null
        ? null
        : await tx.etrap.findUnique({
            where: { id: deliveryEtrapId },
            include: { welayat: true },
          });
    if (!settings.distancePricingEnabled && !usesCoordinates && deliveryEtrapId !== null && !etrap)
      throw new BadRequestException("Delivery etrap not found");
    if (etrap && !etrap.isDeliveryEnabled)
      throw new BadRequestException(
        "Delivery is not available for the selected etrap",
      );
    const nearest = settings.distancePricingEnabled && coordinates && distanceMeters === undefined
      ? await this.branches.findNearestActive(tx, coordinates, true)
      : null;
    return {
      ...this.priceDelivery(
        settings,
        etrap,
        subtotal,
        at,
        distanceMeters ?? nearest?.distanceMeters,
      ),
      etrap,
    };
  }

  async ignoresSelectedEtrap(tx: Prisma.TransactionClient) {
    const settings = await tx.deliverySettings.findUnique({
      where: { id: SETTINGS_ID },
      select: { mapPricingEnabled: true, distancePricingEnabled: true },
    });
    if (!settings) throw new NotFoundException("Delivery settings not found");
    return settings.mapPricingEnabled || settings.distancePricingEnabled;
  }

  private priceDelivery(
    settings: DeliverySettings,
    etrap: Etrap | null,
    subtotal: number,
    at: Date,
    distanceMeters?: number,
  ) {
    const period = resolveDeliveryPeriod(settings, at);
    const night = period.tariff === "NIGHT";
    if (settings.distancePricingEnabled) {
      if (distanceMeters === undefined)
        throw new BadRequestException(
          "Coordinates are required for kilometer delivery pricing",
        );
      const rate = Number(
        night ? settings.nightPricePerKilometer : settings.dayPricePerKilometer,
      );
      const distancePriceTiers = parseDistancePriceTiers(
        settings.distancePriceTiers,
      );
      const fee = calculateDistanceDeliveryFee(
        distanceMeters,
        rate,
        distancePriceTiers.map((tier) => ({
          afterKilometers: tier.afterKilometers,
          pricePerKilometer: night
            ? tier.nightPricePerKilometer
            : tier.dayPricePerKilometer,
        })),
      );
      return {
        ...period,
        pricingMode: "DISTANCE" as const,
        distanceMeters,
        pricePerKilometer: rate,
        distancePriceTiers,
        price: fee,
        freeDeliveryThreshold: null,
        fee,
      };
    }
    const price = Number(
      etrap
        ? night
          ? etrap.nightPrice
          : etrap.price
        : night
          ? settings.fallbackNightPrice
          : settings.fallbackPrice,
    );
    const threshold = etrap
      ? night
        ? etrap.nightFreeDeliveryThreshold
        : etrap.freeDeliveryThreshold
      : night
        ? settings.fallbackNightFreeDeliveryThreshold
        : settings.fallbackFreeDeliveryThreshold;
    const freeDeliveryThreshold = threshold === null ? null : Number(threshold);
    return {
      ...period,
      pricingMode: "AREA" as const,
      distanceMeters: null,
      pricePerKilometer: null,
      distancePriceTiers: [],
      price,
      freeDeliveryThreshold,
      fee: calculateDeliveryFee(subtotal, price, freeDeliveryThreshold),
    };
  }

  updateSettings(actor: AuthUser, dto: UpdateDeliverySettingsDto) {
    const { version, distancePriceTiers, ...fields } = dto;
    let tiers: DistancePriceTier[] | undefined;
    if (distancePriceTiers !== undefined) {
      try {
        tiers = parseDistancePriceTiers(distancePriceTiers);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : "Invalid distance price tiers",
        );
      }
    }
    const update = {
      ...fields,
      ...(tiers === undefined ? {} : { distancePriceTiers: tiers }),
    };
    const changedFields = Object.keys(update).filter(
      (key) => update[key as keyof typeof update] !== undefined,
    );
    const changesVersionedSettings = changedFields.some(
      (key) =>
        key.toLowerCase().includes("night") ||
        key === "mapPricingEnabled" ||
        key === "distancePricingEnabled" ||
        key === "distancePriceTiers" ||
        key === "dayPricePerKilometer",
    );
    if (changesVersionedSettings && version === undefined)
      throw new BadRequestException(
        "Version is required when changing delivery pricing settings",
      );
    if (!Object.values(update).some((value) => value !== undefined)) {
      throw new BadRequestException(
        "At least one delivery setting is required",
      );
    }
    return this.prisma.$transaction(async (tx) => {
      if (dto.mapPricingEnabled === true) {
        await this.lockMapConfiguration(tx);
      }
      const before = await tx.deliverySettings.findUnique({
        where: { id: SETTINGS_ID },
      });
      if (!before) throw new NotFoundException("Delivery settings not found");
      if (version !== undefined && version !== before.version)
        throw new ConflictException(
          "Delivery settings changed; reload and try again",
        );
      if (
        (dto.nightStartsAt ?? before.nightStartsAt) ===
        (dto.nightEndsAt ?? before.nightEndsAt)
      ) {
        throw new BadRequestException("Night start and end must be different");
      }
      if (
        (dto.distancePricingEnabled ?? before.distancePricingEnabled) ||
        (tiers ?? parseDistancePriceTiers(before.distancePriceTiers)).length > 0
      ) {
        if (
          (dto.dayPricePerKilometer ?? Number(before.dayPricePerKilometer)) <= 0 ||
          (dto.nightPricePerKilometer ?? Number(before.nightPricePerKilometer)) <= 0
        ) {
          throw new BadRequestException(
            "Set both day and night kilometer prices before enabling kilometer pricing",
          );
        }
      }
      if (dto.mapPricingEnabled === true) {
        await this.assertMapPricingReady(tx);
      }
      const changed = await tx.deliverySettings.updateMany({
        where: { id: SETTINGS_ID, version: before.version },
        data: { ...update, version: { increment: 1 } },
      });
      if (changed.count !== 1)
        throw new ConflictException(
          "Delivery settings changed; reload and try again",
        );
      const settings = await tx.deliverySettings.findUniqueOrThrow({
        where: { id: SETTINGS_ID },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "delivery.settings_updated",
          entityType: "DeliverySettings",
          entityId: SETTINGS_ID,
          metadata: {
            changedFields,
            previous: toApiResponse(before),
            current: toApiResponse(settings),
          },
        },
      });
      return toApiResponse(settings);
    });
  }

  createWelayat(actor: AuthUser, dto: CreateDeliveryWelayatDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertUniqueWelayat(tx, dto.nameRu, dto.nameTk);
      const welayat = await tx.welayat.create({
        data: {
          nameEn: dto.nameEn ?? null,
          nameRu: dto.nameRu,
          nameTk: dto.nameTk,
          sortOrder: dto.sortOrder ?? 0,
        },
        include: { etraps: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "delivery.welayat_created",
          entityType: "Welayat",
          entityId: String(welayat.id),
          metadata: { nameRu: welayat.nameRu, nameTk: welayat.nameTk },
        },
      });
      return toApiResponse(welayat);
    });
  }

  updateWelayat(actor: AuthUser, id: number, dto: UpdateDeliveryWelayatDto) {
    const update = {
      ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
      ...(dto.nameRu !== undefined ? { nameRu: dto.nameRu } : {}),
      ...(dto.nameTk !== undefined ? { nameTk: dto.nameTk } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
    };
    if (!Object.keys(update).length) {
      throw new BadRequestException("At least one welayat field is required");
    }
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.welayat.findUnique({ where: { id } });
      if (!before) throw new NotFoundException("Delivery welayat not found");
      await this.assertUniqueWelayat(
        tx,
        dto.nameRu ?? before.nameRu,
        dto.nameTk ?? before.nameTk,
        id,
      );
      const welayat = await tx.welayat.update({
        where: { id },
        data: update,
        include: {
          etraps: {
            orderBy: [
              { queuePosition: { sort: "asc", nulls: "last" } },
              { nameRu: "asc" },
              { id: "asc" },
            ],
          },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "delivery.welayat_updated",
          entityType: "Welayat",
          entityId: String(id),
          metadata: {
            changedFields: Object.keys(update),
            previous: toApiResponse(before),
            current: toApiResponse(welayat),
          },
        },
      });
      return toApiResponse(welayat);
    });
  }

  createEtrap(actor: AuthUser, dto: CreateDeliveryEtrapDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.deliveryZone !== undefined || dto.isDeliveryEnabled) {
        await this.lockMapConfiguration(tx);
      }
      await this.assertWelayatExists(tx, dto.welayatId);
      await this.assertUniqueEtrap(tx, dto.welayatId, dto.nameRu, dto.nameTk);
      const deliveryZone = await this.prepareDeliveryZone(
        tx,
        dto.deliveryZone,
        undefined,
        dto.isDeliveryEnabled ?? false,
      );
      if (dto.isDeliveryEnabled) {
        await this.assertZonePresentWhenMapPricingIsActive(tx, deliveryZone);
      }
      const etrap = await tx.etrap.create({
        data: {
          welayatId: dto.welayatId,
          nameEn: dto.nameEn ?? null,
          nameRu: dto.nameRu,
          nameTk: dto.nameTk,
          queuePosition: dto.queuePosition ?? null,
          price: dto.price ?? 15,
          nightPrice: dto.nightPrice ?? dto.price ?? 15,
          nightFreeDeliveryThreshold:
            dto.nightFreeDeliveryThreshold === undefined
              ? dto.freeDeliveryThreshold === undefined
                ? 150
                : dto.freeDeliveryThreshold
              : dto.nightFreeDeliveryThreshold,
          freeDeliveryThreshold:
            dto.freeDeliveryThreshold === undefined
              ? 150
              : dto.freeDeliveryThreshold,
          isDeliveryEnabled: dto.isDeliveryEnabled ?? false,
          ...(deliveryZone !== undefined ? { deliveryZone } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "delivery.etrap_created",
          entityType: "Etrap",
          entityId: String(etrap.id),
          metadata: {
            welayatId: etrap.welayatId,
            nameRu: etrap.nameRu,
            nameTk: etrap.nameTk,
          },
        },
      });
      return toApiResponse(etrap);
    });
  }

  updateEtrap(actor: AuthUser, id: number, dto: UpdateDeliveryEtrapDto) {
    if (
      (dto.nightPrice !== undefined ||
        dto.nightFreeDeliveryThreshold !== undefined ||
        dto.deliveryZone !== undefined) &&
      dto.version === undefined
    ) {
      throw new BadRequestException(
        "Version is required when changing night prices or a delivery zone",
      );
    }
    const update = {
      ...(dto.nightPrice !== undefined ? { nightPrice: dto.nightPrice } : {}),
      ...(dto.nightFreeDeliveryThreshold !== undefined
        ? { nightFreeDeliveryThreshold: dto.nightFreeDeliveryThreshold }
        : {}),
      ...(dto.welayatId !== undefined ? { welayatId: dto.welayatId } : {}),
      ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
      ...(dto.nameRu !== undefined ? { nameRu: dto.nameRu } : {}),
      ...(dto.nameTk !== undefined ? { nameTk: dto.nameTk } : {}),
      ...(dto.queuePosition !== undefined
        ? { queuePosition: dto.queuePosition }
        : {}),
      ...(dto.price !== undefined ? { price: dto.price } : {}),
      ...(dto.freeDeliveryThreshold !== undefined
        ? { freeDeliveryThreshold: dto.freeDeliveryThreshold }
        : {}),
      ...(dto.isDeliveryEnabled !== undefined
        ? { isDeliveryEnabled: dto.isDeliveryEnabled }
        : {}),
    };
    if (!Object.keys(update).length && dto.deliveryZone === undefined) {
      throw new BadRequestException("At least one etrap setting is required");
    }
    return this.prisma.$transaction(async (tx) => {
      if (
        dto.deliveryZone !== undefined ||
        dto.isDeliveryEnabled !== undefined
      ) {
        await this.lockMapConfiguration(tx);
      }
      const before = await tx.etrap.findUnique({ where: { id } });
      if (!before) throw new NotFoundException("Delivery etrap not found");
      const nextIsEnabled = dto.isDeliveryEnabled ?? before.isDeliveryEnabled;
      const nextZone =
        dto.deliveryZone === undefined
          ? deliveryZoneFromJson(before.deliveryZone)
          : dto.deliveryZone;
      const zoneToPrepare =
        dto.deliveryZone === undefined &&
        nextIsEnabled &&
        !before.isDeliveryEnabled
          ? nextZone
          : dto.deliveryZone;
      const deliveryZone = await this.prepareDeliveryZone(
        tx,
        zoneToPrepare,
        id,
        nextIsEnabled,
      );
      if (nextIsEnabled) {
        await this.assertZonePresentWhenMapPricingIsActive(
          tx,
          deliveryZone === undefined ? nextZone : deliveryZone,
        );
      }
      const nextWelayatId = dto.welayatId ?? before.welayatId;
      await this.assertWelayatExists(tx, nextWelayatId);
      await this.assertUniqueEtrap(
        tx,
        nextWelayatId,
        dto.nameRu ?? before.nameRu,
        dto.nameTk ?? before.nameTk,
        id,
      );
      if (dto.version !== undefined && dto.version !== before.version)
        throw new ConflictException(
          "Delivery etrap changed; reload and try again",
        );
      const changed = await tx.etrap.updateMany({
        where: { id, version: before.version },
        data: {
          ...update,
          ...(deliveryZone !== undefined ? { deliveryZone } : {}),
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1)
        throw new ConflictException(
          "Delivery etrap changed; reload and try again",
        );
      const etrap = await tx.etrap.findUniqueOrThrow({ where: { id } });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "delivery.etrap_updated",
          entityType: "Etrap",
          entityId: String(id),
          metadata: {
            changedFields: [
              ...Object.keys(update),
              ...(dto.deliveryZone !== undefined ? ["deliveryZone"] : []),
            ],
            previous: toApiResponse(before),
            current: toApiResponse(etrap),
          },
        },
      });
      return toApiResponse(etrap);
    });
  }

  private async assertWelayatExists(
    tx: Prisma.TransactionClient,
    welayatId: number,
  ) {
    const welayat = await tx.welayat.findUnique({
      where: { id: welayatId },
      select: { id: true },
    });
    if (!welayat) throw new NotFoundException("Delivery welayat not found");
  }

  private async prepareDeliveryZone(
    tx: Prisma.TransactionClient,
    value: DeliveryZonePoint[] | null | undefined,
    excludeId: number | undefined,
    enabled: boolean,
  ): Promise<
    Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined
  > {
    if (value === undefined) return undefined;
    if (value === null) return Prisma.DbNull;
    const normalized = normalizeDeliveryZone(value);
    const validationError = deliveryZoneValidationError(normalized);
    if (validationError) throw new BadRequestException(validationError);
    if (enabled) {
      const existing = await tx.etrap.findMany({
        where: {
          isDeliveryEnabled: true,
          ...(excludeId === undefined ? {} : { id: { not: excludeId } }),
        },
        select: { id: true, nameRu: true, deliveryZone: true },
      });
      const overlapping = existing.find((candidate) => {
        const zone = deliveryZoneFromJson(candidate.deliveryZone);
        return zone ? deliveryZonesOverlap(normalized, zone) : false;
      });
      if (overlapping) {
        throw new ConflictException(
          `Delivery zone overlaps district ${overlapping.nameRu} (${overlapping.id})`,
        );
      }
    }
    return normalized;
  }

  private async lockMapConfiguration(tx: Prisma.TransactionClient) {
    // Polygon overlap is a cross-row invariant. Serialize the small set of
    // zone/activation mutations so two administrators cannot both validate
    // against stale boundaries and commit overlapping enabled zones.
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(2026, 92201) IS NULL AS locked
    `;
  }

  private async assertZonePresentWhenMapPricingIsActive(
    tx: Prisma.TransactionClient,
    value:
      | DeliveryZonePoint[]
      | Prisma.InputJsonValue
      | Prisma.NullableJsonNullValueInput
      | null
      | undefined,
  ) {
    const settings = await tx.deliverySettings.findUnique({
      where: { id: SETTINGS_ID },
      select: { mapPricingEnabled: true },
    });
    if (!settings?.mapPricingEnabled) return;
    const zone = deliveryZoneFromJson(value);
    if (!zone || deliveryZoneValidationError(zone)) {
      throw new BadRequestException(
        "An enabled district requires a valid map zone while map pricing is active",
      );
    }
  }

  private async assertMapPricingReady(tx: Prisma.TransactionClient) {
    const enabled = await tx.etrap.findMany({
      where: { isDeliveryEnabled: true },
      select: { id: true, nameRu: true, deliveryZone: true },
      orderBy: { id: "asc" },
    });
    const zoned = enabled.flatMap((etrap) => {
      const { deliveryZone } = etrap;
      const zone = deliveryZoneFromJson(deliveryZone);
      return zone && !deliveryZoneValidationError(zone)
        ? [{ ...etrap, zone }]
        : [];
    });
    if (!zoned.length) {
      throw new BadRequestException(
        "Map pricing requires at least one enabled tariff zone with a valid boundary",
      );
    }
    for (let left = 0; left < zoned.length; left += 1) {
      for (let right = left + 1; right < zoned.length; right += 1) {
        if (!deliveryZonesOverlap(zoned[left]!.zone, zoned[right]!.zone)) {
          continue;
        }
        throw new ConflictException(
          `Delivery zones overlap: ${zoned[left]!.nameRu} (${zoned[left]!.id}) and ${zoned[right]!.nameRu} (${zoned[right]!.id})`,
        );
      }
    }
  }

  private async assertUniqueWelayat(
    tx: Prisma.TransactionClient,
    nameRu: string,
    nameTk: string,
    excludeId?: number,
  ) {
    const duplicate = await tx.welayat.findFirst({
      where: {
        ...(excludeId === undefined ? {} : { id: { not: excludeId } }),
        OR: [{ nameRu }, { nameTk }],
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(
        "A welayat with the same Russian or Turkmen name already exists",
      );
    }
  }

  private async assertUniqueEtrap(
    tx: Prisma.TransactionClient,
    welayatId: number,
    nameRu: string,
    nameTk: string,
    excludeId?: number,
  ) {
    const duplicate = await tx.etrap.findFirst({
      where: {
        welayatId,
        ...(excludeId === undefined ? {} : { id: { not: excludeId } }),
        OR: [{ nameRu }, { nameTk }],
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(
        "An etrap with the same Russian or Turkmen name already exists in this welayat",
      );
    }
  }

  private async getConfig(enabledOnly: boolean) {
    const [settings, welayats] = await this.prisma.$transaction([
      this.prisma.deliverySettings.findUnique({ where: { id: SETTINGS_ID } }),
      this.prisma.welayat.findMany({
        where: enabledOnly
          ? { etraps: { some: { isDeliveryEnabled: true } } }
          : undefined,
        include: {
          etraps: {
            where: enabledOnly ? { isDeliveryEnabled: true } : undefined,
            orderBy: [
              { queuePosition: { sort: "asc", nulls: "last" } },
              { nameRu: "asc" },
              { id: "asc" },
            ],
          },
        },
        orderBy: [{ sortOrder: "asc" }, { nameRu: "asc" }],
      }),
    ]);
    if (!settings) throw new NotFoundException("Delivery settings not found");
    return toApiResponse({
      mapPricingEnabled: settings.mapPricingEnabled,
      distancePricingEnabled: settings.distancePricingEnabled,
      dayPricePerKilometer: settings.dayPricePerKilometer,
      nightPricePerKilometer: settings.nightPricePerKilometer,
      distancePriceTiers: parseDistancePriceTiers(settings.distancePriceTiers),
      fallbackPrice: settings.fallbackPrice,
      fallbackFreeDeliveryThreshold: settings.fallbackFreeDeliveryThreshold,
      fallbackNightPrice: settings.fallbackNightPrice,
      fallbackNightFreeDeliveryThreshold:
        settings.fallbackNightFreeDeliveryThreshold,
      nightTariffEnabled: settings.nightTariffEnabled,
      nightStartsAt: settings.nightStartsAt,
      nightEndsAt: settings.nightEndsAt,
      version: settings.version,
      timeZone: DELIVERY_TIME_ZONE,
      welayats,
    });
  }
}
