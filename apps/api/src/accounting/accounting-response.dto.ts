import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class AccountingSettingsResponseDto {
  @ApiProperty()
  firstShiftName: string;

  @ApiProperty({ example: "09:30" })
  firstShiftStart: string;

  @ApiProperty()
  secondShiftName: string;

  @ApiProperty({ example: "19:00" })
  secondShiftStart: string;

  @ApiProperty({ example: "Asia/Ashgabat" })
  timeZone: string;

  @ApiProperty({ format: "date-time" })
  updatedAt: string;
}

export class CashHandoffActorResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  firstName: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  lastName: string | null;
}

export class CashHandoffResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  shiftKey: string;

  @ApiProperty()
  shiftName: string;

  @ApiProperty({ format: "date-time" })
  periodStart: string;

  @ApiProperty({ format: "date-time" })
  periodEnd: string;

  @ApiProperty()
  expectedAmount: number;

  @ApiProperty()
  declaredAmount: number;

  @ApiProperty()
  settlementCount: number;

  @ApiProperty({ enum: ["SUBMITTED", "CONFIRMED"] })
  status: "SUBMITTED" | "CONFIRMED";

  @ApiPropertyOptional({ type: String, nullable: true })
  note: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  confirmationNote: string | null;

  @ApiProperty({ format: "date-time" })
  submittedAt: string;

  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  confirmedAt: string | null;

  @ApiProperty({ type: CashHandoffActorResponseDto })
  submittedBy: CashHandoffActorResponseDto;

  @ApiPropertyOptional({ type: CashHandoffActorResponseDto, nullable: true })
  confirmedBy: CashHandoffActorResponseDto | null;
}

export class AccountingShiftResponseDto {
  @ApiProperty()
  shiftKey: string;

  @ApiProperty()
  shiftName: string;

  @ApiProperty({ format: "date-time" })
  periodStart: string;

  @ApiProperty({ format: "date-time" })
  periodEnd: string;

  @ApiProperty()
  isComplete: boolean;

  @ApiProperty()
  expectedAmount: number;

  @ApiProperty()
  availableAmount: number;

  @ApiProperty()
  settlementCount: number;

  @ApiProperty()
  canSubmit: boolean;

  @ApiProperty({ enum: ["OPEN", "EMPTY", "READY", "SUBMITTED", "CONFIRMED"] })
  state: string;

  @ApiPropertyOptional({ type: CashHandoffResponseDto, nullable: true })
  handoff: CashHandoffResponseDto | null;
}

export class AccountingReportSummaryResponseDto {
  @ApiProperty({ description: "Sum of declared cash for packets whose shift starts in the period" })
  declaredHandoffAmount: number;

  @ApiProperty({ description: "Declared minus expected cash for packets whose shift starts in the period; negative means shortage" })
  handoffDiscrepancy: number;

  @ApiProperty()
  collectedAmount: number;

  @ApiProperty()
  completedOrders: number;

  @ApiProperty()
  averageOrderAmount: number;

  @ApiProperty()
  submittedAmount: number;

  @ApiProperty()
  confirmedAmount: number;

  @ApiProperty()
  outstandingAmount: number;

  @ApiProperty()
  cancelledOrders: number;

  @ApiProperty()
  cancellationRate: number;
}

export class AccountingDailyResponseDto {
  @ApiProperty()
  date: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  orderCount: number;
}

export class AccountingPopularProductResponseDto {
  @ApiProperty({ format: "uuid" })
  productId: string;

  @ApiProperty()
  productName: string;

  @ApiProperty()
  quantity: number;

  @ApiProperty()
  revenue: number;
}

export class AccountingReportResponseDto {
  @ApiProperty()
  fromDate: string;

  @ApiProperty()
  toDate: string;

  @ApiProperty()
  timeZone: string;

  @ApiProperty({ type: AccountingReportSummaryResponseDto })
  summary: AccountingReportSummaryResponseDto;

  @ApiProperty({ type: [AccountingDailyResponseDto] })
  daily: AccountingDailyResponseDto[];

  @ApiProperty({ type: [CashHandoffResponseDto] })
  handoffs: CashHandoffResponseDto[];

  @ApiProperty({ type: [AccountingPopularProductResponseDto] })
  popularProducts: AccountingPopularProductResponseDto[];
}
