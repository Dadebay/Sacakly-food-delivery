import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { randomUUID, randomBytes } from "node:crypto";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { PrismaService } from "../prisma/prisma.service";
import { LoginAttemptStatus, Prisma, Role } from "../generated/prisma/client";
import { PLATFORM_OWNER_PHONE } from "../marketplace/platform-owner";
import type { AppEnv } from "../config/env";
import { RequestOtpDto, VerifyOtpDto } from "./auth.dto";
import { OtpService } from "./otp.service";
import { SmsService } from "./sms.service";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly otp: OtpService,
    private readonly sms: SmsService,
  ) {}

  normalizePhone(value: string) {
    const parsed = parsePhoneNumberFromString(value, "TM");
    if (!parsed?.isValid()) {
      throw new BadRequestException("Phone number is invalid");
    }
    return parsed.number;
  }

  async requestOtp(dto: RequestOtpDto) {
    const phone = this.normalizePhone(dto.phone);
    const challenge = await this.otp.issue(phone);
    const isDevelopment =
      this.config.get("NODE_ENV", { infer: true }) === "development";
    if (challenge.usesLongLivedTestCode) {
      this.logger.warn(
        "Configured long-lived test OTP challenge issued without SMS delivery",
      );
    } else {
      try {
        await this.sms.sendOtp(
          phone,
          challenge.code,
          challenge.requestId,
          challenge.expiresInSeconds,
        );
      } catch (error) {
        if (!isDevelopment) {
          await this.otp.cancel(phone, challenge.requestId);
          throw new ServiceUnavailableException(
            "The verification code could not be sent",
          );
        }
        // In development the code is still handed back below via `devCode`,
        // so a down SMS gateway (eg. the android_pull phone being offline)
        // doesn't block testing the login flow — only production requires
        // delivery to actually succeed.
        const detail = error instanceof Error ? error.message : "unknown error";
        this.logger.warn(
          `SMS delivery failed for ${phone}, continuing in development mode: ${detail}`,
        );
      }
    }

    await this.prisma.loginAttempt.create({
      data: {
        phone,
        installationId: dto.installationId,
        deviceName: dto.deviceName,
        platform: dto.platform,
        appVersion: dto.appVersion,
        status: LoginAttemptStatus.REQUESTED,
      },
    });

    return {
      expiresInSeconds: challenge.expiresInSeconds,
      ...(isDevelopment ? { devCode: challenge.code } : {}),
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const phone = this.normalizePhone(dto.phone);
    const verification = await this.otp.verify(phone, dto.code);
    if (verification === "unavailable") {
      await this.updateOpenAttempt(phone, LoginAttemptStatus.EXPIRED);
      throw new UnauthorizedException("Code is expired or unavailable");
    }
    if (verification === "incorrect") {
      await this.updateOpenAttempt(phone, LoginAttemptStatus.FAILED);
      throw new UnauthorizedException("Code is incorrect");
    }

    let user = await this.prisma.user.upsert({
      where: { phone },
      create: {
        phone,
        firstName: dto.firstName,
        lastName: dto.lastName,
        lastLoginAt: new Date(),
      },
      update: {
        ...(dto.firstName ? { firstName: dto.firstName } : {}),
        ...(dto.lastName ? { lastName: dto.lastName } : {}),
        lastLoginAt: new Date(),
      },
    });

    if (phone === PLATFORM_OWNER_PHONE && user.isActive) {
      user = await this.prisma.$transaction(async (tx) => {
        const entitlement = await tx.platformOwner.findUnique({ where: { phone } });
        if (entitlement) return user;
        const promoted = user.role === Role.SUPER_ADMIN
          ? user
          : await tx.user.update({ where: { id: user.id }, data: { role: Role.SUPER_ADMIN } });
        await tx.platformOwner.create({ data: { userId: user.id, phone } });
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: "platform.owner.provisioned_after_otp",
            entityType: "PlatformOwner",
            entityId: user.id,
          },
        });
        return promoted;
      });
    }

    await this.updateOpenAttempt(phone, LoginAttemptStatus.VERIFIED, user.id);
    return this.issueSession(user);
  }

  async refresh(rawToken: string) {
    const [tokenId, secret] = rawToken.split(".");
    if (!tokenId || !secret) {
      throw new UnauthorizedException("Refresh token is invalid");
    }
    const stored = await this.prisma.refreshToken.findUnique({
      where: { id: tokenId },
      include: { user: true },
    });
    if (
      !stored ||
      stored.revokedAt ||
      stored.expiresAt < new Date() ||
      !stored.user.isActive ||
      !(await this.verifyHash(stored.secretHash, secret))
    ) {
      throw new UnauthorizedException("Refresh token is invalid or expired");
    }

    return this.prisma.$transaction(async (tx) => {
      const revoked = await tx.refreshToken.updateMany({
        where: {
          id: stored.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { revokedAt: new Date() },
      });
      if (revoked.count !== 1) {
        throw new UnauthorizedException("Refresh token is invalid or expired");
      }
      return this.issueSession(stored.user, tx);
    });
  }

  async logout(rawToken: string) {
    const [tokenId, secret, extra] = rawToken.split(".");
    if (tokenId && secret && !extra) {
      const stored = await this.prisma.refreshToken.findUnique({
        where: { id: tokenId },
        select: { secretHash: true, revokedAt: true },
      });
      if (
        stored &&
        !stored.revokedAt &&
        (await this.verifyHash(stored.secretHash, secret))
      ) {
        await this.prisma.refreshToken.updateMany({
          where: { id: tokenId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    }
    return { success: true };
  }

  private async issueSession(
    user: {
      id: string;
      phone: string;
      role: string;
      firstName: string | null;
      lastName: string | null;
    },
    store: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const id = randomUUID();
    const secret = randomBytes(48).toString("base64url");
    const refreshToken = `${id}.${secret}`;
    const days = this.config.get("REFRESH_TOKEN_TTL_DAYS", { infer: true });
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      phone: user.phone,
      role: user.role,
      // Bind the long-lived JWT to its revocable server-side session. Refresh
      // rotation and logout revoke this row, invalidating the old access token
      // immediately instead of waiting for its JWT expiry.
      sid: id,
    });
    await store.refreshToken.create({
      data: {
        id,
        userId: user.id,
        secretHash: await argon2.hash(secret),
        expiresAt: new Date(Date.now() + days * 86_400_000),
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresInSeconds: parseTtlSeconds(
        this.config.get("ACCESS_TOKEN_TTL", { infer: true }),
      ),
      user: {
        id: user.id,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }

  private async verifyHash(hash: string, value: string) {
    try {
      return await argon2.verify(hash, value);
    } catch {
      return false;
    }
  }

  /**
   * Redis owns OTP secrets; this table deliberately stores only the audit state.
   * A phone can have several historical attempts, so only the newest open one is
   * transitioned for a verification result.
   */
  private async updateOpenAttempt(
    phone: string,
    status: LoginAttemptStatus,
    userId?: string,
  ) {
    const attempt = await this.prisma.loginAttempt.findFirst({
      where: {
        phone,
        // A user may mistype once and then enter the same still-valid code.
        // Keep that single request auditable instead of losing the later success.
        status: {
          in: [LoginAttemptStatus.REQUESTED, LoginAttemptStatus.FAILED],
        },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!attempt) return;
    await this.prisma.loginAttempt.update({
      where: { id: attempt.id },
      data: {
        status,
        ...(status === LoginAttemptStatus.VERIFIED
          ? { userId, verifiedAt: new Date() }
          : {}),
      },
    });
  }
}

const TTL_UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 24 * 60 * 60,
};

/** Mirrors the handful of `<number><unit>` forms `ACCESS_TOKEN_TTL` is ever
 * set to (for example "15m" or "365d") — the same string JwtModule signs tokens with,
 * kept in sync here so the session response's `expiresInSeconds` reports
 * the token's real lifetime instead of a stale hardcoded value. */
function parseTtlSeconds(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl.trim());
  if (!match?.[1] || !match[2]) return 900;
  const unitSeconds = TTL_UNIT_SECONDS[match[2]];
  return unitSeconds ? Number(match[1]) * unitSeconds : 900;
}
