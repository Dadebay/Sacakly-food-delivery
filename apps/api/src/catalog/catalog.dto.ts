import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsIP,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import {
  ProductPricingType,
  ReceiptPrinterTransport,
} from "../generated/prisma/client";

const MEDIA_IMAGE_PATH =
  /^\/api\/v1\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i;

function normalizeOptionalIp(value: unknown) {
  return typeof value === "string" ? value.trim() || null : value;
}

function normalizeOptionalSearch(value: unknown) {
  return typeof value === "string" ? value.trim() : value;
}

export class ListCatalogCategoriesQueryDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  cafeId?: string;
}

export class ListCatalogProductsQueryDto extends ListCatalogCategoriesQueryDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

export class ListAdminCatalogProductsQueryDto extends ListCatalogProductsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 40, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 40;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @Transform(({ value }) => normalizeOptionalSearch(value))
  @IsString()
  @MaxLength(160)
  query?: string;
}

export class CreateCafeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({
    description:
      "Optional technical identifier; generated from the name on create and preserved on update when omitted",
  })
  @IsOptional()
  @IsString()
  @MaxLength(140)
  slug?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "WebP path returned by POST /media/images",
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Matches(MEDIA_IMAGE_PATH, {
    message: "imageUrl must be a WebP path returned by the media API",
  })
  imageUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCafeDto extends PartialType(CreateCafeDto) {}

export class CreateCategoryDto {
  @ApiPropertyOptional({
    format: "uuid",
    description:
      "Owning cafe. Older clients may omit it and use the migration-created Han tagam cafe.",
  })
  @IsOptional()
  @IsUUID()
  cafeId?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    description:
      "Optional technical identifier; generated from the name on create and preserved on update when omitted",
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: "192.168.1.51",
    description:
      "Default private LAN receipt-printer IPv4 address for products in this category",
  })
  @IsOptional()
  @Transform(({ value }) => normalizeOptionalIp(value))
  @IsIP(4)
  @Matches(/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/, {
    message: "receiptPrinterIp must be a private LAN IPv4 address",
  })
  receiptPrinterIp?: string | null;

  @ApiPropertyOptional({
    type: String,
    format: "uuid",
    nullable: true,
    description:
      "Registered default kitchen printer; takes precedence over the legacy receiptPrinterIp field",
  })
  @IsOptional()
  @IsUUID()
  receiptPrinterId?: string | null;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class UpdateReceiptPrintSettingsDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  mainCopies?: number;
  @ApiPropertyOptional({
    type: String,
    format: "uuid",
    nullable: true,
    description: "Registered printer that receives the complete receipt",
  })
  @IsOptional()
  @IsUUID()
  mainPrinterId?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: "192.168.1.50",
    description:
      "Private LAN printer that receives one complete administrator receipt; null disables the complete copy",
  })
  @IsOptional()
  @Transform(({ value }) => normalizeOptionalIp(value))
  @ValidateIf((_object, value) => value !== null)
  @IsIP(4)
  @Matches(/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/, {
    message: "mainPrinterIp must be a private LAN IPv4 address",
  })
  mainPrinterIp?: string | null;
}

export class CreateReceiptPrinterDto {
  @ApiProperty({ example: "Пицца — кухня" })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: "192.168.123.100" })
  @Transform(({ value }) => normalizeOptionalIp(value))
  @IsIP(4)
  @Matches(/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/, {
    message: "ipAddress must be a private LAN IPv4 address",
  })
  ipAddress: string;

  @ApiProperty({ example: 9100, default: 9100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port: number;

  @ApiProperty({ enum: ReceiptPrinterTransport })
  @IsEnum(ReceiptPrinterTransport)
  transport: ReceiptPrinterTransport;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateReceiptPrinterDto {
  @ApiPropertyOptional({ example: "Пицца — кухня" })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: "192.168.123.100" })
  @IsOptional()
  @Transform(({ value }) => normalizeOptionalIp(value))
  @IsIP(4)
  @Matches(/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/, {
    message: "ipAddress must be a private LAN IPv4 address",
  })
  ipAddress?: string;

  @ApiPropertyOptional({ example: 9100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiPropertyOptional({ enum: ReceiptPrinterTransport })
  @IsOptional()
  @IsEnum(ReceiptPrinterTransport)
  transport?: ReceiptPrinterTransport;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ProductVariantInputDto {
  @ApiPropertyOptional({
    format: "uuid",
    description: "Existing variant ID when updating a product",
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: "Маленькая, 25 см" })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: "На тонком тесте" })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiProperty({ example: 55 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 10,
    description: "Ordered WebP paths used only for this product variant",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  @Matches(MEDIA_IMAGE_PATH, {
    each: true,
    message:
      "each variant image URL must be a WebP path returned by the media API",
  })
  imageUrls?: string[];
}

export class CreateProductDto {
  @ApiProperty()
  @IsUUID()
  categoryId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  name: string;

  @ApiPropertyOptional({
    description:
      "Optional technical identifier; generated from the name on create and preserved on update when omitted",
  })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  slug?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(4000)
  description: string;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 1440,
    description: "Preparation time in minutes",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  preparationMinutes?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100000, description: "Points earned for each ordered unit after delivery" })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  loyaltyPoints?: number;

  @ApiPropertyOptional({
    example: 49.9,
    description:
      "Required for FIXED pricing and ignored for VARIANT pricing, where the backend derives the minimum price",
  })
  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @ApiPropertyOptional({
    enum: ProductPricingType,
    description:
      "FIXED sells the dish itself; VARIANT requires a concrete active variant",
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(ProductPricingType)
  pricingType?: ProductPricingType;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: "192.168.1.50",
    description:
      "Optional private LAN receipt-printer IPv4 override for this product; null inherits the category route",
  })
  @IsOptional()
  @Transform(({ value }) => normalizeOptionalIp(value))
  @IsIP(4)
  @Matches(/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/, {
    message: "receiptPrinterIp must be a private LAN IPv4 address",
  })
  receiptPrinterIp?: string | null;

  @ApiPropertyOptional({
    type: String,
    format: "uuid",
    nullable: true,
    description:
      "Registered product-level printer override; null inherits the category route",
  })
  @IsOptional()
  @IsUUID()
  receiptPrinterId?: string | null;

  @ApiPropertyOptional({
    example: "Размер",
    description:
      "Customer-facing selector label, for example Size or Cutting method",
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  variantLabel?: string;

  @ApiPropertyOptional({ type: () => [ProductVariantInputDto], maxItems: 30 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ProductVariantInputDto)
  variants?: ProductVariantInputDto[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 10,
    example: [
      "/api/v1/media/2d807991-e99f-4f17-9b9f-cc2fb7478820.webp",
      "/api/v1/media/c9949db2-cf7c-4f28-8a0f-81776210d2f1.webp",
    ],
    description:
      "Ordered image paths returned by POST /media/images; the first image is primary",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  @Matches(MEDIA_IMAGE_PATH, {
    each: true,
    message: "each image URL must be a WebP path returned by the media API",
  })
  imageUrls?: string[];
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class AddProductImageDto {
  @ApiProperty({
    example: "/api/v1/media/2d807991-e99f-4f17-9b9f-cc2fb7478820.webp",
  })
  @IsString()
  @MaxLength(1000)
  @Matches(MEDIA_IMAGE_PATH, {
    message: "image URL must be a WebP path returned by the media API",
  })
  url: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(180)
  alt?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
