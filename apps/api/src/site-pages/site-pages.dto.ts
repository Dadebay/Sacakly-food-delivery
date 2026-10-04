import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsInt, IsString, Matches, Max, MaxLength, Min, MinLength } from "class-validator";

export const SITE_LOCALES = ["tk", "ru", "en"] as const;

export class SitePageParamsDto {
  @ApiProperty({ enum: SITE_LOCALES })
  @IsIn(SITE_LOCALES)
  locale: (typeof SITE_LOCALES)[number];

  @ApiProperty({ pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(80)
  slug: string;
}

export class SaveSitePageDto {
  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  expectedVersion: number;

  @ApiProperty({ maxLength: 160 })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title: string;

  @ApiProperty({ maxLength: 300 })
  @IsString()
  @MinLength(10)
  @MaxLength(300)
  description: string;

  @ApiProperty({ maxLength: 20000, description: "Plain text; the web client never renders it as HTML" })
  @IsString()
  @MaxLength(20000)
  body: string;

  @ApiProperty()
  @IsBoolean()
  published: boolean;
}

export class SitePageResponseDto {
  @ApiProperty({ enum: SITE_LOCALES }) locale: string;
  @ApiProperty() slug: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty() body: string;
  @ApiProperty() published: boolean;
  @ApiProperty() version: number;
  @ApiProperty({ format: "date-time" }) updatedAt: Date;
}

export class SitePageSummaryDto {
  @ApiProperty({ enum: SITE_LOCALES }) locale: string;
  @ApiProperty() slug: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty() published: boolean;
  @ApiProperty() version: number;
  @ApiProperty({ format: "date-time" }) updatedAt: Date;
}
