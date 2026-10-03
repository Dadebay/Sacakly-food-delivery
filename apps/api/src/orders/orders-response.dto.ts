import { ApiProperty } from "@nestjs/swagger";
import {
  CashSettlementStatus,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  PromoType,
  ReceiptPrinterTransport,
  Role,
} from "../generated/prisma/client";
import { ReceiptDocumentType } from "./receipt-print-plan";

export class OrderCustomerResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  phone: string;

  @ApiProperty({ type: String, nullable: true })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;
}

export class AssistedCustomerAddressResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ type: Number, nullable: true })
  deliveryEtrapId: number | null;

  @ApiProperty({ type: String, nullable: true })
  label: string | null;

  @ApiProperty()
  address: string;

  @ApiProperty()
  latitude: number;

  @ApiProperty()
  longitude: number;

  @ApiProperty({ type: String, nullable: true })
  entrance: string | null;

  @ApiProperty({ type: String, nullable: true })
  floor: string | null;

  @ApiProperty({ type: String, nullable: true })
  apartment: string | null;

  @ApiProperty()
  isActive: boolean;
}

export class AssistedCustomerResponseDto extends OrderCustomerResponseDto {
  @ApiProperty({ type: [AssistedCustomerAddressResponseDto] })
  addresses: AssistedCustomerAddressResponseDto[];
}

export class AssistedCustomerListResponseDto {
  @ApiProperty({ type: [AssistedCustomerResponseDto] })
  items: AssistedCustomerResponseDto[];
}

export class OrderStaffResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ type: String, nullable: true })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;
}

export class OrderCourierResponseDto extends OrderStaffResponseDto {
  @ApiProperty()
  phone: string;
}

export class OrderItemResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  orderId: string;

  @ApiProperty({ format: "uuid" })
  productId: string;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  productVariantId: string | null;

  @ApiProperty()
  productName: string;

  @ApiProperty({ type: String, nullable: true })
  variantName: string | null;

  @ApiProperty({ minimum: 0 })
  preparationMinutes: number;

  @ApiProperty({ minimum: 0, description: "Points earned by this order line after delivery" })
  loyaltyPoints: number;

  @ApiProperty({ type: String, nullable: true })
  productImageUrl: string | null;

  @ApiProperty()
  unitPrice: number;

  @ApiProperty()
  quantity: number;

  @ApiProperty()
  lineTotal: number;
}

export class OrderQuoteItemResponseDto {
  @ApiProperty({ format: "uuid" })
  productId: string;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  productVariantId: string | null;

  @ApiProperty()
  productName: string;

  @ApiProperty({ type: String, nullable: true })
  variantName: string | null;

  @ApiProperty({ type: String, nullable: true })
  productImageUrl: string | null;

  @ApiProperty()
  quantity: number;

  @ApiProperty({ minimum: 0 })
  loyaltyPoints: number;

  @ApiProperty({
    description: "Current backend-owned price for one selected item",
  })
  unitPrice: number;

  @ApiProperty({ description: "Line total before the promo discount" })
  originalLineTotal: number;

  @ApiProperty({
    description: "Proportional share of the order promo discount",
  })
  discount: number;

  @ApiProperty({ description: "Line total after the allocated promo discount" })
  discountedLineTotal: number;
}

export class OrderQuotePromoResponseDto {
  @ApiProperty()
  code: string;

  @ApiProperty({ enum: PromoType })
  type: PromoType;

  @ApiProperty()
  value: number;

  @ApiProperty()
  discount: number;
}

export class OrderGiftResponseDto {
  @ApiProperty({ format: "uuid" }) id: string;
  @ApiProperty({ format: "uuid" }) orderId: string;
  @ApiProperty({ format: "uuid" }) giftId: string;
  @ApiProperty() name: string;
  @ApiProperty() imageUrl: string;
  @ApiProperty() pointsCost: number;
  @ApiProperty() quantity: number;
  @ApiProperty() totalPoints: number;
}

export class OrderQuoteGiftResponseDto {
  @ApiProperty({ format: "uuid" }) giftId: string;
  @ApiProperty() name: string;
  @ApiProperty() imageUrl: string;
  @ApiProperty() pointsCost: number;
  @ApiProperty() quantity: number;
  @ApiProperty() totalPoints: number;
}

export class OrderQuoteResponseDto {
  @ApiProperty({ type: [OrderQuoteItemResponseDto] })
  items: OrderQuoteItemResponseDto[];

  @ApiProperty({ type: [OrderQuoteGiftResponseDto] })
  gifts: OrderQuoteGiftResponseDto[];

  @ApiProperty() pointsBalance: number;
  @ApiProperty() loyaltyPointsEarned: number;
  @ApiProperty() loyaltyPointsSpent: number;

  @ApiProperty({ type: OrderQuotePromoResponseDto, nullable: true })
  promo: OrderQuotePromoResponseDto | null;

  @ApiProperty({ description: "Items total before the promo discount" })
  subtotal: number;

  @ApiProperty()
  discount: number;

  @ApiProperty({ description: "Items total after the promo discount" })
  discountedSubtotal: number;

  @ApiProperty()
  deliveryFee: number;

  @ApiProperty({ description: "Discounted items plus delivery" })
  total: number;

  @ApiProperty({ type: Number, nullable: true })
  deliveryEtrapId: number | null;

  @ApiProperty({ type: String, nullable: true })
  deliveryWelayatName: string | null;

  @ApiProperty({ type: String, nullable: true })
  deliveryEtrapName: string | null;
}

export class ReceiptPrintItemResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  quantity: number;

  @ApiProperty()
  unitPrice: number;
}

export class ReceiptPrinterJobResponseDto {
  @ApiProperty({ example: "192.168.123.100" })
  printerIp: string;

  @ApiProperty({ example: 9100 })
  printerPort: number;

  @ApiProperty({ enum: ReceiptPrinterTransport })
  transport: ReceiptPrinterTransport;

  @ApiProperty({ type: [ReceiptPrintItemResponseDto] })
  items: ReceiptPrintItemResponseDto[];
}

export class ReceiptPrintSummaryResponseDto {
  @ApiProperty()
  subtotal: number;

  @ApiProperty()
  discount: number;

  @ApiProperty()
  deliveryFee: number;

  @ApiProperty()
  total: number;

  @ApiProperty({ type: String, nullable: true })
  deliveryAreaName: string | null;
}

export class ReceiptPrintMetadataResponseDto {
  @ApiProperty({ format: "date-time" })
  createdAt: string;

  @ApiProperty({ type: String, nullable: true })
  businessPhone: string | null;

  @ApiProperty({ type: String, nullable: true })
  branchName: string | null;

  @ApiProperty({ type: String, nullable: true })
  customerName: string | null;

  @ApiProperty()
  customerPhone: string;

  @ApiProperty()
  address: string;

  @ApiProperty({ type: String, nullable: true })
  addressDetails: string | null;

  @ApiProperty({ type: String, nullable: true })
  customerNote: string | null;
}

export class ReceiptPrintPlanResponseDto {
  @ApiProperty({ minimum: 1, maximum: 3 })
  mainCopies: number;
  @ApiProperty({ format: "uuid" })
  orderId: string;

  @ApiProperty()
  orderNumber: number;

  @ApiProperty({ type: ReceiptPrintMetadataResponseDto, nullable: true })
  metadata: ReceiptPrintMetadataResponseDto | null;

  @ApiProperty({ enum: ReceiptDocumentType })
  documentType: ReceiptDocumentType;

  @ApiProperty({ type: String, nullable: true })
  cancellationReason: string | null;

  @ApiProperty({ type: ReceiptPrintSummaryResponseDto })
  summary: ReceiptPrintSummaryResponseDto;

  @ApiProperty({ type: ReceiptPrinterJobResponseDto, nullable: true })
  mainJob: ReceiptPrinterJobResponseDto | null;

  @ApiProperty({ type: [ReceiptPrinterJobResponseDto] })
  jobs: ReceiptPrinterJobResponseDto[];

  @ApiProperty({ type: [ReceiptPrintItemResponseDto] })
  unassignedItems: ReceiptPrintItemResponseDto[];
}

export class OrderRatingResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  orderId: string;

  @ApiProperty({ format: "uuid" })
  customerId: string;

  @ApiProperty()
  score: number;

  @ApiProperty({ type: String, nullable: true })
  comment: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt: string;
}

export class OrderCashSettlementResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  orderId: string;

  @ApiProperty({ format: "uuid" })
  courierId: string;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  operatorId: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  accountantId: string | null;

  @ApiProperty()
  amount: number;

  @ApiProperty({ enum: CashSettlementStatus })
  status: CashSettlementStatus;

  @ApiProperty({ format: "date-time" })
  courierGivenAt: string;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  operatorTakenAt: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  reconciledAt: string | null;
}

export class OrderSavedAddressResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ type: Number, nullable: true })
  deliveryEtrapId: number | null;

  @ApiProperty({ format: "uuid" })
  userId: string;

  @ApiProperty()
  label: string;

  @ApiProperty()
  address: string;

  @ApiProperty()
  latitude: number;

  @ApiProperty()
  longitude: number;

  @ApiProperty({ type: String, nullable: true })
  entrance: string | null;

  @ApiProperty({ type: String, nullable: true })
  floor: string | null;

  @ApiProperty({ type: String, nullable: true })
  apartment: string | null;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ format: "date-time" })
  createdAt: string;

  @ApiProperty({ format: "date-time" })
  updatedAt: string;
}

export class OrderTransitionActorResponseDto extends OrderStaffResponseDto {
  @ApiProperty({ enum: Role })
  role: Role;
}

export class OrderTransitionResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  orderId: string;

  @ApiProperty({ format: "uuid" })
  actorId: string;

  @ApiProperty({ enum: OrderStatus })
  fromStatus: OrderStatus;

  @ApiProperty({ enum: OrderStatus })
  toStatus: OrderStatus;

  @ApiProperty({ type: String, nullable: true })
  note: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt: string;

  @ApiProperty({ type: OrderTransitionActorResponseDto })
  actor: OrderTransitionActorResponseDto;
}

export class OrderResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  number: number;

  @ApiProperty({ format: "uuid" })
  customerId: string;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  addressId: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  branchId: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  cookId: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  courierId: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  promoCodeId: string | null;

  @ApiProperty({ type: Number, nullable: true })
  deliveryEtrapId: number | null;

  @ApiProperty({ enum: OrderStatus })
  status: OrderStatus;

  @ApiProperty({ enum: OrderSource })
  source: OrderSource;

  @ApiProperty({ enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  @ApiProperty()
  subtotal: number;

  @ApiProperty()
  discount: number;

  @ApiProperty()
  deliveryFee: number;

  @ApiProperty()
  total: number;

  @ApiProperty()
  loyaltyPointsEarned: number;

  @ApiProperty()
  loyaltyPointsSpent: number;

  @ApiProperty()
  address: string;

  @ApiProperty()
  latitude: number;

  @ApiProperty()
  longitude: number;

  @ApiProperty({ type: String, nullable: true })
  entrance: string | null;

  @ApiProperty({ type: String, nullable: true })
  floor: string | null;

  @ApiProperty({ type: String, nullable: true })
  apartment: string | null;

  @ApiProperty({ type: String, nullable: true })
  deliveryWelayatName: string | null;

  @ApiProperty({ type: String, nullable: true })
  deliveryEtrapName: string | null;

  @ApiProperty({ type: String, nullable: true })
  branchName: string | null;

  @ApiProperty({ type: String, nullable: true })
  branchAddress: string | null;

  @ApiProperty({ type: Number, nullable: true })
  branchLatitude: number | null;

  @ApiProperty({ type: Number, nullable: true })
  branchLongitude: number | null;

  @ApiProperty({ type: Number, nullable: true })
  branchDistanceMeters: number | null;

  @ApiProperty({ type: String, nullable: true })
  customerNote: string | null;

  @ApiProperty({ type: String, nullable: true })
  cancellationReason: string | null;

  @ApiProperty()
  version: number;

  @ApiProperty({ format: "date-time" })
  createdAt: string;

  @ApiProperty({ format: "date-time" })
  updatedAt: string;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  assignedAt: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  deliveredAt: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  completedAt: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  packingConfirmedAt: string | null;

  @ApiProperty({ type: OrderCustomerResponseDto })
  customer: OrderCustomerResponseDto;

  @ApiProperty({ type: OrderStaffResponseDto, nullable: true })
  cook: OrderStaffResponseDto | null;

  @ApiProperty({ type: OrderCourierResponseDto, nullable: true })
  courier: OrderCourierResponseDto | null;

  @ApiProperty({ type: [OrderItemResponseDto] })
  items: OrderItemResponseDto[];

  @ApiProperty({ type: [OrderGiftResponseDto] })
  gifts: OrderGiftResponseDto[];

  @ApiProperty({ type: OrderRatingResponseDto, nullable: true })
  rating: OrderRatingResponseDto | null;

  @ApiProperty({ type: OrderCashSettlementResponseDto, nullable: true })
  cashSettlement: OrderCashSettlementResponseDto | null;

  @ApiProperty({ type: OrderSavedAddressResponseDto, nullable: true })
  savedAddress: OrderSavedAddressResponseDto | null;

  @ApiProperty({ type: [OrderTransitionResponseDto] })
  transitions: OrderTransitionResponseDto[];
}

export class OrderListResponseDto {
  @ApiProperty({ type: [OrderResponseDto] })
  items: OrderResponseDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  total: number;

  @ApiProperty()
  pages: number;
}

export class CourierRouteCustomerResponseDto {
  @ApiProperty()
  phone: string;

  @ApiProperty({ type: String, nullable: true })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;
}

export class CourierRouteItemResponseDto {
  @ApiProperty()
  productName: string;

  @ApiProperty({ type: String, nullable: true })
  variantName: string | null;

  @ApiProperty()
  quantity: number;
}

export class CourierRouteStopResponseDto {
  @ApiProperty()
  sequence: number;

  @ApiProperty({ format: "uuid" })
  orderId: string;

  @ApiProperty()
  orderNumber: number;

  @ApiProperty({ enum: OrderStatus })
  status: OrderStatus;

  @ApiProperty()
  address: string;

  @ApiProperty()
  latitude: number;

  @ApiProperty()
  longitude: number;

  @ApiProperty({ type: String, nullable: true })
  entrance: string | null;

  @ApiProperty({ type: String, nullable: true })
  floor: string | null;

  @ApiProperty({ type: String, nullable: true })
  apartment: string | null;

  @ApiProperty({ type: String, nullable: true })
  customerNote: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  assignedAt: string | null;

  @ApiProperty({
    type: () => CourierRouteBranchResponseDto,
    nullable: true,
  })
  branch: CourierRouteBranchResponseDto | null;

  @ApiProperty({ type: CourierRouteCustomerResponseDto })
  customer: CourierRouteCustomerResponseDto;

  @ApiProperty()
  itemCount: number;

  @ApiProperty({ type: [CourierRouteItemResponseDto] })
  items: CourierRouteItemResponseDto[];

  @ApiProperty()
  cashToCollect: number;
}

export class CourierRouteBranchResponseDto {
  @ApiProperty({ format: "uuid" })
  branchId: string;

  @ApiProperty({ type: String, nullable: true })
  name: string | null;

  @ApiProperty({ type: String, nullable: true })
  address: string | null;

  @ApiProperty({ type: Number, nullable: true })
  latitude: number | null;

  @ApiProperty({ type: Number, nullable: true })
  longitude: number | null;
}

export enum CourierRoutingStatus {
  READY = "READY",
  NO_STOPS = "NO_STOPS",
  UNAVAILABLE = "UNAVAILABLE",
}

export enum CourierRouteWaypointKind {
  COURIER = "COURIER",
  PICKUP = "PICKUP",
  DELIVERY = "DELIVERY",
}

export class CourierRouteGeometryResponseDto {
  @ApiProperty({ enum: ["LineString"] })
  type: "LineString";

  @ApiProperty({
    type: "array",
    items: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      items: { type: "number" },
    },
    description: "GeoJSON coordinates in [longitude, latitude] order",
  })
  coordinates: number[][];
}

export class CourierRouteManeuverResponseDto {
  @ApiProperty()
  type: string;

  @ApiProperty({ type: String, nullable: true })
  modifier: string | null;

  @ApiProperty()
  latitude: number;

  @ApiProperty()
  longitude: number;
}

export class CourierRouteStepResponseDto {
  @ApiProperty()
  distanceMeters: number;

  @ApiProperty()
  durationSeconds: number;

  @ApiProperty()
  roadName: string;

  @ApiProperty()
  mode: string;

  @ApiProperty({ type: CourierRouteManeuverResponseDto })
  maneuver: CourierRouteManeuverResponseDto;
}

export class CourierRouteLegResponseDto {
  @ApiProperty()
  distanceMeters: number;

  @ApiProperty()
  durationSeconds: number;

  @ApiProperty()
  summary: string;

  @ApiProperty({ type: [CourierRouteStepResponseDto] })
  steps: CourierRouteStepResponseDto[];
}

export class CourierRouteWaypointResponseDto {
  @ApiProperty()
  sequence: number;

  @ApiProperty({ enum: CourierRouteWaypointKind })
  kind: CourierRouteWaypointKind;

  @ApiProperty()
  requestedLatitude: number;

  @ApiProperty()
  requestedLongitude: number;

  @ApiProperty()
  latitude: number;

  @ApiProperty()
  longitude: number;

  @ApiProperty()
  distanceToRoadMeters: number;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  branchId: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  orderId: string | null;
}

export class CourierRoadRouteResponseDto {
  @ApiProperty({
    description:
      "Deterministic identifier of the ordered stops and generated road geometry",
  })
  planId: string;

  @ApiProperty({ format: "date-time" })
  generatedAt: string;

  @ApiProperty()
  distanceMeters: number;

  @ApiProperty()
  durationSeconds: number;

  @ApiProperty({ type: CourierRouteGeometryResponseDto })
  geometry: CourierRouteGeometryResponseDto;

  @ApiProperty({ type: [CourierRouteWaypointResponseDto] })
  waypoints: CourierRouteWaypointResponseDto[];

  @ApiProperty({
    type: [CourierRouteWaypointResponseDto],
    description:
      "The next one to three pickup or delivery waypoints; all active orders remain available in stops",
  })
  nextWaypoints: CourierRouteWaypointResponseDto[];

  @ApiProperty({ type: [CourierRouteLegResponseDto] })
  legs: CourierRouteLegResponseDto[];
}

export class CourierRouteResponseDto {
  @ApiProperty({ format: "uuid" })
  courierId: string;

  @ApiProperty({ type: [CourierRouteStopResponseDto] })
  stops: CourierRouteStopResponseDto[];

  @ApiProperty({ enum: CourierRoutingStatus })
  routingStatus: CourierRoutingStatus;

  @ApiProperty({
    example: 15,
    description:
      "Recommended maximum delay before refreshing the route from the latest courier GPS position",
  })
  recalculateAfterSeconds: number;

  @ApiProperty({ type: CourierRoadRouteResponseDto, nullable: true })
  route: CourierRoadRouteResponseDto | null;
}
