import { ApiProperty } from "@nestjs/swagger";
import { Matches } from "class-validator";

export class CafeReportPeriodDto {
  @ApiProperty({ example: "2026-10-01", description: "First day in Asia/Ashgabat" })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from: string;

  @ApiProperty({ example: "2026-10-31", description: "Last day, inclusive, in Asia/Ashgabat" })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to: string;
}

export class CafeBranchReportDto {
  @ApiProperty({ type: String, nullable: true, format: "uuid" }) branchId: string | null;
  @ApiProperty({ type: String, nullable: true }) branchName: string | null;
  @ApiProperty() orders: number;
  @ApiProperty({ type: String }) orderValue: string;
  @ApiProperty({ type: String }) cashCollected: string;
}

export class CafeOrdersReportDto {
  @ApiProperty({ format: "uuid" }) cafeId: string;
  @ApiProperty() from: string;
  @ApiProperty() to: string;
  @ApiProperty() orders: number;
  @ApiProperty() cancelled: number;
  @ApiProperty({ type: String, description: "Non-cancelled order value, including orders in progress" }) orderValue: string;
  @ApiProperty({ type: String, description: "Cash returned or reconciled for orders created in this period" }) cashCollected: string;
  @ApiProperty({ type: String, description: "Delivered orders awaiting cash return" }) deliveredAwaitingCash: string;
  @ApiProperty({ type: [CafeBranchReportDto] }) branches: CafeBranchReportDto[];
}
