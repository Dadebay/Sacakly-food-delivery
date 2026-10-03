import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { OrderStatus, Role } from "../generated/prisma/client";
import { AccountingRangeQueryDto } from "./accounting.dto";
import {
  OrderCashSettlementResponseDto,
  OrderGiftResponseDto,
  OrderRatingResponseDto,
} from "../orders/orders-response.dto";

export class InspectionRangeDto extends AccountingRangeQueryDto {
  @ApiPropertyOptional({
    description:
      "Overrides calendar dates; submitted shifts use their frozen boundaries",
    example: "2026-09-27:second",
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}:(first|second)$/)
  shiftKey?: string;
}

export class InspectionPageDto extends InspectionRangeDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 100000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page = 1;

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}

export class InspectionOrdersQueryDto extends InspectionPageDto {
  @ApiPropertyOptional({
    enum: ["created", "cashReturned"],
    default: "created",
    description:
      "Select by creation time or cash return time; submitted shifts use frozen packet membership",
  })
  @IsOptional()
  @IsIn(["created", "cashReturned"])
  basis: "created" | "cashReturned" = "created";

  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ minimum: 1, maximum: 2147483647 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  number?: number;
}

export class InspectionAuditQueryDto extends InspectionPageDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ maxLength: 120, description: "Exact audit action" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  action?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  entityType?: string;
}

export class InspectionCarryoverQueryDto extends InspectionPageDto {
  @ApiPropertyOptional({ enum: ["in", "out"], default: "out" })
  @IsOptional()
  @IsIn(["in", "out"])
  direction: "in" | "out" = "out";
}

export class InspectionActorDto {
  @ApiProperty() id: string;
  @ApiProperty({ nullable: true, type: String }) firstName: string | null;
  @ApiProperty({ nullable: true, type: String }) lastName: string | null;
  @ApiProperty({ enum: Role }) role: Role;
}

export class InspectionParticipantDto {
  @ApiProperty({ type: InspectionActorDto }) actor: InspectionActorDto;
  @ApiProperty({ type: [String] }) actions: string[];
}

export class InspectionAuditDto {
  @ApiProperty({ type: [InspectionActorDto] })
  relatedActors: InspectionActorDto[];
  @ApiProperty({ nullable: true, type: String }) orderId: string | null;
  @ApiProperty({ nullable: true, type: Number }) orderNumber: number | null;
  @ApiProperty() id: string;
  @ApiProperty() action: string;
  @ApiProperty() entityType: string;
  @ApiProperty({ nullable: true, type: String }) entityId: string | null;
  @ApiProperty({ format: "date-time" }) createdAt: string;
  @ApiProperty({ nullable: true, type: InspectionActorDto })
  actor: InspectionActorDto | null;
  @ApiProperty({
    type: Object,
    nullable: true,
    additionalProperties: true,
    description:
      "Sanitized persisted domain evidence. Legacy events may lack before/after snapshots.",
  })
  metadata: unknown;
}

export class InspectionAuditPageDto {
  @ApiProperty({ type: [InspectionAuditDto] }) items: InspectionAuditDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}

export class InspectionOrderDto {
  @ApiProperty() id: string;
  @ApiProperty() number: number;
  @ApiProperty({ enum: OrderStatus }) status: OrderStatus;
  @ApiProperty() source: string;
  @ApiProperty({ format: "date-time" }) createdAt: string;
  @ApiProperty() total: number;
  @ApiProperty() discount: number;
  @ApiProperty() deliveryFee: number;
  @ApiProperty() foodAmount: number;
  @ApiProperty() address: string;
  @ApiProperty({ nullable: true, type: String }) branchName: string | null;
  @ApiProperty({ nullable: true, type: String }) deliveryEtrapName:
    | string
    | null;
  @ApiProperty({ nullable: true, type: String }) cancellationReason:
    | string
    | null;
  @ApiProperty({ nullable: true, type: InspectionActorDto })
  courier: InspectionActorDto | null;
}

export class InspectionOrdersPageDto {
  @ApiProperty({ type: [InspectionOrderDto] }) items: InspectionOrderDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}

export class InspectionCarryoverOrderDto extends InspectionOrderDto {
  @ApiProperty({ enum: OrderStatus }) statusAtBoundary: OrderStatus;
  @ApiProperty({
    description:
      "False when a legacy edit prevents exact reconstruction of historical contents",
  })
  historicalSnapshotAvailable: boolean;
  @ApiProperty({ type: Object, additionalProperties: true, nullable: true })
  snapshot: unknown;
}

export class InspectionCarryoverPageDto {
  @ApiProperty({ type: [InspectionCarryoverOrderDto] })
  items: InspectionCarryoverOrderDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty({ format: "date-time" }) boundary: string;
  @ApiProperty({
    description:
      "For an unfinished shift, outgoing work is a live projection, not a final handoff",
  })
  isProvisional: boolean;
}

export class InspectionOrderItemDto {
  @ApiProperty() id: string;
  @ApiProperty() productName: string;
  @ApiProperty({ nullable: true, type: String }) variantName: string | null;
  @ApiProperty() quantity: number;
  @ApiProperty() unitPrice: number;
  @ApiProperty() lineTotal: number;
  @ApiProperty() preparationMinutes: number;
}

export class InspectionTransitionDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: OrderStatus }) fromStatus: OrderStatus;
  @ApiProperty({ enum: OrderStatus }) toStatus: OrderStatus;
  @ApiProperty({ format: "date-time" }) createdAt: string;
  @ApiProperty({ nullable: true, type: String }) note: string | null;
  @ApiProperty({ type: InspectionActorDto }) actor: InspectionActorDto;
}

export class InspectionSettlementDto extends OrderCashSettlementResponseDto {
  @ApiProperty({ nullable: true, type: InspectionActorDto })
  operator: InspectionActorDto | null;
  @ApiProperty({ nullable: true, type: InspectionActorDto })
  accountant: InspectionActorDto | null;
  @ApiProperty({ nullable: true, type: String, format: "uuid" }) cashHandoffId:
    | string
    | null;
}

export class InspectionOrderDetailDto extends InspectionOrderDto {
  @ApiProperty({ nullable: true, type: InspectionActorDto })
  cook: InspectionActorDto | null;
  @ApiProperty({ type: [InspectionParticipantDto] })
  participants: InspectionParticipantDto[];
  @ApiProperty({
    description:
      "Historical technical assignment; actual delivery courier is unknown",
  })
  actualCourierUnknown: boolean;
  @ApiProperty() subtotal: number;
  @ApiProperty() latitude: number;
  @ApiProperty() longitude: number;
  @ApiProperty({ nullable: true, type: String }) entrance: string | null;
  @ApiProperty({ nullable: true, type: String }) floor: string | null;
  @ApiProperty({ nullable: true, type: String }) apartment: string | null;
  @ApiProperty({ nullable: true, type: String }) branchAddress: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" })
  assignedAt: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" })
  deliveredAt: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" })
  completedAt: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" })
  packingConfirmedAt: string | null;
  @ApiProperty({ type: [OrderGiftResponseDto] }) gifts: OrderGiftResponseDto[];
  @ApiProperty({ nullable: true, type: OrderRatingResponseDto })
  rating: OrderRatingResponseDto | null;
  @ApiProperty() loyaltyPointsEarned: number;
  @ApiProperty() loyaltyPointsSpent: number;
  @ApiProperty() version: number;
  @ApiProperty() customerPhone: string;
  @ApiProperty() customerName: string;
  @ApiProperty({ nullable: true, type: String }) customerNote: string | null;
  @ApiProperty({ type: [InspectionOrderItemDto] })
  items: InspectionOrderItemDto[];
  @ApiProperty({ type: [InspectionTransitionDto] })
  transitions: InspectionTransitionDto[];
  @ApiProperty({ nullable: true, type: InspectionSettlementDto })
  settlement: InspectionSettlementDto | null;
}

export class InspectionGroupDto {
  @ApiProperty() name: string;
  @ApiProperty() count: number;
  @ApiProperty() foodAmount: number;
}

export class InspectionProductDto {
  @ApiProperty() productId: string;
  @ApiProperty() name: string;
  @ApiProperty() quantity: number;
}

export class InspectionDailyDto {
  @ApiProperty() date: string;
  @ApiProperty() orders: number;
  @ApiProperty() cancelled: number;
}

export class InspectionSummaryDto {
  @ApiProperty() createdOrders: number;
  @ApiProperty() cancelledOrders: number;
  @ApiProperty() cancellationRate: number;
  @ApiProperty() orderedFoodAmount: number;
  @ApiProperty() deliveredUnreturnedAmount: number;
  @ApiProperty() cancellationEvents: number;
  @ApiProperty() editEvents: number;
}

export class InspectionOverviewDto {
  @ApiProperty({ format: "date-time" }) periodStart: string;
  @ApiProperty({ format: "date-time" }) periodEnd: string;
  @ApiProperty() timeZone: string;
  @ApiProperty({ type: InspectionSummaryDto }) summary: InspectionSummaryDto;
  @ApiProperty({ type: [InspectionGroupDto] }) districts: InspectionGroupDto[];
  @ApiProperty({ type: [InspectionGroupDto] }) branches: InspectionGroupDto[];
  @ApiProperty({ type: [InspectionGroupDto] })
  cancellationReasons: InspectionGroupDto[];
  @ApiProperty({ type: [InspectionProductDto] })
  mostOrderedProducts: InspectionProductDto[];
  @ApiProperty({ type: [InspectionProductDto] })
  leastOrderedProducts: InspectionProductDto[];
  @ApiProperty({ type: [InspectionDailyDto] }) daily: InspectionDailyDto[];
}
