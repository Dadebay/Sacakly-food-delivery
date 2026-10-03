import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import type { AuthUser } from "../common/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateOrderingHoursDto } from "./ordering-hours.dto";

const timezone = "Asia/Ashgabat";

export function orderingIsOpen(
  enabled: boolean,
  opensAt: string,
  closesAt: string,
  now: Date,
): boolean {
  if (!enabled) return true;
  const current = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return opensAt < closesAt
    ? current >= opensAt && current < closesAt
    : current >= opensAt || current < closesAt;
}

@Injectable()
export class OrderingHoursService {
  constructor(private readonly prisma: PrismaService) {}

  private response(
    settings: {
      enabled: boolean;
      opensAt: string;
      closesAt: string;
      version: number;
    } | null,
    now: Date,
  ) {
    const value = settings ?? {
      enabled: false,
      opensAt: "09:00",
      closesAt: "22:00",
      version: 0,
    };
    return {
      enabled: value.enabled,
      opensAt: value.opensAt,
      closesAt: value.closesAt,
      version: value.version,
      timezone,
      isOpen: orderingIsOpen(value.enabled, value.opensAt, value.closesAt, now),
      serverTime: now.toISOString(),
    };
  }

  async get() {
    return this.response(
      await this.prisma.orderingHoursSettings.findUnique({
        where: { id: "default" },
      }),
      new Date(),
    );
  }

  async assertOpen(tx: Prisma.TransactionClient) {
    const settings = await tx.orderingHoursSettings.findUnique({
      where: { id: "default" },
    });
    if (
      settings &&
      !orderingIsOpen(
        settings.enabled,
        settings.opensAt,
        settings.closesAt,
        new Date(),
      )
    ) {
      throw new ConflictException(
        "Ordering is closed for the current working hours",
      );
    }
  }

  async update(actor: AuthUser, dto: UpdateOrderingHoursDto) {
    if (dto.enabled && dto.opensAt === dto.closesAt)
      throw new BadRequestException("Opening and closing times must differ");
    return this.prisma
      .$transaction(async (tx) => {
        const current = await tx.orderingHoursSettings.findUnique({
          where: { id: "default" },
        });
        if ((current?.version ?? 0) !== dto.version)
          throw new ConflictException(
            "Working hours changed; reload and try again",
          );
        const data = {
          enabled: dto.enabled,
          opensAt: dto.opensAt,
          closesAt: dto.closesAt,
        };
        const settings = current
          ? await tx.orderingHoursSettings.update({
              where: { id: "default", version: dto.version },
              data: { ...data, version: { increment: 1 } },
            })
          : await tx.orderingHoursSettings.create({
              data: { id: "default", ...data },
            });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "ordering-hours.updated",
            entityType: "OrderingHoursSettings",
            entityId: "default",
            metadata: {
              before: current
                ? {
                    enabled: current.enabled,
                    opensAt: current.opensAt,
                    closesAt: current.closesAt,
                  }
                : null,
              after: data,
            },
          },
        });
        return this.response(settings, new Date());
      })
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ["P2002", "P2025", "P2034"].includes(error.code)
        )
          throw new ConflictException(
            "Working hours changed; reload and try again",
          );
        throw error;
      });
  }
}
