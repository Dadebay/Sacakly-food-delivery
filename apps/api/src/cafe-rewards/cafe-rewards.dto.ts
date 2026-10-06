import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from "class-validator";
import { PromoType } from "../generated/prisma/client";
import { GiftResponseDto, LoyaltyWalletResponseDto } from "../loyalty/loyalty-response.dto";

export class CreateCafePromotionDto {
  @ApiProperty({ minLength: 2, maxLength: 160 })
  @Transform(({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value)
  @IsString() @MinLength(2) @MaxLength(160)
  title: string;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 40 })
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{2,40}$/)
  code?: string | null;
  @ApiProperty() @IsBoolean()
  isAutomatic: boolean;
  @ApiProperty({ enum: PromoType }) @IsEnum(PromoType)
  type: PromoType;
  @ApiProperty({ minimum: 0.01, maximum: 999999.99 })
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999999.99)
  value: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 999999.99 })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999.99)
  minOrderAmount?: number;
  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0.01, maximum: 999999.99 })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999999.99)
  maxDiscountAmount?: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1, maximum: 1000000 })
  @IsOptional() @IsInt() @Min(1) @Max(1000000)
  totalUsageLimit?: number | null;
  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 1000000 })
  @IsOptional() @IsInt() @Min(1) @Max(1000000)
  perUserLimit?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  isActive?: boolean;
  @ApiPropertyOptional({ type: String, nullable: true, format: "date-time" })
  @IsOptional() @IsDateString({ strict: true })
  startsAt?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, format: "date-time" })
  @IsOptional() @IsDateString({ strict: true })
  endsAt?: string | null;
}
export class UpdateCafePromotionDto extends CreateCafePromotionDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) @Max(2147483647)
  expectedVersion: number;
}
export class CafePromotionResponseDto {
  @ApiProperty({ format: "uuid" }) id: string;
  @ApiProperty({ format: "uuid" }) cafeId: string;
  @ApiProperty() title: string;
  @ApiProperty({ type: String, nullable: true }) code: string | null;
  @ApiProperty() isAutomatic: boolean;
  @ApiProperty({ enum: PromoType }) type: PromoType;
  @ApiProperty() value: number;
  @ApiProperty() minOrderAmount: number;
  @ApiProperty({ type: Number, nullable: true }) maxDiscountAmount: number | null;
  @ApiProperty({ type: Number, nullable: true }) totalUsageLimit: number | null;
  @ApiProperty() perUserLimit: number;
  @ApiProperty() usedCount: number;
  @ApiProperty() isActive: boolean;
  @ApiProperty({ type: String, nullable: true, format: "date-time" }) startsAt: string | null;
  @ApiProperty({ type: String, nullable: true, format: "date-time" }) endsAt: string | null;
  @ApiProperty() version: number;
}
export class CreateCafeGiftDto {
  @ApiProperty({ minLength: 2, maxLength: 160 })
  @Transform(({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value)
  @IsString() @MinLength(2) @MaxLength(160)
  name: string;
  @ApiProperty({ maxLength: 2000 }) @IsString() @MaxLength(2000)
  description: string;
  @ApiProperty({ minimum: 1, maximum: 1000000 }) @IsInt() @Min(1) @Max(1000000)
  pointsCost: number;
  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0, maximum: 1000000 })
  @IsOptional() @IsInt() @Min(0) @Max(1000000)
  stock?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  isActive?: boolean;
}
export class UpdateCafeGiftDto extends CreateCafeGiftDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) @Max(2147483647)
  expectedVersion: number;
}
export class CafeWalletResponseDto extends LoyaltyWalletResponseDto {
  @ApiProperty({ format: "uuid" }) cafeId: string;
}
export class CafeRewardsResponseDto {
  @ApiProperty() marketingEnabled: boolean;
  @ApiProperty() loyaltyEnabled: boolean;
  @ApiProperty({ type: [CafePromotionResponseDto] }) promotions: CafePromotionResponseDto[];
  @ApiProperty({ type: [GiftResponseDto] }) gifts: GiftResponseDto[];
}
