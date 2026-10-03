import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class ReverseGeocodeQueryDto {
  @ApiProperty({ example: 37.9601 })
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @ApiProperty({ example: 58.3261 })
  @Type(() => Number)
  @IsLongitude()
  lon: number;
}

export class ReverseGeocodeResponseDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: "Parahat 7, Görogly köçesi",
  })
  line: string | null;
}

export class SearchGeocodeQueryDto {
  @ApiProperty({ example: "Parahat 7 Görogly" })
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  q: string;

  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit = 5;
}

export class SearchGeocodeResultDto {
  @ApiProperty()
  label: string;

  @ApiProperty()
  latitude: number;

  @ApiProperty()
  longitude: number;

  @ApiProperty({ type: [String] })
  aliases: string[];

  @ApiProperty({ enum: ["NOMINATIM", "PHOTON"] })
  provider: "NOMINATIM" | "PHOTON";
}

export class SearchGeocodeResponseDto {
  @ApiProperty({ type: [SearchGeocodeResultDto] })
  items: SearchGeocodeResultDto[];

  @ApiProperty({ example: "© OpenStreetMap contributors" })
  attribution: string;
}
