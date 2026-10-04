import {
  BadRequestException,
  ConflictException,
  Injectable,
  ForbiddenException,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import type { AppEnv } from "../config/env";
import { toApiResponse } from "../common/api-response";
import type { AuthUser } from "../common/auth.types";
import {
  AdminPage,
  DirectPushStatus,
  NotificationAudience,
  NotificationCampaignStatus,
  Prisma,
  NotificationDeliveryStatus,
  Role,
} from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateNotificationCampaignDto,
  ListMyNotificationsQueryDto,
  ListNotificationCampaignsQueryDto,
  PUSH_INSTALLATION_ID_PATTERN,
  RegisterPushDeviceDto,
} from "./notifications.dto";
import { PushGateway } from "./push.gateway";
import { PUBLIC_BROADCAST_TOPIC, topicMessageFits } from "./topic-message";

const campaignInclude = {
  createdBy: {
    select: {
      id: true,
      phone: true,
      firstName: true,
      lastName: true,
    },
  },
} as const;

const STALE_SENDING_MS = 15 * 60 * 1000;
const DIRECT_PUSH_LEASE_MS = 60_000;
const DIRECT_PUSH_MAX_ATTEMPTS = 5;

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private dispatchInProgress = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushGateway,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async onModuleInit() {
    await this.requeueStaleCampaigns();
    this.timer = setInterval(
      () => {
        void this.dispatchPendingCampaigns();
        void this.dispatchDueDirectPushes().catch((error: unknown) => this.logger.error(error));
      },
      this.config.get("PUSH_DISPATCH_INTERVAL_MS", { infer: true }),
    );
    this.timer.unref();
    void this.dispatchPendingCampaigns();
    void this.dispatchDueDirectPushes().catch((error: unknown) => this.logger.error(error));
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Persist first, then attempt FCM. Provider failures never roll back the order. */
  async sendDirectPush(
    userId: string,
    message: { title: string; body: string },
    options: { eventKey?: string; offerOrderId?: string } = {},
  ) {
    try {
      const eventKey = options.eventKey ?? `direct:${randomUUID()}`;
      const event = await this.prisma.directPushEvent.upsert({
        where: { eventKey },
        create: {
          eventKey, userId, title: message.title, body: message.body,
          offerOrderId: options.offerOrderId ?? null,
        },
        update: {},
      });
      if (event.userId !== userId || event.title !== message.title || event.body !== message.body || event.offerOrderId !== (options.offerOrderId ?? null)) {
        this.logger.warn(`Direct push event key collision: ${eventKey}`);
        return;
      }
      await this.deliverDirectPush(event.id);
    } catch (error) {
      const detail =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : "unknown provider error";
      this.logger.warn(`Direct push to user ${userId} failed: ${detail}`);
      // The order transition is committed independently of push delivery.
    }
  }

  async dispatchDueDirectPushes(now = new Date()) {
    await this.prisma.directPushEvent.updateMany({
      where: { status: DirectPushStatus.PROCESSING, leaseExpiresAt: { lte: now } },
      data: { status: DirectPushStatus.PENDING, leaseExpiresAt: null, nextAttemptAt: now },
    });
    const due = await this.prisma.directPushEvent.findMany({
      where: { status: DirectPushStatus.PENDING, nextAttemptAt: { lte: now } },
      select: { id: true }, orderBy: { createdAt: "asc" }, take: 100,
    });
    for (let offset = 0; offset < due.length; offset += 10) {
      await Promise.allSettled(due.slice(offset, offset + 10).map(({ id }) => this.deliverDirectPush(id, now)));
    }
  }

  private async deliverDirectPush(id: string, now = new Date()) {
    const claimed = await this.prisma.directPushEvent.updateMany({
      where: { id, status: DirectPushStatus.PENDING, nextAttemptAt: { lte: now } },
      data: { status: DirectPushStatus.PROCESSING, attempts: { increment: 1 }, leaseExpiresAt: new Date(now.getTime() + DIRECT_PUSH_LEASE_MS) },
    });
    if (claimed.count !== 1) return;
    const event = await this.prisma.directPushEvent.findUniqueOrThrow({ where: { id } });
    try {
      if (event.offerOrderId) {
        const offer = await this.prisma.marketplaceDeliveryRequest.findUnique({ where: { orderId: event.offerOrderId }, select: { status: true } });
        if (offer?.status !== "OFFERED") {
          await this.prisma.directPushEvent.update({ where: { id }, data: { status: DirectPushStatus.CANCELLED, leaseExpiresAt: null } });
          return;
        }
      }
      const sentIds = new Set(Array.isArray(event.sentDeviceIds) ? event.sentDeviceIds.filter((value): value is string => typeof value === "string") : []);
      const devices = await this.prisma.pushDevice.findMany({
        where: { userId: event.userId, isActive: true, user: { isActive: true } },
        select: { id: true, installationId: true },
      });
      const pending = devices.filter((device) => !sentIds.has(device.id));
      if (!pending.length) {
        await this.prisma.directPushEvent.update({ where: { id }, data: { status: sentIds.size ? DirectPushStatus.SENT : DirectPushStatus.FAILED, leaseExpiresAt: null, lastError: sentIds.size ? null : "NO_ACTIVE_DEVICE", sentAt: sentIds.size ? now : null } });
        return;
      }
      const results = await this.push.send(
        { campaignId: `direct:${event.id}`, title: event.title, body: event.body, deepLink: null },
        pending.map((device) => ({ deliveryId: device.id, installationId: device.installationId, notificationId: event.notificationId })),
      );
      const invalid = results.filter((result) => result.invalidInstallation).map((result) => result.deliveryId);
      if (invalid.length) await this.prisma.pushDevice.updateMany({ where: { id: { in: invalid } }, data: { isActive: false } });
      for (const result of results) if (result.ok) sentIds.add(result.deliveryId);
      const transient = pending.filter((device) => !sentIds.has(device.id) && !invalid.includes(device.id));
      const shouldRetry = transient.length > 0 && event.attempts < DIRECT_PUSH_MAX_ATTEMPTS;
      const status = shouldRetry ? DirectPushStatus.PENDING : transient.length || !sentIds.size ? DirectPushStatus.FAILED : DirectPushStatus.SENT;
      await this.prisma.directPushEvent.update({ where: { id }, data: {
        status, sentDeviceIds: [...sentIds], leaseExpiresAt: null,
        nextAttemptAt: new Date(now.getTime() + Math.min(300_000, 2_000 * 2 ** event.attempts)),
        lastError: transient.length ? (results.find((result) => !result.ok && !result.invalidInstallation)?.errorCode ?? "FCM_UNAVAILABLE") : null,
        providerMessageId: results.find((result) => result.ok)?.providerMessageId ?? event.providerMessageId,
        sentAt: status === DirectPushStatus.SENT ? now : null,
      } });
    } catch (error) {
      const detail = error instanceof Error ? error.message.slice(0, 160) : "FCM_UNAVAILABLE";
      await this.prisma.directPushEvent.update({ where: { id }, data: {
        status: event.attempts < DIRECT_PUSH_MAX_ATTEMPTS ? DirectPushStatus.PENDING : DirectPushStatus.FAILED,
        leaseExpiresAt: null,
        nextAttemptAt: new Date(now.getTime() + Math.min(300_000, 2_000 * 2 ** event.attempts)),
        lastError: detail,
      } });
    }
  }

  async registerDevice(actor: AuthUser, dto: RegisterPushDeviceDto) {
    const now = new Date();
    const device = await this.prisma.pushDevice.upsert({
      where: { installationId: dto.installationId },
      create: {
        userId: actor.id,
        installationId: dto.installationId,
        platform: dto.platform,
        appVersion: dto.appVersion?.trim() || null,
        locale: dto.locale?.trim() || null,
        lastSeenAt: now,
      },
      update: {
        userId: actor.id,
        platform: dto.platform,
        appVersion: dto.appVersion?.trim() || null,
        locale: dto.locale?.trim() || null,
        isActive: true,
        lastSeenAt: now,
      },
      select: {
        id: true,
        installationId: true,
        platform: true,
        appVersion: true,
        locale: true,
        isActive: true,
        lastSeenAt: true,
      },
    });
    return toApiResponse(device);
  }

  async unregisterDevice(actor: AuthUser, installationId: string) {
    if (!PUSH_INSTALLATION_ID_PATTERN.test(installationId)) {
      throw new BadRequestException("Invalid push installation ID");
    }
    const updated = await this.prisma.pushDevice.updateMany({
      where: { userId: actor.id, installationId, isActive: true },
      data: { isActive: false, lastSeenAt: new Date() },
    });
    if (!updated.count) throw new NotFoundException("Push device not found");
  }

  async myNotifications(actor: AuthUser, query: ListMyNotificationsQueryDto) {
    const where = { userId: actor.id };
    const [items, total, unread] = await Promise.all([
      this.prisma.userNotification.findMany({
        where,
        include: {
          campaign: {
            select: { title: true, body: true, deepLink: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.userNotification.count({ where }),
      this.prisma.userNotification.count({
        where: { ...where, readAt: null },
      }),
    ]);
    return toApiResponse({
      items: items.map(({ campaign, ...item }) => ({
        ...item,
        title: campaign.title,
        body: campaign.body,
        deepLink: campaign.deepLink,
      })),
      total,
      unread,
      page: query.page,
      limit: query.limit,
      pages: Math.ceil(total / query.limit),
    });
  }

  async unreadCount(actor: AuthUser) {
    return {
      unread: await this.prisma.userNotification.count({
        where: { userId: actor.id, readAt: null },
      }),
    };
  }

  async markRead(actor: AuthUser, id: string) {
    const notification = await this.prisma.userNotification.findFirst({
      where: { id, userId: actor.id },
    });
    if (!notification) {
      throw new NotFoundException("Notification not found");
    }
    if (notification.readAt) {
      return toApiResponse({
        id: notification.id,
        readAt: notification.readAt,
      });
    }
    const updated = await this.prisma.userNotification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    return toApiResponse({ id: updated.id, readAt: updated.readAt });
  }

  async markAllRead(actor: AuthUser) {
    const result = await this.prisma.userNotification.updateMany({
      where: { userId: actor.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  private campaignResponse(
    campaign: Prisma.NotificationCampaignGetPayload<{
      include: typeof campaignInclude;
    }>,
  ) {
    const topic =
      campaign.audience === NotificationAudience.ALL_APP_INSTALLATIONS;
    return toApiResponse({
      id: campaign.id,
      createdById: campaign.createdById,
      title: campaign.title,
      body: campaign.body,
      deepLink: campaign.deepLink,
      audience: campaign.audience,
      status: campaign.status,
      topic: campaign.topic,
      topicMessageId: campaign.topicMessageId,
      topicErrorCode: campaign.topicErrorCode,
      intendedUserCount: topic ? null : campaign.intendedUserCount,
      deviceCount: topic ? null : campaign.deviceCount,
      sentCount: topic ? null : campaign.sentCount,
      failedCount: topic ? null : campaign.failedCount,
      startedAt: campaign.startedAt,
      completedAt: campaign.completedAt,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
      createdBy: campaign.createdBy,
    });
  }

  private assertCampaignAdministrator(actor: AuthUser) {
    if (
      actor.role !== Role.ADMIN &&
      actor.role !== Role.SUPER_ADMIN &&
      !actor.expandedAdminPages.includes(AdminPage.NOTIFICATIONS)
    ) {
      throw new ForbiddenException("Only administrators may send campaigns");
    }
  }

  private async existingCampaign(
    actor: AuthUser,
    dto: CreateNotificationCampaignDto,
  ) {
    if (!dto.idempotencyKey) return null;
    const existing = await this.prisma.notificationCampaign.findUnique({
      where: {
        createdById_idempotencyKey: {
          createdById: actor.id,
          idempotencyKey: dto.idempotencyKey,
        },
      },
      include: campaignInclude,
    });
    if (
      existing &&
      (existing.title !== dto.title.trim() ||
        existing.body !== dto.body.trim() ||
        existing.deepLink !== (dto.deepLink?.trim() || null) ||
        existing.audience !== dto.audience)
    ) {
      throw new ConflictException(
        "Idempotency key already used for different campaign content",
      );
    }
    return existing;
  }

  async createCampaign(actor: AuthUser, dto: CreateNotificationCampaignDto) {
    this.assertCampaignAdministrator(actor);
    const id = randomUUID();
    const isTopic = dto.audience === NotificationAudience.ALL_APP_INSTALLATIONS;
    if (isTopic && !dto.idempotencyKey)
      throw new BadRequestException(
        "Topic campaign requires an idempotency key",
      );
    if (
      isTopic &&
      !topicMessageFits({
        campaignId: id,
        title: dto.title.trim(),
        body: dto.body.trim(),
        deepLink: dto.deepLink?.trim() || null,
      })
    ) {
      throw new BadRequestException(
        "Сообщение для всех устройств слишком длинное. Сократите заголовок, текст или ссылку.",
      );
    }
    const existing = await this.existingCampaign(actor, dto);
    if (existing) return this.campaignResponse(existing);
    try {
      const campaign = await this.prisma.$transaction(async (tx) => {
        const created = await tx.notificationCampaign.create({
          data: {
            id,
            createdById: actor.id,
            title: dto.title.trim(),
            body: dto.body.trim(),
            deepLink: dto.deepLink?.trim() || null,
            audience: dto.audience,
            topic: isTopic ? PUBLIC_BROADCAST_TOPIC : null,
            idempotencyKey: dto.idempotencyKey,
          },
          include: campaignInclude,
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "notification.campaign.created",
            entityType: "NotificationCampaign",
            entityId: created.id,
            metadata: {
              title: created.title,
              body: created.body,
              deepLink: created.deepLink,
              audience: created.audience,
              topic: created.topic,
            },
          },
        });
        return created;
      });
      queueMicrotask(() => void this.dispatchPendingCampaigns());
      return this.campaignResponse(campaign);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const previous = await this.existingCampaign(actor, dto);
        if (previous) return this.campaignResponse(previous);
      }
      throw error;
    }
  }

  async campaigns(query: ListNotificationCampaignsQueryDto) {
    const [items, total] = await Promise.all([
      this.prisma.notificationCampaign.findMany({
        include: campaignInclude,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.notificationCampaign.count(),
    ]);
    return toApiResponse({
      items: items.map((item) => this.campaignResponse(item)),
      total,
      page: query.page,
      limit: query.limit,
      pages: Math.ceil(total / query.limit),
    });
  }

  async retryCampaign(actor: AuthUser, id: string) {
    this.assertCampaignAdministrator(actor);
    const campaign = await this.prisma.notificationCampaign.findUnique({
      where: { id },
      include: campaignInclude,
    });
    if (!campaign) throw new NotFoundException("Campaign not found");
    if (
      campaign.status !== NotificationCampaignStatus.FAILED &&
      campaign.status !== NotificationCampaignStatus.PARTIAL
    ) {
      throw new ConflictException("Only failed campaigns can be retried");
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.notificationCampaign.updateMany({
        where: { id, status: campaign.status, updatedAt: campaign.updatedAt },
        data: {
          status: NotificationCampaignStatus.PENDING,
          completedAt: null,
          failedCount: 0,
          topicMessageId: null,
          topicErrorCode: null,
          dispatchToken: null,
        },
      });
      if (!claimed.count)
        throw new ConflictException("Campaign changed; reload before retrying");
      await tx.notificationDelivery.updateMany({
        where: {
          campaignId: id,
          status: NotificationDeliveryStatus.FAILED,
          device: { isActive: true },
        },
        data: {
          status: NotificationDeliveryStatus.PENDING,
          errorCode: null,
          providerMessageId: null,
          attemptedAt: null,
        },
      });
      const next = await tx.notificationCampaign.findUniqueOrThrow({
        where: { id },
        include: campaignInclude,
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "notification.campaign.retry_requested",
          entityType: "NotificationCampaign",
          entityId: id,
        },
      });
      return next;
    });
    queueMicrotask(() => void this.dispatchPendingCampaigns());
    return this.campaignResponse(updated);
  }

  private async requeueStaleCampaigns() {
    await this.prisma.notificationCampaign.updateMany({
      where: {
        status: NotificationCampaignStatus.SENDING,
        updatedAt: { lt: new Date(Date.now() - STALE_SENDING_MS) },
      },
      data: {
        status: NotificationCampaignStatus.PENDING,
        startedAt: null,
        dispatchToken: null,
      },
    });
  }

  private async dispatchPendingCampaigns() {
    if (this.dispatchInProgress) return;
    this.dispatchInProgress = true;
    try {
      await this.requeueStaleCampaigns();
      const pending = await this.prisma.notificationCampaign.findMany({
        where: { status: NotificationCampaignStatus.PENDING },
        orderBy: { createdAt: "asc" },
        take: 10,
        select: { id: true },
      });
      for (const { id } of pending) await this.dispatchCampaign(id);
    } catch (error) {
      this.logger.error(
        `Campaign dispatch interrupted: ${error instanceof Error ? error.name : "unknown error"}`,
      );
    } finally {
      this.dispatchInProgress = false;
    }
  }

  private async dispatchCampaign(id: string) {
    const dispatchToken = randomUUID();
    const claimed = await this.prisma.notificationCampaign.updateMany({
      where: { id, status: NotificationCampaignStatus.PENDING },
      data: {
        status: NotificationCampaignStatus.SENDING,
        startedAt: new Date(),
        dispatchToken,
      },
    });
    if (!claimed.count) return;

    const campaign = await this.prisma.notificationCampaign.findUniqueOrThrow({
      where: { id },
    });
    if (campaign.audience === NotificationAudience.ALL_APP_INSTALLATIONS) {
      await this.dispatchTopicCampaign(campaign, dispatchToken);
      return;
    }
    const [users, devices] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: Role.CUSTOMER, isActive: true },
        select: { id: true },
      }),
      this.prisma.pushDevice.findMany({
        where: {
          isActive: true,
          user: { role: Role.CUSTOMER, isActive: true },
        },
        select: { id: true, userId: true, installationId: true },
      }),
    ]);

    await this.prisma.$transaction(async (tx) => {
      await tx.userNotification.createMany({
        data: users.map(({ id: userId }) => ({ campaignId: id, userId })),
        skipDuplicates: true,
      });
      await tx.notificationDelivery.createMany({
        data: devices.map(({ id: deviceId }) => ({
          campaignId: id,
          deviceId,
        })),
        skipDuplicates: true,
      });
      await tx.notificationCampaign.update({
        where: { id },
        data: {
          intendedUserCount: users.length,
          deviceCount: devices.length,
        },
      });
    });

    if (!devices.length) {
      await this.finishCampaign(id, NotificationCampaignStatus.FAILED, 0, 0);
      return;
    }

    const notifications = await this.prisma.userNotification.findMany({
      where: { campaignId: id },
      select: { id: true, userId: true },
    });
    const notificationByUser = new Map(
      notifications.map((notification) => [
        notification.userId,
        notification.id,
      ]),
    );
    const deliveries = await this.prisma.notificationDelivery.findMany({
      where: {
        campaignId: id,
        status: NotificationDeliveryStatus.PENDING,
        device: { isActive: true },
      },
      include: {
        device: {
          select: { id: true, userId: true, installationId: true },
        },
      },
    });
    const results = await this.push.send(
      {
        campaignId: id,
        title: campaign.title,
        body: campaign.body,
        deepLink: campaign.deepLink,
      },
      deliveries.flatMap((delivery) => {
        const notificationId = notificationByUser.get(delivery.device.userId);
        return notificationId
          ? [
              {
                deliveryId: delivery.id,
                installationId: delivery.device.installationId,
                notificationId,
              },
            ]
          : [];
      }),
    );

    if (results.length) {
      await this.prisma.$transaction(
        results.map((result) =>
          this.prisma.notificationDelivery.update({
            where: { id: result.deliveryId },
            data: {
              status: result.ok
                ? NotificationDeliveryStatus.SENT
                : NotificationDeliveryStatus.FAILED,
              providerMessageId: result.providerMessageId,
              errorCode: result.errorCode,
              attemptedAt: new Date(),
            },
          }),
        ),
      );
      const invalidDeliveryIds = results
        .filter(({ invalidInstallation }) => invalidInstallation)
        .map(({ deliveryId }) => deliveryId);
      if (invalidDeliveryIds.length) {
        const invalid = deliveries
          .filter(({ id: deliveryId }) =>
            invalidDeliveryIds.includes(deliveryId),
          )
          .map(({ deviceId }) => deviceId);
        await this.prisma.pushDevice.updateMany({
          where: { id: { in: invalid } },
          data: { isActive: false },
        });
      }
    }

    const [sentCount, failedCount, pendingCount] = await Promise.all([
      this.prisma.notificationDelivery.count({
        where: { campaignId: id, status: NotificationDeliveryStatus.SENT },
      }),
      this.prisma.notificationDelivery.count({
        where: { campaignId: id, status: NotificationDeliveryStatus.FAILED },
      }),
      this.prisma.notificationDelivery.count({
        where: { campaignId: id, status: NotificationDeliveryStatus.PENDING },
      }),
    ]);
    if (pendingCount) return;
    const status = failedCount
      ? sentCount
        ? NotificationCampaignStatus.PARTIAL
        : NotificationCampaignStatus.FAILED
      : NotificationCampaignStatus.SENT;
    await this.finishCampaign(id, status, sentCount, failedCount);
  }

  private async dispatchTopicCampaign(
    campaign: Prisma.NotificationCampaignGetPayload<object>,
    dispatchToken: string,
  ) {
    const result =
      campaign.topic === PUBLIC_BROADCAST_TOPIC
        ? await this.push.sendTopic({
            campaignId: campaign.id,
            title: campaign.title,
            body: campaign.body,
            deepLink: campaign.deepLink,
          })
        : {
            ok: false,
            providerMessageId: null,
            errorCode: "messaging/invalid-topic",
          };
    const status = result.ok
      ? NotificationCampaignStatus.SENT
      : NotificationCampaignStatus.FAILED;
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.notificationCampaign.updateMany({
        where: {
          id: campaign.id,
          status: NotificationCampaignStatus.SENDING,
          dispatchToken,
        },
        data: {
          status,
          topicMessageId: result.providerMessageId,
          topicErrorCode: result.errorCode,
          completedAt: new Date(),
          dispatchToken: null,
        },
      });
      // A recovered worker owns the lease now; a late response must not overwrite it.
      if (!updated.count) return;
      await tx.auditLog.create({
        data: {
          actorId: campaign.createdById,
          action: "notification.campaign.finished",
          entityType: "NotificationCampaign",
          entityId: campaign.id,
          metadata: {
            status,
            topic: campaign.topic,
            providerMessageId: result.providerMessageId,
            errorCode: result.errorCode,
          },
        },
      });
    });
  }

  private async finishCampaign(
    id: string,
    status: NotificationCampaignStatus,
    sentCount: number,
    failedCount: number,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const campaign = await tx.notificationCampaign.update({
        where: { id },
        data: {
          status,
          sentCount,
          failedCount,
          completedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: campaign.createdById,
          action: "notification.campaign.finished",
          entityType: "NotificationCampaign",
          entityId: id,
          metadata: { status, sentCount, failedCount },
        },
      });
    });
  }
}
