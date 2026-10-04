import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from "class-validator";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateCafeCategoryDto {
  @ApiProperty({ minLength: 2, maxLength: 100 })
  @IsString() @MinLength(2) @MaxLength(100) @Matches(/\S/)
  name: string;

  @ApiProperty({ pattern: SLUG.source, maxLength: 80 })
  @Matches(SLUG) @MaxLength(80)
  slug: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional() @IsInt() @Min(0)
  sortOrder?: number;
}

export class UpdateCafeCategoryDto {
  @ApiProperty({ minimum: 1 })
  @IsInt() @Min(1)
  expectedVersion: number;

  @ApiPropertyOptional({ minLength: 2, maxLength: 100 })
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) @Matches(/\S/)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional() @IsInt() @Min(0)
  sortOrder?: number;
}

export class CreateCafeProductDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  categoryId: string;

  @ApiProperty({ minLength: 2, maxLength: 160 })
  @IsString() @MinLength(2) @MaxLength(160) @Matches(/\S/)
  name: string;

  @ApiProperty({ pattern: SLUG.source, maxLength: 80 })
  @Matches(SLUG) @MaxLength(80)
  slug: string;

  @ApiProperty({ maxLength: 2000 })
  @IsString() @MaxLength(2000)
  description: string;

  @ApiProperty({ minimum: 0, maximum: 999999.99 })
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999.99)
  price: number;

  @ApiProperty({ minimum: 0, maximum: 1440 })
  @IsInt() @Min(0) @Max(1440)
  preparationMinutes: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional() @IsInt() @Min(0)
  sortOrder?: number;
}

export class UpdateCafeProductDto {
  @ApiProperty({ minimum: 1 })
  @IsInt() @Min(1)
  expectedVersion: number;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional() @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ minLength: 2, maxLength: 160 })
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) @Matches(/\S/)
  name?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 999999.99 })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999.99)
  price?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1440 })
  @IsOptional() @IsInt() @Min(0) @Max(1440)
  preparationMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional() @IsInt() @Min(0)
  sortOrder?: number;
}

export class CreateCafeBranchDto {
  @ApiProperty({ minLength: 2, maxLength: 160 })
  @IsString() @MinLength(2) @MaxLength(160) @Matches(/\S/)
  name: string;

  @ApiProperty({ minLength: 3, maxLength: 500 })
  @IsString() @MinLength(3) @MaxLength(500) @Matches(/\S/)
  address: string;

  @ApiProperty({ minimum: -90, maximum: 90 })
  @IsNumber() @Min(-90) @Max(90)
  latitude: number;

  @ApiProperty({ minimum: -180, maximum: 180 })
  @IsNumber() @Min(-180) @Max(180)
  longitude: number;

  @ApiPropertyOptional({ maxLength: 24 })
  @IsOptional() @IsString() @MaxLength(24)
  phone?: string;
}

export class UpdateCafeBranchDto {
  @ApiProperty({ minimum: 1 })
  @IsInt() @Min(1)
  expectedVersion: number;

  @ApiPropertyOptional({ minLength: 2, maxLength: 160 })
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) @Matches(/\S/)
  name?: string;

  @ApiPropertyOptional({ minLength: 3, maxLength: 500 })
  @IsOptional() @IsString() @MinLength(3) @MaxLength(500) @Matches(/\S/)
  address?: string;

  @ApiPropertyOptional({ minimum: -90, maximum: 90 })
  @IsOptional() @IsNumber() @Min(-90) @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ minimum: -180, maximum: 180 })
  @IsOptional() @IsNumber() @Min(-180) @Max(180)
  longitude?: number;

  @ApiPropertyOptional({ maxLength: 24 })
  @IsOptional() @IsString() @MaxLength(24)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class CafeProductResponseDto {
  @ApiProperty({ format: "uuid" }) id: string;
  @ApiProperty({ format: "uuid" }) categoryId: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
  @ApiProperty() description: string;
  @ApiProperty({ type: String }) price: string;
  @ApiProperty() preparationMinutes: number;
  @ApiProperty() sortOrder: number;
  @ApiProperty() isActive: boolean;
  @ApiProperty() version: number;
}

export class CafeCategoryItemResponseDto {
  @ApiProperty({ format: "uuid" }) id: string;
  @ApiProperty({ format: "uuid" }) cafeId: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
  @ApiProperty() sortOrder: number;
  @ApiProperty() isActive: boolean;
  @ApiProperty() version: number;
}

export class CafeCategoryResponseDto extends CafeCategoryItemResponseDto {
  @ApiProperty({ type: [CafeProductResponseDto] }) products: CafeProductResponseDto[];
}

export class CafeBranchResponseDto {
  @ApiProperty({ format: "uuid" }) id: string;
  @ApiProperty({ format: "uuid" }) cafeId: string;
  @ApiProperty() name: string;
  @ApiProperty() address: string;
  @ApiProperty({ type: String }) latitude: string;
  @ApiProperty({ type: String }) longitude: string;
  @ApiPropertyOptional({ type: String, nullable: true }) phone: string | null;
  @ApiProperty() isActive: boolean;
  @ApiProperty() version: number;
}

export class CafeCatalogResponseDto {
  @ApiProperty({ type: [CafeCategoryResponseDto] }) categories: CafeCategoryResponseDto[];
  @ApiProperty({ type: [CafeBranchResponseDto] }) branches: CafeBranchResponseDto[];
}
