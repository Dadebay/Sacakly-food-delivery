import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Role } from "../generated/prisma/client";

type CafeItem = { cafeId: string };
type Membership = {
  userId: string;
  cafeId: string;
  role: Role;
  isActive: boolean;
};
type OwnerActor = { id: string; phone: string; role: Role; isActive: boolean };
type OwnerEntitlement = { userId: string; phone: string; isActive: boolean };
type CafeModule = { cafeId: string; enabled: boolean };
type CourierApplication = { userId: string; status: string };

export function requireSingleCafe(items: readonly CafeItem[]): string {
  const cafeId = items[0]?.cafeId;
  if (!cafeId || items.some((item) => item.cafeId !== cafeId)) {
    throw new BadRequestException("An order must contain products from one cafe");
  }
  return cafeId;
}

export function assertCafeMember(
  userId: string,
  cafeId: string,
  membership: Membership | null,
  allowedRoles: readonly Role[],
): void {
  if (
    !membership?.isActive ||
    membership.userId !== userId ||
    membership.cafeId !== cafeId ||
    !allowedRoles.includes(membership.role)
  ) {
    throw new ForbiddenException("Cafe access denied");
  }
}

export function assertPlatformOwner(
  actor: OwnerActor,
  entitlement: OwnerEntitlement | null,
  configuredPhone: string,
): void {
  if (
    !actor.isActive ||
    actor.role !== Role.SUPER_ADMIN ||
    !configuredPhone ||
    actor.phone !== configuredPhone ||
    !entitlement?.isActive ||
    entitlement.userId !== actor.id ||
    entitlement.phone !== configuredPhone
  ) {
    throw new ForbiddenException("Platform owner access denied");
  }
}

export function assertModuleEnabled(
  module: CafeModule | null,
  cafeId: string,
): void {
  if (!module?.enabled || module.cafeId !== cafeId) {
    throw new ForbiddenException("Cafe module is disabled");
  }
}

export function assertApprovedCourier(
  application: CourierApplication | null,
  userId: string,
): void {
  if (application?.userId !== userId || application.status !== "APPROVED") {
    throw new ForbiddenException("Courier is not approved");
  }
}
