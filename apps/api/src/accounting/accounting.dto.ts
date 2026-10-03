import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export class AccountingRangeQueryDto {
  @ApiPropertyOptional({ example: "2026-08-20" })
  @IsOptional()
  @Matches(datePattern)
  fromDate?: string;

  @ApiPropertyOptional({ example: "2026-08-26" })
  @IsOptional()
  @Matches(datePattern)
  toDate?: string;
}

export class UpdateAccountingSettingsDto {
  @ApiProperty({ example: "Дневная смена", maxLength: 80 })
  @IsString()
  @MaxLength(80)
  firstShiftName: string;

  @ApiProperty({ example: "09:30", pattern: timePattern.source })
  @Matches(timePattern)
  firstShiftStart: string;

  @ApiProperty({ example: "Ночная смена", maxLength: 80 })
  @IsString()
  @MaxLength(80)
  secondShiftName: string;

  @ApiProperty({ example: "19:00", pattern: timePattern.source })
  @Matches(timePattern)
  secondShiftStart: string;
}

export class SubmitCashHandoffDto {
  @ApiProperty({ example: "2026-08-25:first" })
  @Matches(/^\d{4}-\d{2}-\d{2}:(first|second)$/)
  shiftKey: string;

  @ApiPropertyOptional({ example: 1250.5, minimum: 0, maximum: 99999999 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999)
  declaredAmount?: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ConfirmCashHandoffDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
