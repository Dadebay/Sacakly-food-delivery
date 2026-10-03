import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { toApiResponse } from "../common/api-response";
import type { AuthUser } from "../common/auth.types";
import { Prisma, PushDevicePlatform } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { compareAppVersions, isAppStoreUrl } from "./app-version-policy";
import type { SaveAppVersionDto } from "./app-versions.dto";

const conflict = () =>
  new ConflictException(
    "Версии приложения изменены другим администратором. Обновите данные и повторите сохранение.",
  );

@Injectable()
export class AppVersionsService {
  constructor(private readonly prisma: PrismaService) {}

  async publicVersion(platform: PushDevicePlatform) {
    const policy = await this.prisma.appVersion.findUnique({
      where: { platform },
      select: {
        latestVersion: true,
        minSupportedVersion: true,
        storeUrl: true,
        releaseNotesRu: true,
        releaseNotesTk: true,
      },
    });
    if (!policy)
      throw new NotFoundException("App version policy is not configured");
    return policy;
  }

  async list() {
    return toApiResponse(
      await this.prisma.appVersion.findMany({ orderBy: { platform: "asc" } }),
    );
  }

  async save(
    actor: AuthUser,
    platform: PushDevicePlatform,
    dto: SaveAppVersionDto,
  ) {
    if (compareAppVersions(dto.minSupportedVersion, dto.latestVersion) > 0)
      throw new BadRequestException(
        "Минимальная версия не может быть выше последней.",
      );
    if (!isAppStoreUrl(platform, dto.storeUrl))
      throw new BadRequestException(
        "Укажите HTTPS-ссылку на приложение в магазине выбранной платформы: Play Store для com.gurbanov.alowalow или App Store с числовым ID.",
      );
    try {
      return await this.prisma.$transaction(async (tx) => {
        const before = await tx.appVersion.findUnique({ where: { platform } });
        if (dto.version !== (before?.version ?? 0)) throw conflict();
        const minimumIncreased =
          compareAppVersions(
            dto.minSupportedVersion,
            before?.minSupportedVersion ?? "0.0.0",
          ) > 0;
        if (minimumIncreased && dto.confirmMinimumIncrease !== true)
          throw new BadRequestException(
            "Подтвердите блокировку пользователей устаревших версий.",
          );
        const data = {
          latestVersion: dto.latestVersion,
          minSupportedVersion: dto.minSupportedVersion,
          storeUrl: dto.storeUrl,
          releaseNotesRu: dto.releaseNotesRu?.trim() || null,
          releaseNotesTk: dto.releaseNotesTk?.trim() || null,
        };
        if (before) {
          const changed = await tx.appVersion.updateMany({
            where: { platform, version: dto.version },
            data: { ...data, version: { increment: 1 } },
          });
          if (changed.count !== 1) throw conflict();
        } else {
          await tx.appVersion.create({ data: { platform, ...data } });
        }
        const after = await tx.appVersion.findUniqueOrThrow({
          where: { platform },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "app_version.saved",
            entityType: "AppVersion",
            entityId: platform,
            metadata: {
              previous: before ? toApiResponse(before) : null,
              current: toApiResponse(after),
              publishedConfirmed: dto.publishedConfirmed,
              minimumIncreased,
              minimumIncreaseConfirmed: dto.confirmMinimumIncrease === true,
            },
          },
        });
        return toApiResponse(after);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2002", "P2034"].includes(error.code)
      )
        throw conflict();
      throw error;
    }
  }
}
