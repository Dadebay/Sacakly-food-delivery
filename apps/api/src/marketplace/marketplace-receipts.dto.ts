import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from "class-validator";

export class SetCafeReceiptConfigDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  mainPrinterId: string;

  @ApiProperty({ minimum: 1, maximum: 3 })
  @IsInt()
  @Min(1)
  @Max(3)
  mainCopies: number;

  @ApiPropertyOptional({ type: String, description: "Cafe contact number printed on receipts" })
  @IsOptional()
  @IsString()
  @MaxLength(24)
  @Matches(/^\+?[0-9]{7,15}$/)
  businessPhone?: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  expectedVersion: number;
}

export class RotateCafeReceiptTokenDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class RouteCafeReceiptPrinterDto {
  @ApiProperty({ type: String, format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  printerId: string | null;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class CafeReceiptConfigResponseDto {
  @ApiProperty({ format: "uuid" }) cafeId: string;
  @ApiProperty({ type: String, format: "uuid", nullable: true }) mainPrinterId: string | null;
  @ApiProperty() mainCopies: number;
  @ApiProperty({ type: String, nullable: true }) businessPhone: string | null;
  @ApiProperty() agentConfigured: boolean;
  @ApiProperty() version: number;
}

export class CafeReceiptTokenResponseDto {
  @ApiProperty({ description: "Shown once; configure this token in the cafe print agent" }) token: string;
  @ApiProperty() version: number;
}
