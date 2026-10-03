import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import {
  AdminPages,
  CurrentUser,
  Public,
  Roles,
} from "../common/auth.decorators";
import type { AuthUser } from "../common/auth.types";
import { AdminPage, Role } from "../generated/prisma/client";
import {
  CreateDeliveryEtrapDto,
  CreateDeliveryWelayatDto,
  DeliveryZonePointDto,
  QuoteDeliveryDto,
  QuoteDeliveryTariffDto,
  UpdateDeliveryEtrapDto,
  UpdateDeliverySettingsDto,
  UpdateDeliveryWelayatDto,
} from "./delivery.dto";
import {
  DeliveryConfigResponseDto,
  DeliveryEtrapResponseDto,
  DeliverySettingsResponseDto,
  DeliveryWelayatResponseDto,
  DeliveryQuoteResponseDto,
  DeliveryTariffQuoteResponseDto,
  DeliveryZoneSuggestionResponseDto,
} from "./delivery-response.dto";
import { DeliveryService } from "./delivery.service";

@ApiTags("delivery")
@Controller("delivery")
export class DeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  @Get("config")
  @Public()
  @ApiOperation({
    summary:
      "List delivery-enabled welayats, etraps, prices and free thresholds",
  })
  @ApiOkResponse({ type: DeliveryConfigResponseDto })
  publicConfig() {
    return this.delivery.publicConfig();
  }

  @Post("quote")
  @HttpCode(200)
  @Public()
  @ApiOperation({
    summary:
      "Resolve the official address and authoritative delivery quote for map coordinates",
  })
  @ApiOkResponse({ type: DeliveryQuoteResponseDto })
  quote(@Body() dto: QuoteDeliveryDto) {
    return this.delivery.quote(dto);
  }

  @Post("tariff-quote")
  @HttpCode(200)
  @Public()
  @ApiOperation({
    summary:
      "Quote the current day or night tariff for a known etrap or fallback address",
  })
  @ApiOkResponse({ type: DeliveryTariffQuoteResponseDto })
  tariffQuote(@Body() dto: QuoteDeliveryTariffDto) {
    return this.delivery.tariffQuote(dto);
  }

  @Get("admin/config")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.DELIVERY)
  @ApiOperation({ summary: "List the complete delivery price configuration" })
  @ApiOkResponse({ type: DeliveryConfigResponseDto })
  adminConfig() {
    return this.delivery.adminConfig();
  }

  @Post("admin/zone-suggestion")
  @HttpCode(200)
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.DELIVERY)
  @ApiOperation({
    summary:
      "Suggest district names and an editable OSM boundary for a map point",
  })
  @ApiOkResponse({ type: DeliveryZoneSuggestionResponseDto })
  suggestZone(@Body() dto: DeliveryZonePointDto) {
    return this.delivery.suggestZone(dto);
  }

  @Patch("admin/settings")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.DELIVERY)
  @ApiOperation({
    summary: "Update day/night delivery prices, distance tiers and the night schedule",
  })
  @ApiOkResponse({ type: DeliverySettingsResponseDto })
  updateSettings(
    @CurrentUser() actor: AuthUser,
    @Body() dto: UpdateDeliverySettingsDto,
  ) {
    return this.delivery.updateSettings(actor, dto);
  }

  @Post("admin/welayats")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.DELIVERY)
  @ApiOperation({ summary: "Create a delivery welayat" })
  @ApiCreatedResponse({ type: DeliveryWelayatResponseDto })
  createWelayat(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateDeliveryWelayatDto,
  ) {
    return this.delivery.createWelayat(actor, dto);
  }

  @Patch("admin/welayats/:id")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.DELIVERY)
  @ApiOperation({ summary: "Update delivery welayat names and display order" })
  @ApiOkResponse({ type: DeliveryWelayatResponseDto })
  updateWelayat(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateDeliveryWelayatDto,
  ) {
    return this.delivery.updateWelayat(actor, id, dto);
  }

  @Post("admin/etraps")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.DELIVERY)
  @ApiOperation({ summary: "Create a delivery etrap and its tariff" })
  @ApiCreatedResponse({ type: DeliveryEtrapResponseDto })
  createEtrap(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateDeliveryEtrapDto,
  ) {
    return this.delivery.createEtrap(actor, dto);
  }

  @Patch("admin/etraps/:id")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.DELIVERY)
  @ApiOperation({
    summary: "Update availability and delivery price for one etrap",
  })
  @ApiOkResponse({ type: DeliveryEtrapResponseDto })
  updateEtrap(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateDeliveryEtrapDto,
  ) {
    return this.delivery.updateEtrap(actor, id, dto);
  }
}
