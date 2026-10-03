import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  IsInt,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import {
  InventoryMovementType,
  InventoryUnit,
} from "../generated/prisma/client";

export class CreateIngredientDto {
  @ApiProperty({ example: "Мука" })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;

  @ApiPropertyOptional({ example: "FLOUR-001" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @ApiProperty({
    enum: InventoryUnit,
    description: "Base unit used by recipes and stock",
  })
  @IsEnum(InventoryUnit)
  unit: InventoryUnit;

  @ApiProperty({ example: 0.02, description: "Cost in TMT per base unit" })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(999999.999999)
  costPerUnit: number;

  @ApiPropertyOptional({ example: 500, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(100000000)
  reorderPoint?: number;
}

export class UpdateIngredientDto {
  @ApiPropertyOptional({ example: "Мука" })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ example: "FLOUR-001", nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string | null;

  @ApiPropertyOptional({ enum: InventoryUnit })
  @IsOptional()
  @IsEnum(InventoryUnit)
  unit?: InventoryUnit;

  @ApiPropertyOptional({ example: 0.02 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(999999.999999)
  costPerUnit?: number;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(100000000)
  reorderPoint?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class RecipeIngredientInputDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  ingredientId: string;

  @ApiProperty({
    example: 120,
    description: "Amount in the ingredient base unit",
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(100000000)
  quantity: number;
}

export class UpsertRecipeDto {
  @ApiProperty({
    example: 1,
    description: "How many portions one recipe batch yields",
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(100000000)
  yieldQuantity: number;

  @ApiProperty({ type: [RecipeIngredientInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientInputDto)
  ingredients: RecipeIngredientInputDto[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class InventoryStockQueryDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class AdjustInventoryStockDto {
  @ApiPropertyOptional({
    format: "uuid",
    description:
      "Reuse for retries of the same manual operation; a changed payload with the same key returns 409",
  })
  @IsOptional()
  @IsUUID()
  idempotencyKey?: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  branchId: string;

  @ApiProperty({
    example: 1000,
    description: "Positive receipt or negative write-off in base units",
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(-100000000)
  @Max(100000000)
  quantityDelta: number;

  @ApiProperty({
    enum: InventoryMovementType,
    default: InventoryMovementType.ADJUSTMENT,
  })
  @IsOptional()
  @IsEnum(InventoryMovementType)
  type?: InventoryMovementType;

  @ApiPropertyOptional({ example: "Приемка поставки №42" })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class InventoryMovementQueryDto extends InventoryStockQueryDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
