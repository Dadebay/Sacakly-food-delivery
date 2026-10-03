import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import {
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateAddressDto {
  @ApiPropertyOptional({
    description: "Delivery etrap selected from GET /delivery/config",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  deliveryEtrapId?: number;

  @ApiPropertyOptional({ example: "Дом" })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;

  @ApiProperty({ example: "Magtymguly şaýoly, 72" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address: string;

  @ApiProperty({ example: 37.9601 })
  @IsLatitude()
  latitude: number;

  @ApiProperty({ example: 58.3261 })
  @IsLongitude()
  longitude: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  entrance?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  floor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  apartment?: string;
}

export class UpdateAddressDto extends PartialType(CreateAddressDto) {}
