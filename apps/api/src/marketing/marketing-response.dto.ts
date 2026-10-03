import { ApiProperty } from "@nestjs/swagger";
import { PromoType } from "../generated/prisma/client";

export class BannerResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ type: String, nullable: true })
  subtitle: string | null;

  @ApiProperty()
  imageUrl: string;

  @ApiProperty({ type: String, nullable: true })
  link: string | null;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  startsAt: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  endsAt: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt: string;

  @ApiProperty({ format: "date-time" })
  updatedAt: string;
}

export class PromoCodeResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  code: string;

  @ApiProperty({ enum: PromoType })
  type: PromoType;

  @ApiProperty()
  value: number;

  @ApiProperty({ type: Number, nullable: true })
  minOrderAmount: number | null;

  @ApiProperty({ type: Number, nullable: true })
  maxDiscountAmount: number | null;

  @ApiProperty({ type: Number, nullable: true })
  totalUsageLimit: number | null;

  @ApiProperty()
  perUserLimit: number;

  @ApiProperty()
  usedCount: number;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  startsAt: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  endsAt: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt: string;

  @ApiProperty({ format: "date-time" })
  updatedAt: string;
}
