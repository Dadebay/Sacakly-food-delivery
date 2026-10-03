import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";

const MEDIA_IMAGE_PATH = /^\/api\/v1\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i;

export class CreateGiftDto {
  @ApiProperty({ maxLength: 160 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;

  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @MaxLength(4000)
  description: string;

  @ApiProperty({ description: "WebP path from POST /media/images" })
  @IsString()
  @Matches(MEDIA_IMAGE_PATH)
  imageUrl: string;

  @ApiProperty({ minimum: 1, maximum: 1_000_000 })
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  pointsCost: number;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateGiftDto extends PartialType(CreateGiftDto) {
  @ApiProperty({ minimum: 1, description: "Current gift version" })
  @IsInt()
  @Min(1)
  version: number;
}
