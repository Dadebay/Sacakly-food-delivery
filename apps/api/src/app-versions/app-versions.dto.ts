import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  Equals,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { PushDevicePlatform } from "../generated/prisma/client";
import { APP_VERSION_PATTERN } from "./app-version-policy";

export class AppVersionPlatformDto {
  @ApiProperty({ enum: PushDevicePlatform })
  @IsEnum(PushDevicePlatform)
  platform!: PushDevicePlatform;
}

export class SaveAppVersionDto {
  @ApiProperty({
    example: "1.4.0",
    maxLength: 32,
    pattern: APP_VERSION_PATTERN.source,
  })
  @IsString()
  @MaxLength(32)
  @Matches(APP_VERSION_PATTERN)
  latestVersion!: string;

  @ApiProperty({
    example: "1.2.0",
    maxLength: 32,
    pattern: APP_VERSION_PATTERN.source,
  })
  @IsString()
  @MaxLength(32)
  @Matches(APP_VERSION_PATTERN)
  minSupportedVersion!: string;

  @ApiProperty({
    example:
      "https://play.google.com/store/apps/details?id=com.gurbanov.alowalow",
    maxLength: 2048,
  })
  @IsString()
  @MaxLength(2048)
  storeUrl!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  releaseNotesRu?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  releaseNotesTk?: string | null;

  @ApiProperty({
    description:
      "Current record version; 0 only when creating a platform policy",
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  @Max(2147483646)
  version!: number;

  @ApiProperty({
    description:
      "Administrator confirms this release is available to all users in the store",
    enum: [true],
  })
  @Equals(true)
  publishedConfirmed!: boolean;

  @ApiPropertyOptional({
    description:
      "Explicitly acknowledge blocking older versions when the minimum increases",
  })
  @IsOptional()
  @IsBoolean()
  confirmMinimumIncrease?: boolean;
}
