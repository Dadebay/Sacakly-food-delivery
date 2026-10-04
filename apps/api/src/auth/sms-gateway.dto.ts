import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

export enum SmsGatewayJobStatus {
  SENT = "SENT",
  DELIVERED = "DELIVERED",
  FAILED = "FAILED",
}

export class SmsGatewayJobResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ example: "+99365123456" })
  phone: string;

  @ApiProperty({ example: "Saçakly: код входа 123456." })
  message: string;

  @ApiProperty({ format: "date-time" })
  expiresAt: string;

  @ApiProperty({
    description: "Opaque lease receipt required for status updates",
  })
  receipt: string;
}

export class SmsGatewayHeartbeatResponseDto {
  @ApiProperty({ example: "android-primary" })
  deviceId: string;

  @ApiProperty({ enum: ["ONLINE"] })
  status: "ONLINE";

  @ApiProperty({ format: "date-time" })
  serverTime: string;

  @ApiProperty({ example: 3 })
  pollIntervalSeconds: number;
}

export class UpdateSmsGatewayJobStatusDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID("4")
  receipt: string;

  @ApiProperty({ enum: SmsGatewayJobStatus, enumName: "SmsGatewayJobStatus" })
  @IsEnum(SmsGatewayJobStatus)
  status: SmsGatewayJobStatus;

  @ApiPropertyOptional({ example: "NO_SIGNAL" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  errorCode?: string;
}

export class SmsGatewayStatusResponseDto {
  @ApiProperty()
  accepted: boolean;

  @ApiProperty()
  idempotent: boolean;

  @ApiProperty({ enum: SmsGatewayJobStatus, enumName: "SmsGatewayJobStatus" })
  status: SmsGatewayJobStatus;
}
