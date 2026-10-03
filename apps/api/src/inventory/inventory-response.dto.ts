import { ApiProperty } from "@nestjs/swagger";
import {
  InventoryMovementType,
  InventoryUnit,
} from "../generated/prisma/client";

export class InventoryIngredientResponseDto {
  @ApiProperty({ format: "uuid" }) id: string;
  @ApiProperty() name: string;
  @ApiProperty({ type: String, nullable: true }) sku: string | null;
  @ApiProperty({ enum: InventoryUnit }) unit: InventoryUnit;
  @ApiProperty() costPerUnit: number;
  @ApiProperty() reorderPoint: number;
  @ApiProperty() isActive: boolean;
  @ApiProperty({ format: "date-time" }) createdAt: string;
  @ApiProperty({ format: "date-time" }) updatedAt: string;
}

export class InventoryRecipeIngredientResponseDto {
  @ApiProperty({ format: "uuid" }) id: string;
  @ApiProperty({ format: "uuid" }) ingredientId: string;
  @ApiProperty() quantity: number;
  @ApiProperty() estimatedCost: number;
  @ApiProperty({ type: InventoryIngredientResponseDto })
  ingredient: InventoryIngredientResponseDto;
}

export class InventoryRecipeResponseDto {
  @ApiProperty({ format: "uuid" }) id: string;
  @ApiProperty({ format: "uuid" }) productId: string;
  @ApiProperty() version: number;
  @ApiProperty() productName: string;
  @ApiProperty() yieldQuantity: number;
  @ApiProperty() estimatedCost: number;
  @ApiProperty() isActive: boolean;
  @ApiProperty({ type: [InventoryRecipeIngredientResponseDto] })
  ingredients: InventoryRecipeIngredientResponseDto[];
  @ApiProperty({ format: "date-time" }) updatedAt: string;
}

export class InventoryStockResponseDto {
  @ApiProperty({ format: "uuid" }) id: string;
  @ApiProperty({ format: "uuid" }) ingredientId: string;
  @ApiProperty() ingredientName: string;
  @ApiProperty({ enum: InventoryUnit }) unit: InventoryUnit;
  @ApiProperty({ format: "uuid" }) branchId: string;
  @ApiProperty() branchName: string;
  @ApiProperty() quantity: number;
  @ApiProperty() reorderPoint: number;
  @ApiProperty({ enum: ["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK"] })
  status: string;
  @ApiProperty({ format: "date-time", nullable: true }) updatedAt:
    | string
    | null;
}

export class InventoryAlertResponseDto extends InventoryStockResponseDto {
  @ApiProperty() missingQuantity: number;
}

export class InventoryMovementResponseDto {
  @ApiProperty({ format: "uuid" }) id: string;
  @ApiProperty({ format: "uuid" }) ingredientId: string;
  @ApiProperty({ format: "uuid" }) branchId: string;
  @ApiProperty() ingredientName: string;
  @ApiProperty({ enum: InventoryUnit }) unit: InventoryUnit;
  @ApiProperty() branchName: string;
  @ApiProperty({ type: String, nullable: true, format: "uuid" }) orderId:
    | string
    | null;
  @ApiProperty({ type: Number, nullable: true }) orderNumber: number | null;
  @ApiProperty({ enum: InventoryMovementType }) type: InventoryMovementType;
  @ApiProperty() quantityDelta: number;
  @ApiProperty() quantityAfter: number;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({ format: "date-time" }) createdAt: string;
}
