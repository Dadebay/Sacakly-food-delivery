import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
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
  CreateBannerDto,
  CreatePromoCodeDto,
  UpdateBannerDto,
  UpdatePromoCodeDto,
} from "./marketing.dto";
import { MarketingService } from "./marketing.service";
import {
  BannerResponseDto,
  PromoCodeResponseDto,
} from "./marketing-response.dto";

@ApiTags("marketing")
@Controller("marketing")
export class MarketingController {
  constructor(private readonly marketing: MarketingService) {}

  @Get("banners")
  @Public()
  @ApiOperation({ summary: "List currently active customer banners" })
  @ApiOkResponse({ type: [BannerResponseDto] })
  banners() {
    return this.marketing.activeBanners();
  }

  @Get("admin/banners")
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.OPERATOR)
  @AdminPages(AdminPage.MARKETING)
  @ApiOkResponse({ type: [BannerResponseDto] })
  allBanners() {
    return this.marketing.allBanners();
  }

  @Post("banners")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.MARKETING)
  @ApiCreatedResponse({ type: BannerResponseDto })
  createBanner(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateBannerDto,
  ) {
    return this.marketing.createBanner(actor, dto);
  }

  @Patch("banners/:id")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.MARKETING)
  @ApiOkResponse({ type: BannerResponseDto })
  updateBanner(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateBannerDto,
  ) {
    return this.marketing.updateBanner(actor, id, dto);
  }

  @Delete("banners/:id")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.MARKETING)
  @ApiOperation({ summary: "Permanently delete a banner record" })
  @ApiOkResponse({ type: BannerResponseDto })
  deleteBanner(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.marketing.deleteBanner(actor, id);
  }

  @Get("promos")
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.OPERATOR, Role.ACCOUNTANT)
  @AdminPages(AdminPage.MARKETING)
  @ApiOkResponse({ type: [PromoCodeResponseDto] })
  promos() {
    return this.marketing.promoCodes();
  }

  @Post("promos")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.MARKETING)
  @ApiCreatedResponse({ type: PromoCodeResponseDto })
  createPromo(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreatePromoCodeDto,
  ) {
    return this.marketing.createPromoCode(actor, dto);
  }

  @Patch("promos/:id")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.MARKETING)
  @ApiOkResponse({ type: PromoCodeResponseDto })
  updatePromo(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdatePromoCodeDto,
  ) {
    return this.marketing.updatePromoCode(actor, id, dto);
  }
}
