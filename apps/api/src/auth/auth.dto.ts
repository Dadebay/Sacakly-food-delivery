import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsOptional,
  IsEnum,
  IsPhoneNumber,
  IsString,
  Length,
  Matches,
  MaxLength,
} from "class-validator";
import { Role } from "../generated/prisma/client";
import { PushDevicePlatform } from "../generated/prisma/client";

export class RequestOtpDto {
  @ApiProperty({ example: "+99365123456" })
  @IsPhoneNumber()
  phone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  installationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  deviceName?: string;

  @ApiPropertyOptional({ enum: PushDevicePlatform })
  @IsOptional()
  @IsEnum(PushDevicePlatform)
  platform?: PushDevicePlatform;

  @ApiPropertyOptional({ example: "1.0.0" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  appVersion?: string;
}

export class VerifyOtpDto extends RequestOtpDto {
  @ApiProperty({
    example: "123456",
    description:
      "Six-digit SMS code, or a four-digit code for an explicitly configured time-boxed test account",
  })
  @IsString()
  @Length(4, 6)
  @Matches(/^(?:\d{4}|\d{6})$/)
  code: string;

  @ApiPropertyOptional({ example: "Aman" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional({ example: "Ataýew" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;
}

export class RefreshTokenDto {
  @ApiProperty({
    description: "Opaque refresh token returned by OTP verification or refresh",
  })
  @IsString()
  @MaxLength(500)
  refreshToken: string;
}

export class RequestOtpResponseDto {
  @ApiProperty({ example: 300 })
  expiresInSeconds: number;

  @ApiPropertyOptional({
    description: "Development-only console SMS code",
    example: "123456",
  })
  devCode?: string;
}

export class AuthSessionUserDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  phone: string;

  @ApiProperty({ type: String, nullable: true })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;

  @ApiProperty({ enum: Role, enumName: "Role" })
  role: Role;
}

export class AuthSessionResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty({ example: 31_536_000 })
  expiresInSeconds: number;

  @ApiProperty({ type: AuthSessionUserDto })
  user: AuthSessionUserDto;
}

export class LogoutResponseDto {
  @ApiProperty({ example: true })
  success: boolean;
}
