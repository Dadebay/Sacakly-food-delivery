import { ApiProperty } from "@nestjs/swagger";
import { DeliveryZonePointDto, DistancePriceTierDto } from "./delivery.dto";

export class DeliverySettingsResponseDto {
  @ApiProperty({ type: [DistancePriceTierDto] })
  distancePriceTiers: DistancePriceTierDto[];

  @ApiProperty()
  mapPricingEnabled: boolean;

  @ApiProperty()
  distancePricingEnabled: boolean;

  @ApiProperty({ type: Number, nullable: true })
  dayPricePerKilometer: number | null;

  @ApiProperty({ type: Number, nullable: true })
  nightPricePerKilometer: number | null;

  @ApiProperty()
  fallbackNightPrice: number;

  @ApiProperty({ type: Number, nullable: true })
  fallbackNightFreeDeliveryThreshold: number | null;

  @ApiProperty()
  nightTariffEnabled: boolean;

  @ApiProperty({ example: "23:00" })
  nightStartsAt: string;

  @ApiProperty({ example: "07:00" })
  nightEndsAt: string;

  @ApiProperty()
  version: number;

  @ApiProperty()
  id: string;

  @ApiProperty()
  fallbackPrice: number;

  @ApiProperty({ type: Number, nullable: true })
  fallbackFreeDeliveryThreshold: number | null;

  @ApiProperty({ format: "date-time" })
  createdAt: string;

  @ApiProperty({ format: "date-time" })
  updatedAt: string;
}

export class DeliveryEtrapResponseDto {
  @ApiProperty({ type: [DeliveryZonePointDto], nullable: true })
  deliveryZone: DeliveryZonePointDto[] | null;

  @ApiProperty()
  nightPrice: number;

  @ApiProperty({ type: Number, nullable: true })
  nightFreeDeliveryThreshold: number | null;

  @ApiProperty()
  version: number;

  @ApiProperty()
  id: number;

  @ApiProperty()
  welayatId: number;

  @ApiProperty({ type: String, nullable: true })
  nameEn: string | null;

  @ApiProperty()
  nameRu: string;

  @ApiProperty()
  nameTk: string;

  @ApiProperty({ type: Number, nullable: true })
  queuePosition: number | null;

  @ApiProperty()
  price: number;

  @ApiProperty({ type: Number, nullable: true })
  freeDeliveryThreshold: number | null;

  @ApiProperty()
  isDeliveryEnabled: boolean;

  @ApiProperty({ format: "date-time" })
  updatedAt: string;
}

export class DeliveryZoneSuggestionResponseDto {
  @ApiProperty({ type: String, nullable: true })
  label: string | null;

  @ApiProperty({ type: String, nullable: true })
  nameRu: string | null;

  @ApiProperty({ type: String, nullable: true })
  nameTk: string | null;

  @ApiProperty({ type: String, nullable: true })
  nameEn: string | null;

  @ApiProperty({ type: [DeliveryZonePointDto], nullable: true })
  boundary: DeliveryZonePointDto[] | null;

  @ApiProperty({ type: String, enum: ["NOMINATIM"], nullable: true })
  provider: "NOMINATIM" | null;
}

export class DeliveryWelayatResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty({ type: String, nullable: true })
  nameEn: string | null;

  @ApiProperty()
  nameRu: string;

  @ApiProperty()
  nameTk: string;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty({ type: [DeliveryEtrapResponseDto] })
  etraps: DeliveryEtrapResponseDto[];
}

export class DeliveryConfigResponseDto {
  @ApiProperty({ type: [DistancePriceTierDto] })
  distancePriceTiers: DistancePriceTierDto[];

  @ApiProperty()
  mapPricingEnabled: boolean;

  @ApiProperty()
  distancePricingEnabled: boolean;

  @ApiProperty({ type: Number, nullable: true })
  dayPricePerKilometer: number | null;

  @ApiProperty({ type: Number, nullable: true })
  nightPricePerKilometer: number | null;

  @ApiProperty()
  fallbackNightPrice: number;

  @ApiProperty({ type: Number, nullable: true })
  fallbackNightFreeDeliveryThreshold: number | null;

  @ApiProperty()
  nightTariffEnabled: boolean;

  @ApiProperty({ example: "23:00" })
  nightStartsAt: string;

  @ApiProperty({ example: "07:00" })
  nightEndsAt: string;

  @ApiProperty()
  version: number;

  @ApiProperty({ example: "Asia/Ashgabat" })
  timeZone: string;

  @ApiProperty()
  fallbackPrice: number;

  @ApiProperty({ type: Number, nullable: true })
  fallbackFreeDeliveryThreshold: number | null;

  @ApiProperty({ type: [DeliveryWelayatResponseDto] })
  welayats: DeliveryWelayatResponseDto[];
}

export class DeliveryQuoteWelayatResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty({ type: String, nullable: true })
  nameEn: string | null;

  @ApiProperty()
  nameRu: string;

  @ApiProperty()
  nameTk: string;

  @ApiProperty()
  sortOrder: number;
}

export class DeliveryTariffQuoteResponseDto {
  @ApiProperty({ type: [DistancePriceTierDto], description: "Progressive kilometer rates; empty for area pricing. Use fee as the authoritative total." })
  distancePriceTiers: DistancePriceTierDto[];

  @ApiProperty({ enum: ["AREA", "DISTANCE"] })
  pricingMode: "AREA" | "DISTANCE";

  @ApiProperty({ type: Number, nullable: true, description: "Distance from the assigned branch" })
  distanceMeters: number | null;

  @ApiProperty({ type: Number, nullable: true, description: "Initial kilometer rate before any distancePriceTiers thresholds" })
  pricePerKilometer: number | null;

  @ApiProperty({ enum: ["DAY", "NIGHT"] })
  tariff: "DAY" | "NIGHT";

  @ApiProperty({
    type: String,
    nullable: true,
    format: "date-time",
    description:
      "Requote at this tariff boundary; null when night pricing is disabled",
  })
  validUntil: string | null;

  @ApiProperty({ example: "Asia/Ashgabat" })
  timeZone: string;

  @ApiProperty()
  subtotal: number;

  @ApiProperty()
  fee: number;

  @ApiProperty({
    description:
      "Price of the currently applicable day or night tariff before the free threshold",
  })
  price: number;

  @ApiProperty({ type: Number, nullable: true })
  freeDeliveryThreshold: number | null;

  @ApiProperty({ type: DeliveryEtrapResponseDto, nullable: true })
  etrap: DeliveryEtrapResponseDto | null;
}

export class DeliveryQuoteResponseDto extends DeliveryTariffQuoteResponseDto {
  @ApiProperty({ type: String, nullable: true })
  addressLine: string | null;

  @ApiProperty()
  latitude: number;

  @ApiProperty()
  longitude: number;

  @ApiProperty({ type: DeliveryQuoteWelayatResponseDto, nullable: true })
  welayat: DeliveryQuoteWelayatResponseDto | null;

  @ApiProperty({
    description:
      "True when the selected coordinates resolve to one unambiguous configured delivery area",
  })
  matched: boolean;

  @ApiProperty({ enum: ["MAP_ZONE", "LEGACY_TEXT", "FALLBACK"] })
  matchSource: "MAP_ZONE" | "LEGACY_TEXT" | "FALLBACK";
}
