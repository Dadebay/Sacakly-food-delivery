import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type UserAddress } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateAddressDto, UpdateAddressDto } from "./addresses.dto";

const MAX_ADDRESSES_PER_USER = 100;

export type OrderAddressInput = {
  addressId?: string;
  deliveryEtrapId?: number;
  addressLabel?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  entrance?: string;
  floor?: string;
  apartment?: string;
};

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.userAddress.findMany({
      where: { userId },
      orderBy: [
        { isActive: "desc" },
        { lastUsedAt: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ],
    });
  }

  create(userId: string, dto: CreateAddressDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      await this.assertCapacity(tx, userId);
      await this.assertDeliveryEtrap(tx, dto.deliveryEtrapId);
      await tx.userAddress.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false },
      });
      const address = await tx.userAddress.create({
        data: {
          userId,
          deliveryEtrapId: dto.deliveryEtrapId,
          label: dto.label,
          address: dto.address,
          latitude: dto.latitude,
          longitude: dto.longitude,
          entrance: dto.entrance,
          floor: dto.floor,
          apartment: dto.apartment,
          isActive: true,
        },
      });
      await this.audit(tx, userId, "address.created", address.id);
      return address;
    });
  }

  async update(userId: string, id: string, dto: UpdateAddressDto) {
    if (!Object.values(dto).some((value) => value !== undefined)) {
      throw new BadRequestException("At least one address field is required");
    }

    return this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      await this.findOwned(tx, userId, id);
      await this.assertDeliveryEtrap(tx, dto.deliveryEtrapId);
      const address = await tx.userAddress.update({
        where: { id },
        data: this.addressData(dto),
      });
      await this.audit(tx, userId, "address.updated", id);
      return address;
    });
  }

  activate(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      await this.findOwned(tx, userId, id);
      await tx.userAddress.updateMany({
        where: { userId, isActive: true, id: { not: id } },
        data: { isActive: false },
      });
      const address = await tx.userAddress.update({
        where: { id },
        data: { isActive: true },
      });
      await this.audit(tx, userId, "address.activated", id);
      return address;
    });
  }

  remove(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const address = await this.findOwned(tx, userId, id);
      await tx.userAddress.delete({ where: { id } });

      if (address.isActive) {
        const next = await tx.userAddress.findFirst({
          where: { userId },
          orderBy: [
            { lastUsedAt: { sort: "desc", nulls: "last" } },
            { createdAt: "desc" },
          ],
        });
        if (next) {
          await tx.userAddress.update({
            where: { id: next.id },
            data: { isActive: true },
          });
        }
      }

      await this.audit(tx, userId, "address.deleted", id);
    });
  }

  async selectForOrder(
    tx: Prisma.TransactionClient,
    userId: string,
    input: OrderAddressInput,
    actorId = userId,
  ): Promise<UserAddress> {
    const inlineFields = [
      input.addressLabel,
      input.address,
      input.latitude,
      input.longitude,
      input.entrance,
      input.floor,
      input.apartment,
    ];
    const hasInlineAddress = inlineFields.some((value) => value != null);

    if (input.addressId && hasInlineAddress) {
      throw new BadRequestException(
        "Provide addressId or a new address, not both",
      );
    }
    if (
      hasInlineAddress &&
      (!input.address ||
        input.latitude == null ||
        input.longitude == null)
    ) {
      throw new BadRequestException(
        "A new address requires address, latitude and longitude",
      );
    }

    await this.lockUser(tx, userId);
    await this.assertDeliveryEtrap(tx, input.deliveryEtrapId);

    if (input.addressId) {
      await this.findOwned(tx, userId, input.addressId);
      await tx.userAddress.updateMany({
        where: { userId, isActive: true, id: { not: input.addressId } },
        data: { isActive: false },
      });
      const selected = await tx.userAddress.update({
        where: { id: input.addressId },
        data: {
          isActive: true,
          lastUsedAt: new Date(),
          ...(input.deliveryEtrapId !== undefined
            ? { deliveryEtrapId: input.deliveryEtrapId }
            : {}),
        },
      });
      await this.audit(tx, actorId, "address.used_for_order", selected.id);
      return selected;
    }

    if (!hasInlineAddress) {
      const active = await tx.userAddress.findFirst({
        where: { userId, isActive: true },
      });
      if (!active) {
        throw new BadRequestException(
          "Create or select a delivery address before ordering",
        );
      }
      const selected = await tx.userAddress.update({
        where: { id: active.id },
        data: {
          lastUsedAt: new Date(),
          ...(input.deliveryEtrapId !== undefined
            ? { deliveryEtrapId: input.deliveryEtrapId }
            : {}),
        },
      });
      await this.audit(tx, actorId, "address.used_for_order", selected.id);
      return selected;
    }

    // Mobile clients can submit the same inline address on every checkout.
    // Compare at PostgreSQL's coordinate precision before consuming a slot.
    const candidates = await tx.userAddress.findMany({
      where: {
        userId,
        latitude: new Prisma.Decimal(input.latitude!).toDecimalPlaces(7),
        longitude: new Prisma.Decimal(input.longitude!).toDecimalPlaces(7),
      },
      orderBy: [
        { isActive: "desc" },
        { lastUsedAt: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
        { id: "asc" },
      ],
    });
    const normalize = (value: string | null | undefined) => value?.trim() || null;
    const existing = candidates.find((candidate) =>
      (["address", "entrance", "floor", "apartment"] as const).every(
        (field) => normalize(candidate[field]) === normalize(input[field]),
      ),
    );
    if (existing) {
      await tx.userAddress.updateMany({
        where: { userId, isActive: true, id: { not: existing.id } },
        data: { isActive: false },
      });
      const selected = await tx.userAddress.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          lastUsedAt: new Date(),
          // Inline checkout owns the current quote; an omitted match means
          // fallback pricing, even if this saved address had an older etrap.
          deliveryEtrapId: input.deliveryEtrapId ?? null,
        },
      });
      await this.audit(tx, actorId, "address.used_for_order", selected.id);
      return selected;
    }

    await this.assertCapacity(tx, userId);
    await tx.userAddress.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });
    const created = await tx.userAddress.create({
      data: {
        userId,
        deliveryEtrapId: input.deliveryEtrapId,
        label: input.addressLabel,
        address: input.address!,
        latitude: input.latitude!,
        longitude: input.longitude!,
        entrance: input.entrance,
        floor: input.floor,
        apartment: input.apartment,
        isActive: true,
        lastUsedAt: new Date(),
      },
    });
    await this.audit(tx, actorId, "address.created_from_order", created.id);
    return created;
  }

  private addressData(dto: UpdateAddressDto) {
    return {
      ...(dto.deliveryEtrapId !== undefined
        ? { deliveryEtrapId: dto.deliveryEtrapId }
        : {}),
      ...(dto.label !== undefined ? { label: dto.label } : {}),
      ...(dto.address !== undefined ? { address: dto.address } : {}),
      ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
      ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
      ...(dto.entrance !== undefined ? { entrance: dto.entrance } : {}),
      ...(dto.floor !== undefined ? { floor: dto.floor } : {}),
      ...(dto.apartment !== undefined ? { apartment: dto.apartment } : {}),
    };
  }

  private async lockUser(tx: Prisma.TransactionClient, userId: string) {
    await tx.$queryRaw`
      SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE
    `;
  }

  private async assertCapacity(tx: Prisma.TransactionClient, userId: string) {
    const count = await tx.userAddress.count({ where: { userId } });
    if (count >= MAX_ADDRESSES_PER_USER) {
      throw new BadRequestException(
        `A user can store up to ${MAX_ADDRESSES_PER_USER} addresses`,
      );
    }
  }

  private async assertDeliveryEtrap(
    tx: Prisma.TransactionClient,
    deliveryEtrapId: number | undefined,
  ) {
    if (deliveryEtrapId === undefined) return;
    const etrap = await tx.etrap.findUnique({
      where: { id: deliveryEtrapId },
      select: { isDeliveryEnabled: true },
    });
    if (!etrap?.isDeliveryEnabled) {
      throw new BadRequestException(
        "Delivery is not available for the selected etrap",
      );
    }
  }

  private async findOwned(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
  ) {
    const address = await tx.userAddress.findFirst({
      where: { id, userId },
    });
    if (!address) throw new NotFoundException("Address not found");
    return address;
  }

  private audit(
    tx: Prisma.TransactionClient,
    userId: string,
    action: string,
    addressId: string,
  ) {
    return tx.auditLog.create({
      data: {
        actorId: userId,
        action,
        entityType: "UserAddress",
        entityId: addressId,
      },
    });
  }
}
