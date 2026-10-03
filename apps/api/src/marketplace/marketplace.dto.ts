import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from "class-validator";
import { Role } from "../generated/prisma/client";
import { CreateOrderDto, QuoteOrderDto } from "../orders/orders.dto";

export const CAFE_MODULE_KEYS = [
  "CATALOG", "ORDERING", "KITCHEN", "DELIVERY", "RECEIPTS",
  "INVENTORY", "LOYALTY", "ACCOUNTING",
] as const;

export class ReviewCourierDto {
  @ApiProperty({ enum: ["APPROVED", "REJECTED"] })
  @IsIn(["APPROVED", "REJECTED"])
  decision: "APPROVED" | "REJECTED";

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class GrantCafeMemberDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  userId: string;

  @ApiProperty({ enum: [Role.ADMIN, Role.OPERATOR, Role.COOK, Role.ACCOUNTANT] })
  @IsEnum(Role)
  @IsIn([Role.ADMIN, Role.OPERATOR, Role.COOK, Role.ACCOUNTANT])
  role: Role;

  @ApiPropertyOptional({ description: "False revokes cafe access without deleting history" })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ minimum: 0, description: "0 creates a new membership" })
  @IsInt()
  @Min(0)
  expectedVersion: number;
}

export class CreateMarketplaceCafeDto {
  @ApiProperty({ minLength: 2, maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiProperty({ pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", maxLength: 140 })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(140)
  slug: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class LookupMarketplaceUserDto {
  @ApiProperty({ example: "+99362969614" })
  @IsString()
  @MaxLength(32)
  phone: string;
}

export class SetCafeModuleDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  expectedVersion: number;
}

export class CafeModuleKeyDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  cafeId: string;

  @ApiProperty({ enum: CAFE_MODULE_KEYS })
  @IsIn(CAFE_MODULE_KEYS)
  key: (typeof CAFE_MODULE_KEYS)[number];
}

export class MarketplaceCreateOrderDto extends CreateOrderDto {
  @ApiProperty({ format: "uuid", description: "Selected cafe for this checkout" })
  @IsUUID()
  cafeId: string;
}

export class MarketplaceQuoteOrderDto extends QuoteOrderDto {
  @ApiProperty({ format: "uuid", description: "Selected cafe for this quote" })
  @IsUUID()
  cafeId: string;
}
