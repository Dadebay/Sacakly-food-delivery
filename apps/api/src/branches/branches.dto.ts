import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
  ValidateIf,
} from "class-validator";

export class CreateBranchDto {
  @ApiProperty({ example: "AlowAlow Berkarar" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;

  @ApiProperty({ example: "Atatürk köçesi, 80" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address: string;

  @ApiProperty({ example: 37.9382 })
  @Type(() => Number)
  @IsLatitude()
  latitude: number;

  @ApiProperty({ example: 58.3731 })
  @Type(() => Number)
  @IsLongitude()
  longitude: number;

  @ApiPropertyOptional({ example: "+99365123456" })
  @IsOptional()
  @IsPhoneNumber()
  phone?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: "Use this branch when nearest-branch selection cannot be completed",
  })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class UpdateBranchDto extends PartialType(CreateBranchDto) {
  @ApiPropertyOptional({ example: "+99365123456" })
  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== "")
  @IsPhoneNumber()
  phone?: string;
}
