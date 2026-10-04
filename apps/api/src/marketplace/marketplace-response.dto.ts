import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CourierApplicationStatus, OrderStatus, Role } from "../generated/prisma/client";
import { DeliveryRequestResponseDto } from "./marketplace-dispatch.dto";

export class OwnerStatusResponseDto {
  @ApiProperty()
  owner: boolean;
}

export class MemberCafeDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;
}

export class MemberCafeResponseDto {
  @ApiProperty({ format: "uuid" })
  cafeId: string;

  @ApiProperty({ enum: Role, enumName: "Role" })
  role: Role;

  @ApiProperty({ type: MemberCafeDto })
  cafe: MemberCafeDto;
}

export class CourierApplicationResponseDto {
  @ApiProperty({ format: "uuid" })
  userId: string;

  @ApiProperty({ enum: CourierApplicationStatus })
  status: CourierApplicationStatus;

  @ApiPropertyOptional({ nullable: true })
  note: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt: Date;

  @ApiPropertyOptional({ format: "date-time", nullable: true })
  reviewedAt: Date | null;
}

export class CourierApplicantDto {
  @ApiProperty()
  phone: string;

  @ApiPropertyOptional({ nullable: true })
  firstName: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastName: string | null;
}

export class PendingCourierApplicationResponseDto extends CourierApplicationResponseDto {
  @ApiProperty({ type: CourierApplicantDto })
  user: CourierApplicantDto;
}

export class CafeModuleResponseDto {
  @ApiProperty({ format: "uuid" })
  cafeId: string;

  @ApiProperty()
  key: string;

  @ApiProperty()
  enabled: boolean;

  @ApiProperty()
  version: number;
}

export class CafeMembershipResponseDto {
  @ApiProperty({ format: "uuid" })
  cafeId: string;

  @ApiProperty({ format: "uuid" })
  userId: string;

  @ApiProperty({ enum: Role, enumName: "Role" })
  role: Role;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  version: number;
}

export class MarketplaceUserResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  phone: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  firstName: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  lastName: string | null;
}

export class CafeMembershipWithUserResponseDto extends CafeMembershipResponseDto {
  @ApiProperty({ type: MarketplaceUserResponseDto })
  user: MarketplaceUserResponseDto;
}

export class MarketplaceCafeResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  description: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  imageUrl: string | null;

  @ApiProperty()
  isActive: boolean;
}

export class DispatchCafeResponseDto {
  @ApiProperty()
  name: string;
}

export class DispatchOrderResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  number: number;

  @ApiProperty({ enum: OrderStatus })
  status: OrderStatus;

  @ApiProperty()
  version: number;

  @ApiProperty({ format: "uuid" })
  cafeId: string;

  @ApiProperty({ type: DispatchCafeResponseDto })
  cafe: DispatchCafeResponseDto;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  courierId: string | null;

  @ApiProperty()
  address: string;

  @ApiProperty({ format: "date-time" })
  createdAt: Date;
}

export class DispatchCourierResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  phone: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  firstName: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  lastName: string | null;
}

export class MerchantOrderItemResponseDto {
  @ApiProperty({ format: "uuid" }) id: string;
  @ApiProperty() productName: string;
  @ApiProperty() quantity: number;
  @ApiProperty() preparationMinutes: number;
}

export class MerchantOrderGiftResponseDto {
  @ApiProperty({ format: "uuid" }) id: string;
}

export class MerchantOrderResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  number: number;

  @ApiProperty({ enum: OrderStatus })
  status: OrderStatus;

  @ApiProperty()
  version: number;

  @ApiPropertyOptional({ format: "date-time", nullable: true })
  packingConfirmedAt: Date | null;

  @ApiProperty({ type: String })
  total: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  branchId: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt: Date;

  @ApiProperty({ type: [MerchantOrderItemResponseDto] })
  items: MerchantOrderItemResponseDto[];

  @ApiProperty({ type: [MerchantOrderGiftResponseDto] })
  gifts: MerchantOrderGiftResponseDto[];

  @ApiPropertyOptional({ type: DeliveryRequestResponseDto, nullable: true })
  deliveryRequest: DeliveryRequestResponseDto | null;
}
