import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
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

export class InventoryBranchQueryDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  branchId: string;
}

export class InventoryLocationDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() branchId: string;
  @ApiProperty({ example: "KITCHEN" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  code: string;
  @ApiProperty({ example: "Холодный цех" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;
}

export class InventoryDocumentBaseDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() branchId: string;
  @ApiProperty({
    format: "uuid",
    description: "Same key for retries of the same document",
  })
  @IsUUID()
  idempotencyKey: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(300) reason: string;
}

export class InventoryQuantityDto {
  @ApiProperty({ example: 1000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(100000000)
  quantity: number;
}

export class InventoryReceiptDto extends InventoryDocumentBaseDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() ingredientId: string;
  @ApiProperty({ format: "uuid" }) @IsUUID() locationId: string;
  @ApiProperty({ example: "SUPPLIER-42" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lotCode: string;
  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
  @ApiProperty({ example: 0.03 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(999999.999999)
  unitCost: number;
  @ApiProperty({
    example: 12,
    description:
      "Pieces or other base units; package multiplication is done before posting",
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(100000000)
  quantity: number;
}

export class InventoryLotQuantityDto extends InventoryQuantityDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() lotId: string;
  @ApiProperty({ format: "uuid" }) @IsUUID() locationId: string;
}

export class InventoryTransferDto extends InventoryDocumentBaseDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() lotId: string;
  @ApiProperty({ format: "uuid" }) @IsUUID() fromLocationId: string;
  @ApiProperty({ format: "uuid" }) @IsUUID() toLocationId: string;
  @ApiProperty({ example: 8000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(100000000)
  quantity: number;
}

export class InventoryOutputDto extends InventoryQuantityDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() ingredientId: string;
  @ApiProperty({ format: "uuid" }) @IsUUID() locationId: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(100) lotCode: string;
}

export class InventoryProcessDto extends InventoryDocumentBaseDto {
  @ApiProperty({ type: [InventoryLotQuantityDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InventoryLotQuantityDto)
  inputs: InventoryLotQuantityDto[];
  @ApiProperty({ type: [InventoryOutputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InventoryOutputDto)
  outputs: InventoryOutputDto[];
  @ApiProperty({
    type: [InventoryLotQuantityDto],
    description: "Measured technological loss from input lots",
  })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InventoryLotQuantityDto)
  waste: InventoryLotQuantityDto[];
}

export class InventoryWasteDto extends InventoryDocumentBaseDto {
  @ApiProperty({ type: [InventoryLotQuantityDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InventoryLotQuantityDto)
  lines: InventoryLotQuantityDto[];
}

export class InventoryStocktakeDto extends InventoryDocumentBaseDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() lotId: string;
  @ApiProperty({ format: "uuid" }) @IsUUID() locationId: string;
  @ApiProperty({
    example: 5000,
    description: "Counted physical quantity in base units",
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(100000000)
  countedQuantity: number;
}

export class InventoryProductLinkDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  variantId?: string;
  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  ingredientId?: string | null;
  @ApiPropertyOptional({ type: Number, example: 1, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(100000000)
  quantity?: number | null;
}

export class InventoryLocationResponseDto {
  @ApiProperty({ format: "uuid" }) id: string;
  @ApiProperty({ format: "uuid" }) branchId: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty({ format: "date-time" }) createdAt: string;
}

export class InventoryLotBalanceResponseDto {
  @ApiProperty({ format: "uuid" }) locationId: string;
  @ApiProperty() locationName: string;
  @ApiProperty() locationCode: string;
  @ApiProperty() quantity: number;
}

export class InventoryLotResponseDto {
  @ApiProperty({ format: "uuid" }) id: string;
  @ApiProperty({ format: "uuid" }) branchId: string;
  @ApiProperty() code: string;
  @ApiProperty({ format: "uuid" }) ingredientId: string;
  @ApiProperty() ingredientName: string;
  @ApiProperty() unit: string;
  @ApiProperty() unitCost: number;
  @ApiProperty({ type: String, nullable: true, format: "date-time" })
  expiresAt: string | null;
  @ApiProperty({ type: String, nullable: true }) originNote: string | null;
  @ApiProperty({ format: "date-time" }) createdAt: string;
  @ApiProperty({ type: [InventoryLotBalanceResponseDto] })
  balances: InventoryLotBalanceResponseDto[];
}

export class InventoryDocumentLineResponseDto {
  @ApiProperty({ format: "uuid" }) id: string;
  @ApiProperty({ type: String, nullable: true, format: "uuid" }) orderItemId:
    | string
    | null;
  @ApiProperty({ format: "uuid" }) lotId: string;
  @ApiProperty() lotCode: string;
  @ApiProperty({ format: "uuid" }) ingredientId: string;
  @ApiProperty() ingredientName: string;
  @ApiProperty() unit: string;
  @ApiProperty({ format: "uuid" }) locationId: string;
  @ApiProperty() locationName: string;
  @ApiProperty({ enum: ["IN", "OUT", "PROCESS_WASTE"] }) kind: string;
  @ApiProperty() quantity: number;
  @ApiProperty() unitCost: number;
}

export class InventoryDocumentResponseDto {
  @ApiProperty({ format: "uuid" }) id: string;
  @ApiProperty({ format: "uuid" }) branchId: string;
  @ApiProperty({ type: String, nullable: true, format: "uuid" }) actorId:
    | string
    | null;
  @ApiProperty({ type: String, nullable: true, format: "uuid" }) orderId:
    | string
    | null;
  @ApiProperty() kind: string;
  @ApiProperty() reason: string;
  @ApiProperty({ type: Number, nullable: true }) stocktakeExpectedQuantity:
    | number
    | null;
  @ApiProperty({ type: Number, nullable: true }) stocktakeCountedQuantity:
    | number
    | null;
  @ApiProperty({ format: "date-time" }) createdAt: string;
  @ApiProperty({ type: [InventoryDocumentLineResponseDto] })
  lines: InventoryDocumentLineResponseDto[];
}

export class InventoryLotTraceResponseDto {
  @ApiProperty({ format: "uuid" }) lotId: string;
  @ApiProperty({ type: [InventoryDocumentResponseDto] })
  documents: InventoryDocumentResponseDto[];
}

export class InventoryProductVariantLinkResponseDto {
  @ApiProperty({ format: "uuid" }) variantId: string;
  @ApiProperty() variantName: string;
  @ApiProperty({ type: String, nullable: true, format: "uuid" }) ingredientId:
    | string
    | null;
  @ApiProperty({ type: Number, nullable: true }) quantity: number | null;
}

export class InventoryProductLinkResponseDto {
  @ApiProperty({ format: "uuid" }) productId: string;
  @ApiProperty() productName: string;
  @ApiProperty() hasActiveRecipe: boolean;
  @ApiProperty({ type: String, nullable: true, format: "uuid" }) ingredientId:
    | string
    | null;
  @ApiProperty({ type: Number, nullable: true }) quantity: number | null;
  @ApiProperty({ type: [InventoryProductVariantLinkResponseDto] })
  variants: InventoryProductVariantLinkResponseDto[];
}

export class InventorySavedProductLinkResponseDto {
  @ApiProperty({ format: "uuid" }) productId: string;
  @ApiProperty({ type: String, nullable: true, format: "uuid" }) variantId:
    | string
    | null;
  @ApiProperty({ type: String, nullable: true, format: "uuid" }) ingredientId:
    | string
    | null;
  @ApiProperty({ type: Number, nullable: true }) quantity: number | null;
}
