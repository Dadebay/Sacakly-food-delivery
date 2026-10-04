import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from "class-validator";

export class UpdateCourierLocationDto {
  @ApiProperty({ example: 37.9601 })
  @IsLatitude()
  latitude: number;

  @ApiProperty({ example: 58.3261 })
  @IsLongitude()
  longitude: number;

  @ApiPropertyOptional({
    description: "Estimated horizontal accuracy in metres",
    example: 18,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5_000)
  accuracy?: number;

  @ApiPropertyOptional({
    description: "Direction of travel in degrees from true north",
    example: 125,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(360)
  heading?: number;

  @ApiPropertyOptional({
    description: "Ground speed in metres per second",
    example: 8.5,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  speed?: number;

  @ApiProperty({
    description: "Timestamp supplied by the device GPS reading",
    example: "2026-07-27T12:30:00.000Z",
  })
  @IsISO8601({ strict: true })
  recordedAt: string;
}

export class CourierLocationDto {
  @ApiProperty()
  latitude: number;

  @ApiProperty()
  longitude: number;

  @ApiPropertyOptional()
  accuracy?: number;

  @ApiPropertyOptional()
  heading?: number;

  @ApiPropertyOptional()
  speed?: number;

  @ApiProperty()
  recordedAt: string;

  @ApiProperty()
  receivedAt: string;
}

export class UpdateCourierLocationResponseDto {
  @ApiProperty({ example: true })
  accepted: boolean;

  @ApiProperty({ type: CourierLocationDto })
  location: CourierLocationDto;

  @ApiProperty({ example: 15 })
  nextUpdateInSeconds: number;
}

export class StopCourierLocationResponseDto {
  @ApiProperty({ example: true })
  success: boolean;
}

export class DispatchBranchDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ example: "Saçakly Berkarar" })
  name: string;

  @ApiProperty()
  address: string;

  @ApiProperty()
  latitude: number;

  @ApiProperty()
  longitude: number;

  @ApiProperty({ type: String, nullable: true })
  phone: string | null;
}

export class DispatchOrderBranchDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ type: String, nullable: true })
  name: string | null;

  @ApiProperty({ type: String, nullable: true })
  address: string | null;

  @ApiProperty({ type: Number, nullable: true })
  latitude: number | null;

  @ApiProperty({ type: Number, nullable: true })
  longitude: number | null;
}

export class DispatchCustomerDto {
  @ApiProperty({ type: String, nullable: true })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;

  @ApiProperty()
  phone: string;
}

export class DispatchOrderItemDto {
  @ApiProperty()
  productName: string;

  @ApiProperty({ type: String, nullable: true })
  variantName: string | null;

  @ApiProperty()
  quantity: number;
}

export class DispatchOrderDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  number: number;

  @ApiProperty({
    enum: ["ASSIGNED_TO_COURIER", "OUT_FOR_DELIVERY"],
  })
  status: string;

  @ApiProperty()
  address: string;

  @ApiProperty()
  latitude: number;

  @ApiProperty()
  longitude: number;

  @ApiProperty({ type: DispatchOrderBranchDto, nullable: true })
  branch: DispatchOrderBranchDto | null;

  @ApiProperty({ type: String, nullable: true })
  entrance: string | null;

  @ApiProperty({ type: String, nullable: true })
  floor: string | null;

  @ApiProperty({ type: String, nullable: true })
  apartment: string | null;

  @ApiProperty({ type: String, nullable: true })
  customerNote: string | null;

  @ApiProperty()
  cashToCollect: number;

  @ApiProperty({ type: String, nullable: true })
  assignedAt: string | null;

  @ApiProperty({ type: DispatchCustomerDto })
  customer: DispatchCustomerDto;

  @ApiProperty({ type: [DispatchOrderItemDto] })
  items: DispatchOrderItemDto[];
}

export class DispatchCourierDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ type: String, nullable: true })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;

  @ApiProperty()
  phone: string;

  @ApiProperty({ enum: ["ONLINE", "STALE", "OFFLINE"] })
  presence: "ONLINE" | "STALE" | "OFFLINE";

  @ApiProperty({ type: CourierLocationDto, nullable: true })
  location: CourierLocationDto | null;

  @ApiProperty({ type: Number, nullable: true })
  rating: number | null;

  @ApiProperty({ type: [DispatchOrderDto] })
  activeOrders: DispatchOrderDto[];
}

export class DispatchSnapshotDto {
  @ApiProperty()
  generatedAt: string;

  @ApiProperty({ example: 15 })
  courierUpdateIntervalSeconds: number;

  @ApiProperty({ type: [DispatchBranchDto] })
  branches: DispatchBranchDto[];

  @ApiProperty({ type: [DispatchCourierDto] })
  couriers: DispatchCourierDto[];
}

export class DispatchLiveEventDto {
  @ApiProperty({ enum: ["courier.location", "heartbeat"] })
  type: "courier.location" | "heartbeat";

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  courierId: string | null;

  @ApiProperty({ type: CourierLocationDto, nullable: true })
  location: CourierLocationDto | null;

  @ApiProperty({ format: "date-time" })
  sentAt: string;
}
