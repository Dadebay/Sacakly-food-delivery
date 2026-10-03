import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsInt, Matches, Min } from "class-validator";

export class OrderingHoursResponseDto {
  @ApiProperty() enabled: boolean;
  @ApiProperty({ example: "09:00" }) opensAt: string;
  @ApiProperty({ example: "22:00" }) closesAt: string;
  @ApiProperty({ example: "Asia/Ashgabat" }) timezone: string;
  @ApiProperty() isOpen: boolean;
  @ApiProperty({ minimum: 0 }) version: number;
  @ApiProperty({ format: "date-time" }) serverTime: string;
}

export class UpdateOrderingHoursDto {
  @ApiProperty() @IsBoolean() enabled: boolean;
  @ApiProperty({ example: "09:00" })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  opensAt: string;
  @ApiProperty({ example: "22:00" })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  closesAt: string;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) version: number;
}
