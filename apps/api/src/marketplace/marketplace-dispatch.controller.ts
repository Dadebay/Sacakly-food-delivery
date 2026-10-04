import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/auth.decorators";
import type { AuthUser } from "../common/auth.types";
import { ConfirmOrderPackingDto } from "../orders/orders.dto";
import { OrderResponseDto } from "../orders/orders-response.dto";
import { ChooseMarketplaceDeliveryDto, DeliveryRequestResponseDto, ExternalDeliveryOfferResponseDto, OwnCafeCourierResponseDto } from "./marketplace-dispatch.dto";
import { MarketplaceDispatchService } from "./marketplace-dispatch.service";

@ApiTags("marketplace delivery")
@ApiBearerAuth()
@Controller("marketplace/delivery")
export class MarketplaceDispatchController {
  constructor(private readonly dispatch: MarketplaceDispatchService) {}

  @Get("merchant/cafes/:cafeId/couriers")
  @ApiOkResponse({ type: [OwnCafeCourierResponseDto] })
  ownCouriers(@CurrentUser() actor: AuthUser, @Param("cafeId", ParseUUIDPipe) cafeId: string) { return this.dispatch.ownCouriers(actor, cafeId); }

  @Post("merchant/cafes/:cafeId/orders/:orderId/route")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: DeliveryRequestResponseDto })
  choose(@CurrentUser() actor: AuthUser, @Param("cafeId", ParseUUIDPipe) cafeId: string, @Param("orderId", ParseUUIDPipe) orderId: string, @Body() dto: ChooseMarketplaceDeliveryDto) { return this.dispatch.choose(actor, cafeId, orderId, dto); }

  @Post("merchant/cafes/:cafeId/orders/:orderId/ready")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: OrderResponseDto })
  ready(@CurrentUser() actor: AuthUser, @Param("cafeId", ParseUUIDPipe) cafeId: string, @Param("orderId", ParseUUIDPipe) orderId: string, @Body() dto: ConfirmOrderPackingDto) { return this.dispatch.ready(actor, cafeId, orderId, dto); }

  @Get("courier/offers")
  @ApiOkResponse({ type: [ExternalDeliveryOfferResponseDto] })
  offers(@CurrentUser() actor: AuthUser) { return this.dispatch.offers(actor); }

  @Post("courier/offers/:orderId/claim")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: DeliveryRequestResponseDto })
  claim(@CurrentUser() actor: AuthUser, @Param("orderId", ParseUUIDPipe) orderId: string) { return this.dispatch.claim(actor, orderId); }
}
