import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ProductPricingType,
  ReceiptPrinterTransport,
} from "../generated/prisma/client";

export class ReceiptPrinterResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ example: "192.168.123.100" })
  ipAddress: string;

  @ApiProperty({ example: 9100 })
  port: number;

  @ApiProperty({ enum: ReceiptPrinterTransport })
  transport: ReceiptPrinterTransport;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ format: "date-time" })
  createdAt: string;

  @ApiProperty({ format: "date-time" })
  updatedAt: string;
}

export class CatalogProductImageResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  productId: string;

  @ApiProperty()
  url: string;

  @ApiProperty({ type: String, nullable: true })
  alt: string | null;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty({ format: "date-time" })
  createdAt: string;
}

export class CatalogProductVariantImageResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  productVariantId: string;

  @ApiProperty()
  url: string;

  @ApiProperty({ type: String, nullable: true })
  alt: string | null;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty({ format: "date-time" })
  createdAt: string;
}

export class CatalogProductVariantResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  productId: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty()
  price: number;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty({ format: "date-time" })
  createdAt: string;

  @ApiProperty({ format: "date-time" })
  updatedAt: string;

  @ApiProperty({ type: [CatalogProductVariantImageResponseDto] })
  images: CatalogProductVariantImageResponseDto[];
}

export class CatalogCafeResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: String, nullable: true })
  imageUrl: string | null;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ format: "date-time" })
  createdAt: string;

  @ApiProperty({ format: "date-time" })
  updatedAt: string;
}

export class CatalogAdminCafeResponseDto extends CatalogCafeResponseDto {
  @ApiProperty({ minimum: 0 })
  categoryCount: number;
}

export class CatalogCategorySummaryResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  cafeId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty({ type: String, nullable: true })
  imageUrl: string | null;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ format: "date-time" })
  createdAt: string;

  @ApiProperty({ format: "date-time" })
  updatedAt: string;

  @ApiProperty({ type: CatalogCafeResponseDto })
  cafe: CatalogCafeResponseDto;
}

export class CatalogProductResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  categoryId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ minimum: 0 })
  preparationMinutes: number;

  @ApiProperty({ minimum: 0 })
  loyaltyPoints: number;

  @ApiProperty({ enum: ProductPricingType })
  pricingType: ProductPricingType;

  @ApiProperty()
  price: number;

  @ApiProperty()
  minPrice: number;

  @ApiProperty()
  hasVariants: boolean;

  @ApiProperty({ type: String, nullable: true })
  variantLabel: string | null;

  @ApiProperty({ type: String, nullable: true })
  displayImageUrl: string | null;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty({ format: "date-time" })
  createdAt: string;

  @ApiProperty({ format: "date-time" })
  updatedAt: string;

  @ApiProperty({ type: [CatalogProductImageResponseDto] })
  images: CatalogProductImageResponseDto[];

  @ApiProperty({ type: [CatalogProductVariantResponseDto] })
  variants: CatalogProductVariantResponseDto[];

  @ApiPropertyOptional({ type: CatalogCategorySummaryResponseDto })
  category?: CatalogCategorySummaryResponseDto;
}

export class CatalogAdminProductResponseDto extends CatalogProductResponseDto {
  @ApiProperty({ type: String, format: "uuid", nullable: true })
  receiptPrinterId: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: "192.168.1.50",
    description:
      "Explicit product override; null means inherit the category route",
  })
  receiptPrinterIp: string | null;

  @ApiProperty({ type: ReceiptPrinterResponseDto, nullable: true })
  receiptPrinter: ReceiptPrinterResponseDto | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  effectiveReceiptPrinterId: string | null;

  @ApiProperty({ type: String, nullable: true, example: "192.168.1.51" })
  effectiveReceiptPrinterIp: string | null;

  @ApiProperty({ type: ReceiptPrinterResponseDto, nullable: true })
  effectiveReceiptPrinter: ReceiptPrinterResponseDto | null;
}

export class CatalogCategoryResponseDto extends CatalogCategorySummaryResponseDto {
  @ApiProperty({ type: [CatalogProductResponseDto] })
  products: CatalogProductResponseDto[];
}

export class CatalogAdminCategorySummaryResponseDto extends CatalogCategorySummaryResponseDto {
  @ApiProperty({ type: String, format: "uuid", nullable: true })
  receiptPrinterId: string | null;

  @ApiProperty({ type: String, nullable: true, example: "192.168.1.51" })
  receiptPrinterIp: string | null;

  @ApiProperty({ type: ReceiptPrinterResponseDto, nullable: true })
  receiptPrinter: ReceiptPrinterResponseDto | null;
}

export class CatalogAdminCategoryResponseDto extends CatalogAdminCategorySummaryResponseDto {
  @ApiProperty({ type: [CatalogAdminProductResponseDto] })
  products: CatalogAdminProductResponseDto[];
}

export class CatalogAdminCategoryListItemResponseDto extends CatalogAdminCategorySummaryResponseDto {
  @ApiProperty({ minimum: 0 })
  productCount: number;
}

export class CatalogAdminProductPageResponseDto {
  @ApiProperty({ type: [CatalogAdminProductResponseDto] })
  items: CatalogAdminProductResponseDto[];

  @ApiProperty({ minimum: 1 })
  page: number;

  @ApiProperty({ minimum: 1, maximum: 100 })
  pageSize: number;

  @ApiProperty({ minimum: 0 })
  total: number;

  @ApiProperty({ minimum: 0 })
  totalPages: number;
}

export class ReceiptPrintSettingsResponseDto {
  @ApiProperty({ minimum: 1, maximum: 3 })
  mainCopies: number;
  @ApiProperty({ type: String, format: "uuid", nullable: true })
  mainPrinterId: string | null;

  @ApiProperty({ type: String, nullable: true, example: "192.168.1.50" })
  mainPrinterIp: string | null;

  @ApiProperty({ type: ReceiptPrinterResponseDto, nullable: true })
  mainPrinter: ReceiptPrinterResponseDto | null;

  @ApiProperty({ format: "date-time", type: String, nullable: true })
  updatedAt: string | null;
}
