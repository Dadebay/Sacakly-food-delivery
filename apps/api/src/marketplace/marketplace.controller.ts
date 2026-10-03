import {
  Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put,
} from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/auth.decorators";
import type { AuthUser } from "../common/auth.types";
import {
  CafeModuleKeyDto, CreateMarketplaceCafeDto, GrantCafeMemberDto, LookupMarketplaceUserDto,
  MarketplaceCreateOrderDto, MarketplaceQuoteOrderDto, ReviewCourierDto, SetCafeModuleDto,
} from "./marketplace.dto";
import { MarketplaceService } from "./marketplace.service";
import { OrdersService } from "../orders/orders.service";
import { AssignCourierDto } from "../orders/orders.dto";
import { OrderQuoteResponseDto, OrderResponseDto } from "../orders/orders-response.dto";
import {
  CafeMembershipResponseDto, CafeMembershipWithUserResponseDto, CafeModuleResponseDto,
  CourierApplicationResponseDto, DispatchCourierResponseDto, DispatchOrderResponseDto,
  MarketplaceCafeResponseDto, MarketplaceUserResponseDto,
  MemberCafeResponseDto, MerchantOrderResponseDto, OwnerStatusResponseDto,
  PendingCourierApplicationResponseDto,
} from "./marketplace-response.dto";

@ApiTags("marketplace")
@ApiBearerAuth()
@Controller("marketplace")
export class MarketplaceController {
  constructor(
    private readonly marketplace: MarketplaceService,
    private readonly orders: OrdersService,
  ) {}

  @Get("owner/me")
  @ApiOperation({ summary: "Check protected platform OWNER entitlement" })
  @ApiOkResponse({ type: OwnerStatusResponseDto })
  ownerStatus(@CurrentUser() actor: AuthUser) {
    return this.marketplace.ownerStatus(actor);
  }

  @Get("merchant/cafes/me")
  @ApiOperation({ summary: "List only cafes in my active memberships" })
  @ApiOkResponse({ type: [MemberCafeResponseDto] })
  myCafes(@CurrentUser() actor: AuthUser) {
    return this.marketplace.myCafes(actor);
  }

  @Post("checkout/quote")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Quote a one-cafe marketplace cart" })
  @ApiOkResponse({ type: OrderQuoteResponseDto })
  quote(@CurrentUser() actor: AuthUser, @Body() dto: MarketplaceQuoteOrderDto) {
    return this.orders.quoteMarketplace(actor, dto);
  }

  @Post("checkout/orders")
  @ApiOperation({ summary: "Create one cafe-scoped cash order" })
  @ApiCreatedResponse({ type: OrderResponseDto })
  createOrder(@CurrentUser() actor: AuthUser, @Body() dto: MarketplaceCreateOrderDto) {
    return this.orders.createMarketplace(actor, dto);
  }

  @Post("courier-applications")
  @ApiOperation({ summary: "Apply to join the platform courier network" })
  @ApiCreatedResponse({ type: CourierApplicationResponseDto })
  applyCourier(@CurrentUser() actor: AuthUser) {
    return this.marketplace.applyCourier(actor);
  }

  @Get("courier-applications/me")
  @ApiOperation({ summary: "Read my courier application" })
  @ApiOkResponse({ type: CourierApplicationResponseDto })
  myCourierApplication(@CurrentUser() actor: AuthUser) {
    return this.marketplace.myCourierApplication(actor);
  }

  @Get("owner/courier-applications")
  @ApiOperation({ summary: "OWNER lists pending courier applications" })
  @ApiOkResponse({ type: [PendingCourierApplicationResponseDto] })
  listCourierApplications(@CurrentUser() actor: AuthUser) {
    return this.marketplace.listCourierApplications(actor);
  }

  @Patch("owner/courier-applications/:userId")
  @ApiOperation({ summary: "OWNER approves or rejects a courier application" })
  @ApiOkResponse({ type: CourierApplicationResponseDto })
  reviewCourier(
    @CurrentUser() actor: AuthUser,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: ReviewCourierDto,
  ) {
    return this.marketplace.reviewCourier(actor, userId, dto);
  }

  @Post("owner/cafes")
  @ApiOperation({ summary: "OWNER creates an independent cafe tenant" })
  @ApiCreatedResponse({ type: MarketplaceCafeResponseDto })
  createCafe(@CurrentUser() actor: AuthUser, @Body() dto: CreateMarketplaceCafeDto) {
    return this.marketplace.createCafe(actor, dto);
  }

  @Post("owner/users/lookup")
  @ApiOperation({ summary: "OWNER finds an existing active account by phone for cafe access" })
  @ApiCreatedResponse({ type: MarketplaceUserResponseDto })
  lookupUser(@CurrentUser() actor: AuthUser, @Body() dto: LookupMarketplaceUserDto) {
    return this.marketplace.lookupUser(actor, dto);
  }

  @Get("owner/cafes/:cafeId/members")
  @ApiOperation({ summary: "OWNER lists versioned membership for one cafe" })
  @ApiOkResponse({ type: [CafeMembershipWithUserResponseDto] })
  ownerCafeMembers(
    @CurrentUser() actor: AuthUser,
    @Param("cafeId", ParseUUIDPipe) cafeId: string,
  ) {
    return this.marketplace.ownerCafeMembers(actor, cafeId);
  }

  @Get("owner/dispatch/orders")
  @ApiOperation({ summary: "OWNER sees dispatchable marketplace orders across cafes" })
  @ApiOkResponse({ type: [DispatchOrderResponseDto] })
  dispatchOrders(@CurrentUser() actor: AuthUser) {
    return this.marketplace.dispatchOrders(actor);
  }

  @Get("owner/dispatch/couriers")
  @ApiOperation({ summary: "OWNER lists approved active platform couriers" })
  @ApiOkResponse({ type: [DispatchCourierResponseDto] })
  dispatchCouriers(@CurrentUser() actor: AuthUser) {
    return this.marketplace.dispatchCouriers(actor);
  }

  @Patch("owner/dispatch/orders/:orderId/courier")
  @ApiOperation({ summary: "OWNER assigns an approved courier with order version checking" })
  @ApiOkResponse({ type: OrderResponseDto })
  dispatchAssignCourier(
    @CurrentUser() actor: AuthUser,
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body() dto: AssignCourierDto,
  ) {
    return this.marketplace.dispatchAssignCourier(actor, orderId, dto);
  }

  @Put("owner/cafes/:cafeId/members")
  @ApiOperation({ summary: "OWNER grants versioned staff access to one cafe" })
  @ApiOkResponse({ type: CafeMembershipResponseDto })
  grantCafeMember(
    @CurrentUser() actor: AuthUser,
    @Param("cafeId", ParseUUIDPipe) cafeId: string,
    @Body() dto: GrantCafeMemberDto,
  ) {
    return this.marketplace.grantCafeMember(actor, cafeId, dto);
  }

  @Put("owner/cafes/:cafeId/modules/:key")
  @ApiOperation({ summary: "OWNER activates a versioned cafe module" })
  @ApiOkResponse({ type: CafeModuleResponseDto })
  setCafeModule(
    @CurrentUser() actor: AuthUser,
    @Param() params: CafeModuleKeyDto,
    @Body() dto: SetCafeModuleDto,
  ) {
    return this.marketplace.setCafeModule(actor, params.cafeId, params.key, dto);
  }

  @Get("owner/cafes/:cafeId/modules")
  @ApiOperation({ summary: "OWNER lists modules for one cafe" })
  @ApiOkResponse({ type: [CafeModuleResponseDto] })
  ownerCafeModules(
    @CurrentUser() actor: AuthUser,
    @Param("cafeId", ParseUUIDPipe) cafeId: string,
  ) {
    return this.marketplace.ownerCafeModules(actor, cafeId);
  }

  @Get("merchant/cafes/:cafeId/orders")
  @ApiOperation({ summary: "List only orders for an enabled member cafe" })
  @ApiOkResponse({ type: [MerchantOrderResponseDto] })
  merchantOrders(
    @CurrentUser() actor: AuthUser,
    @Param("cafeId", ParseUUIDPipe) cafeId: string,
  ) {
    return this.marketplace.merchantOrders(actor, cafeId);
  }
}
