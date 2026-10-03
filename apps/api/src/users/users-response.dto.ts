import { ApiProperty } from "@nestjs/swagger";
import { LoginAttemptStatus, OrderStatus, PushDevicePlatform, Role } from "../generated/prisma/client";

export class CustomerCountsResponseDto {
  @ApiProperty({ minimum: 0 }) registered: number;
  @ApiProperty({ minimum: 0 }) assistedOnly: number;
  @ApiProperty({ minimum: 0 }) totalCustomerAccounts: number;
}

export class LoginAttemptUserResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ type: String, nullable: true })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;
}

export class LoginAttemptResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;
  @ApiProperty()
  phone: string;
  @ApiProperty({ enum: LoginAttemptStatus })
  status: LoginAttemptStatus;
  @ApiProperty({ type: String, nullable: true })
  installationId: string | null;
  @ApiProperty({ type: String, nullable: true })
  deviceName: string | null;
  @ApiProperty({ enum: PushDevicePlatform, nullable: true })
  platform: PushDevicePlatform | null;
  @ApiProperty({ type: String, nullable: true })
  appVersion: string | null;
  @ApiProperty({ format: "date-time" })
  createdAt: string;
  @ApiProperty({ type: String, format: "date-time", nullable: true })
  verifiedAt: string | null;
  @ApiProperty({ type: LoginAttemptUserResponseDto, nullable: true })
  user: LoginAttemptUserResponseDto | null;
}

export class LoginAttemptSummaryResponseDto {
  @ApiProperty() total: number;
  @ApiProperty() verified: number;
  @ApiProperty() failed: number;
  @ApiProperty() requestedOrExpired: number;
}

export class LoginAttemptsResponseDto {
  @ApiProperty({ type: [LoginAttemptResponseDto] }) items: LoginAttemptResponseDto[];
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() total: number;
  @ApiProperty({ type: LoginAttemptSummaryResponseDto }) summary: LoginAttemptSummaryResponseDto;
}

export class StaffWorkCountResponseDto {
  @ApiProperty()
  courierOrders: number;

  @ApiProperty()
  cookedOrders: number;
}

export class StaffResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  phone: string;

  @ApiProperty({ type: String, nullable: true })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;

  @ApiProperty({ enum: Role })
  role: Role;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ format: "date-time" })
  createdAt: string;

  @ApiProperty({ type: StaffWorkCountResponseDto })
  _count: StaffWorkCountResponseDto;
}

export class StaffMutationResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  phone: string;

  @ApiProperty({ type: String, nullable: true })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;

  @ApiProperty({ enum: Role })
  role: Role;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ format: "date-time" })
  createdAt: string;

  @ApiProperty({ format: "date-time" })
  updatedAt: string;
}

export class RecentLoginResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  phone: string;

  @ApiProperty({ type: String, nullable: true })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;

  @ApiProperty({ enum: Role })
  role: Role;

  @ApiProperty({ format: "date-time" })
  lastLoginAt: string;
}

export class CourierOrderSummaryResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  number: number;

  @ApiProperty({ enum: OrderStatus })
  status: OrderStatus;
}

export class CourierSummaryResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  phone: string;

  @ApiProperty({ type: String, nullable: true })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;

  @ApiProperty({ type: [CourierOrderSummaryResponseDto] })
  courierOrders: CourierOrderSummaryResponseDto[];
}
