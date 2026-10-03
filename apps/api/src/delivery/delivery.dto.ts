import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Matches,
  Min,
  ValidateNested,
  ValidateIf,
} from "class-validator";

const trimString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class DeliveryZonePointDto {
  @ApiProperty({ example: 37.9601 })
  @IsLatitude()
  latitude: number;

  @ApiProperty({ example: 58.3261 })
  @IsLongitude()
  longitude: number;
}

export class QuoteDeliveryDto {
  @ApiProperty({ example: 37.9601 })
  @IsLatitude()
  latitude: number;

  @ApiProperty({ example: 58.3261 })
  @IsLongitude()
  longitude: number;

  @ApiProperty({ minimum: 0, maximum: 1_000_000, example: 120 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  subtotal: number;
}

export class QuoteDeliveryTariffDto {
  @ApiProperty({ minimum: 0, maximum: 1_000_000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  subtotal: number;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 1,
    description: "Null or omitted uses the fallback tariff",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  deliveryEtrapId?: number | null;

  @ApiPropertyOptional({ example: 37.9601, description: "Required with longitude for kilometer pricing" })
  @ValidateIf((dto: QuoteDeliveryTariffDto) => dto.latitude !== undefined || dto.longitude !== undefined)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ example: 58.3261, description: "Required with latitude for kilometer pricing" })
  @ValidateIf((dto: QuoteDeliveryTariffDto) => dto.latitude !== undefined || dto.longitude !== undefined)
  @IsLongitude()
  longitude?: number;
}

export class DistancePriceTierDto {
  @ApiProperty({ minimum: 0.01, maximum: 10000, example: 5, description: "New rate applies only to kilometers after this threshold" })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10000)
  afterKilometers: number;

  @ApiProperty({ minimum: 0.01, maximum: 10000, example: 7 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10000)
  dayPricePerKilometer: number;

  @ApiProperty({ minimum: 0.01, maximum: 10000, example: 10 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10000)
  nightPricePerKilometer: number;
}

export class UpdateDeliverySettingsDto {
  @ApiPropertyOptional({ type: [DistancePriceTierDto], maxItems: 20, description: "Ascending unique distance thresholds. Empty array removes tiers; omission preserves them. Requires version." })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => DistancePriceTierDto)
  distancePriceTiers?: DistancePriceTierDto[];

  @ApiPropertyOptional({
    minimum: 1,
    description:
      "Current configuration version; required when changing night settings",
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  version?: number;

  @ApiPropertyOptional({
    description:
      "Use map polygons as the only district source for coordinate quotes and order pricing",
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  mapPricingEnabled?: boolean;

  @ApiPropertyOptional({ description: "Select kilometer pricing instead of the existing area tariff" })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  distancePricingEnabled?: boolean;

  @ApiPropertyOptional({ minimum: 0.01, maximum: 10000, nullable: true })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10000)
  dayPricePerKilometer?: number;

  @ApiPropertyOptional({ minimum: 0.01, maximum: 10000, nullable: true })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10000)
  nightPricePerKilometer?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1_000_000 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  fallbackNightPrice?: number;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: 1_000_000,
    description: "Null disables free delivery during the night tariff",
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  fallbackNightFreeDeliveryThreshold?: number | null;

  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  nightTariffEnabled?: boolean;

  @ApiPropertyOptional({
    example: "23:00",
    description: "Inclusive start in Asia/Ashgabat, HH:mm",
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  nightStartsAt?: string;

  @ApiPropertyOptional({
    example: "07:00",
    description: "Exclusive end in Asia/Ashgabat, HH:mm",
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  nightEndsAt?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1_000_000 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  fallbackPrice?: number;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: 1_000_000,
    description:
      "Null disables free delivery for legacy addresses without an etrap",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  fallbackFreeDeliveryThreshold?: number | null;
}

export class UpdateDeliveryEtrapDto {
  @ApiPropertyOptional({
    minimum: 1,
    description:
      "Current configuration version; required when changing night settings",
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  version?: number;

  @ApiPropertyOptional({
    type: [DeliveryZonePointDto],
    nullable: true,
    minItems: 3,
    maxItems: 64,
    description:
      "Ordered map boundary points. Null removes the zone; the backend closes the polygon.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => DeliveryZonePointDto)
  deliveryZone?: DeliveryZonePointDto[] | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 1_000_000 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  nightPrice?: number;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: 1_000_000,
    description: "Null disables free delivery during the night tariff",
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  nightFreeDeliveryThreshold?: number | null;

  @ApiPropertyOptional({ minimum: 1, maximum: 2_147_483_647 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  welayatId?: number;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 240 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(240)
  nameEn?: string | null;

  @ApiPropertyOptional({ maxLength: 240 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  nameRu?: string;

  @ApiPropertyOptional({ maxLength: 240 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  nameTk?: string;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: 1_000_000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  queuePosition?: number | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 1_000_000 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  price?: number;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: 1_000_000,
    description: "Null disables free delivery for this etrap",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  freeDeliveryThreshold?: number | null;

  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  isDeliveryEnabled?: boolean;
}

export class CreateDeliveryWelayatDto {
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 160 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(160)
  nameEn?: string | null;

  @ApiProperty({ maxLength: 160 })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  nameRu: string;

  @ApiProperty({ maxLength: 160 })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  nameTk: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1_000_000, default: 0 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  sortOrder?: number;
}

export class UpdateDeliveryWelayatDto {
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 160 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(160)
  nameEn?: string | null;

  @ApiPropertyOptional({ maxLength: 160 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  nameRu?: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  nameTk?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1_000_000 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  sortOrder?: number;
}

export class CreateDeliveryEtrapDto {
  @ApiPropertyOptional({
    type: [DeliveryZonePointDto],
    nullable: true,
    minItems: 3,
    maxItems: 64,
    description:
      "Ordered map boundary points. Null or omission creates the district without a map zone.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => DeliveryZonePointDto)
  deliveryZone?: DeliveryZonePointDto[] | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 1_000_000 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  nightPrice?: number;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: 1_000_000,
    description: "Null disables free delivery during the night tariff",
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  nightFreeDeliveryThreshold?: number | null;

  @ApiProperty({ minimum: 1, maximum: 2_147_483_647 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  welayatId: number;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 240 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(240)
  nameEn?: string | null;

  @ApiProperty({ maxLength: 240 })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  nameRu: string;

  @ApiProperty({ maxLength: 240 })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  nameTk: string;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: 1_000_000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  queuePosition?: number | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 1_000_000, default: 15 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  price?: number;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: 1_000_000,
    default: 150,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  freeDeliveryThreshold?: number | null;

  @ApiPropertyOptional({ default: false })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  isDeliveryEnabled?: boolean;
}
