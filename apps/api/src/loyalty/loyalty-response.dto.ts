import { ApiProperty } from "@nestjs/swagger";
import { LoyaltyEntryKind } from "../generated/prisma/client";

export class GiftResponseDto {
  @ApiProperty({ format: "uuid" }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() description: string;
  @ApiProperty() imageUrl: string;
  @ApiProperty() pointsCost: number;
  @ApiProperty({ type: Number, nullable: true }) stock: number | null;
  @ApiProperty() isActive: boolean;
  @ApiProperty() sortOrder: number;
  @ApiProperty() version: number;
  @ApiProperty({ format: "date-time" }) createdAt: string;
  @ApiProperty({ format: "date-time" }) updatedAt: string;
}

export class LoyaltyEntryResponseDto {
  @ApiProperty({ format: "uuid" }) id: string;
  @ApiProperty({ format: "uuid" }) orderId: string;
  @ApiProperty({ enum: LoyaltyEntryKind }) kind: LoyaltyEntryKind;
  @ApiProperty() points: number;
  @ApiProperty({ format: "date-time" }) createdAt: string;
}

export class LoyaltyWalletResponseDto {
  @ApiProperty() pointsBalance: number;
  @ApiProperty({ type: [LoyaltyEntryResponseDto] }) entries: LoyaltyEntryResponseDto[];
}
