import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsInt, IsUUID, Max, Min, ValidateIf } from "class-validator";
import { MarketplaceDeliveryMode, MarketplaceDeliveryStatus } from "../generated/prisma/client";

export class ChooseMarketplaceDeliveryDto {
  @ApiProperty({ enum: MarketplaceDeliveryMode })
  @IsIn([MarketplaceDeliveryMode.OWN, MarketplaceDeliveryMode.NETWORK])
  mode: MarketplaceDeliveryMode;

  @ApiPropertyOptional({ format: "uuid", description: "Required for OWN delivery" })
  @ValidateIf((dto: ChooseMarketplaceDeliveryDto) => dto.mode === MarketplaceDeliveryMode.OWN)
  @IsUUID()
  courierId?: string;

  @ApiProperty({ minimum: 1 })
  @IsInt() @Min(1) @Max(2147483647)
  expectedOrderVersion: number;
}

export class DeliveryRequestResponseDto {
  @ApiProperty({ format: "uuid" }) orderId: string;
  @ApiProperty({ format: "uuid" }) cafeId: string;
  @ApiProperty({ enum: MarketplaceDeliveryMode }) mode: MarketplaceDeliveryMode;
  @ApiProperty({ enum: MarketplaceDeliveryStatus }) status: MarketplaceDeliveryStatus;
  @ApiPropertyOptional({ format: "uuid", nullable: true }) courierId: string | null;
  @ApiProperty({ format: "date-time" }) offerAt: Date;
  @ApiPropertyOptional({ format: "date-time", nullable: true }) offeredAt: Date | null;
  @ApiPropertyOptional({ format: "date-time", nullable: true }) claimedAt: Date | null;
  @ApiProperty() version: number;
}

export class OwnCafeCourierResponseDto {
  @ApiProperty({ format: "uuid" }) id: string;
  @ApiProperty() phone: string;
  @ApiPropertyOptional({ nullable: true }) firstName: string | null;
  @ApiPropertyOptional({ nullable: true }) lastName: string | null;
}

export class ExternalDeliveryOfferResponseDto {
  @ApiProperty({ format: "uuid" }) orderId: string;
  @ApiProperty() orderNumber: number;
  @ApiProperty() cafeName: string;
  @ApiProperty({ format: "date-time" }) offeredAt: Date;
  @ApiProperty({ format: "date-time" }) estimatedReadyAt: Date;
}
