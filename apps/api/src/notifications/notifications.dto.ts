import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";
import {
  NotificationAudience,
  PushDevicePlatform,
} from "../generated/prisma/client";

// An FCM registration token, not a bare Firebase Installation ID — it's
// shaped `<installation-id>:<APA91b...secret>`, so the colon has to be
// allowed alongside the base64url charset the ID portion alone would use.
export const PUSH_INSTALLATION_ID_PATTERN = /^[A-Za-z0-9_:-]{10,255}$/;

export class RegisterPushDeviceDto {
  @ApiProperty({
    description: "FCM registration token returned by the mobile SDK",
    example: "c5QXUxvrSS2QWHsZtC-DH-:APA91bG...",
  })
  @IsString()
  @MinLength(10)
  @MaxLength(255)
  @Matches(PUSH_INSTALLATION_ID_PATTERN)
  installationId: string;

  @ApiProperty({ enum: PushDevicePlatform })
  @IsEnum(PushDevicePlatform)
  platform: PushDevicePlatform;

  @ApiPropertyOptional({ example: "1.4.0" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  appVersion?: string;

  @ApiPropertyOptional({ example: "ru-TM" })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  @Matches(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/)
  locale?: string;
}

export class CreateNotificationCampaignDto {
  @ApiProperty({ example: "Скидка на ужин" })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title: string;

  @ApiProperty({ example: "Сегодня с 18:00 действует скидка 15%." })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  body: string;

  @ApiPropertyOptional({
    example: "/promotions/WELCOME15",
    description: "Internal application path opened after a notification tap",
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^\/(?![\\/])[^\\\s]*$/)
  deepLink?: string;

  @ApiPropertyOptional({
    enum: NotificationAudience,
    default: NotificationAudience.ALL_CUSTOMERS,
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(NotificationAudience)
  audience: NotificationAudience = NotificationAudience.ALL_CUSTOMERS;

  @ApiPropertyOptional({
    format: "uuid",
    description:
      "Required for ALL_APP_INSTALLATIONS. Reuse the UUID when retrying the same creation request; changed content returns 409.",
  })
  @ValidateIf(
    (dto: CreateNotificationCampaignDto) =>
      dto.audience === NotificationAudience.ALL_APP_INSTALLATIONS ||
      dto.idempotencyKey !== undefined,
  )
  @IsUUID("4")
  idempotencyKey?: string;
}

export class ListNotificationCampaignsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 25, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}

export class ListMyNotificationsQueryDto extends ListNotificationCampaignsQueryDto {}
