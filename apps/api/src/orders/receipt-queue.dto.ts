import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { ReceiptPrintTaskStatus } from "../generated/prisma/client";
import { ReceiptPrintPlanResponseDto } from "./orders-response.dto";

export class ClaimReceiptDto {
  @ApiProperty({
    format: "uuid",
    description: "Persistent agent ID returned by dispatch-journal-v1 health",
  })
  @IsUUID()
  stationId: string;
}
export class ReceiptLeaseDto extends ClaimReceiptDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  claimToken: string;
}
export class ReceiptAgentLeaseDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  claimToken: string;
}
export class ReceiptAgentOutcomeDto extends ReceiptAgentLeaseDto {
  @ApiProperty({ enum: ["DELIVERED", "RETRY", "UNCERTAIN", "FAILED"] })
  @IsIn(["DELIVERED", "RETRY", "UNCERTAIN", "FAILED"])
  outcome: "DELIVERED" | "RETRY" | "UNCERTAIN" | "FAILED";

  @ApiPropertyOptional({
    enum: [
      "AGENT_UNAVAILABLE",
      "PRINTER_UNAVAILABLE",
      "DELIVERY_UNCERTAIN",
      "NO_PRINTERS",
      "JOURNAL_UNAVAILABLE",
      "INVALID_PLAN",
    ],
  })
  @IsOptional()
  @IsIn([
    "AGENT_UNAVAILABLE",
    "PRINTER_UNAVAILABLE",
    "DELIVERY_UNCERTAIN",
    "NO_PRINTERS",
    "JOURNAL_UNAVAILABLE",
    "INVALID_PLAN",
  ])
  errorCode?: string;
}
export class ReceiptOutcomeDto extends ReceiptLeaseDto {
  @ApiProperty({ enum: ["DELIVERED", "RETRY", "UNCERTAIN", "FAILED"] })
  @IsIn(["DELIVERED", "RETRY", "UNCERTAIN", "FAILED"])
  outcome: "DELIVERED" | "RETRY" | "UNCERTAIN" | "FAILED";

  @ApiPropertyOptional({
    enum: [
      "AGENT_UNAVAILABLE",
      "PRINTER_UNAVAILABLE",
      "DELIVERY_UNCERTAIN",
      "NO_PRINTERS",
      "JOURNAL_UNAVAILABLE",
      "INVALID_PLAN",
    ],
  })
  @IsOptional()
  @IsIn([
    "AGENT_UNAVAILABLE",
    "PRINTER_UNAVAILABLE",
    "DELIVERY_UNCERTAIN",
    "NO_PRINTERS",
    "JOURNAL_UNAVAILABLE",
    "INVALID_PLAN",
  ])
  errorCode?: string;
}
export class ReceiptItemRouteDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  itemId: string;

  @ApiProperty({
    type: String,
    format: "uuid",
    nullable: true,
    description: "Null prints this item only on the main cash register",
  })
  @IsOptional()
  @IsUUID()
  printerId: string | null;

  @ApiPropertyOptional({
    description:
      "Omit this order item from both the main and kitchen copies of this manual print",
  })
  @IsOptional()
  @IsBoolean()
  skip?: boolean;
}

export class ReprintReceiptDto {
  @ApiPropertyOptional({
    minimum: 0,
    maximum: 3,
    description: "Main receipt copies for this manual print only. Zero disables the main receipt; omission preserves configured defaults. Administrators only.",
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(3)
  mainCopies?: number;

  @ApiProperty({
    format: "uuid",
    description:
      "A new key means an intentional new paper copy; reuse on HTTP retry",
  })
  @IsUUID()
  idempotencyKey: string;

  @ApiPropertyOptional({ type: [ReceiptItemRouteDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReceiptItemRouteDto)
  itemRoutes?: ReceiptItemRouteDto[];
}
export class ReceiptTaskResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() orderId: string;
  @ApiProperty() orderNumber: number;
  @ApiProperty({ type: [String], description: "Dish names in this queued print task" })
  itemNames: string[];
  @ApiProperty() documentType: string;
  @ApiProperty({ enum: ReceiptPrintTaskStatus }) status: ReceiptPrintTaskStatus;
  @ApiProperty() attempts: number;
  @ApiProperty() createdAt: string;
  @ApiProperty() nextAttemptAt: string;
  @ApiProperty({ type: String, nullable: true }) stationId: string | null;
  @ApiProperty({ type: String, nullable: true }) lastError: string | null;
  @ApiProperty({ type: String, nullable: true }) deliveredAt: string | null;
}
export class ReceiptClaimResponseDto extends ReceiptTaskResponseDto {
  @ApiProperty() dispatchId: string;
  @ApiProperty() claimToken: string;
  @ApiProperty() leaseExpiresAt: string;
  @ApiProperty({ type: ReceiptPrintPlanResponseDto })
  plan: ReceiptPrintPlanResponseDto;
}
export class ReceiptClaimResultDto {
  @ApiProperty({ type: ReceiptClaimResponseDto, nullable: true })
  task: ReceiptClaimResponseDto | null;
}
export class ReceiptQueueResponseDto {
  @ApiProperty({ type: [ReceiptTaskResponseDto] })
  items: ReceiptTaskResponseDto[];
  @ApiProperty() pending: number;
  @ApiProperty() needsAttention: number;
  @ApiProperty({ enum: ["DIRECT_AGENT", "BROWSER_BRIDGE"] })
  consumerMode: "DIRECT_AGENT" | "BROWSER_BRIDGE";
}

export class ReceiptQueueHistoryResponseDto {
  @ApiProperty({ type: [ReceiptTaskResponseDto] })
  items: ReceiptTaskResponseDto[];
}

export class ReceiptActionResponseDto {
  @ApiProperty() ok: boolean;
}
