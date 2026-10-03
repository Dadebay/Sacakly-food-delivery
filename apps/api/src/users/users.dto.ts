import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
  Max,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { LoginAttemptStatus, PushDevicePlatform, Role } from "../generated/prisma/client";

export class LoginAttemptsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(24)
  phone?: string;

  @ApiPropertyOptional({ enum: LoginAttemptStatus })
  @IsOptional()
  @IsEnum(LoginAttemptStatus)
  status?: LoginAttemptStatus;

  @ApiPropertyOptional({ enum: PushDevicePlatform })
  @IsOptional()
  @IsEnum(PushDevicePlatform)
  platform?: PushDevicePlatform;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;
}

export class UpdateStaffDto {
  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role: Role;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateStaffDto {
  @ApiProperty({ example: "+99365123456" })
  @IsPhoneNumber()
  phone: string;

  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role: Role;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;
}
