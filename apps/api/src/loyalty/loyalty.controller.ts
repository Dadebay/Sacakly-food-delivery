import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { AdminPages, CurrentUser, Public, Roles } from "../common/auth.decorators";
import type { AuthUser } from "../common/auth.types";
import { AdminPage, Role } from "../generated/prisma/client";
import { CreateGiftDto, UpdateGiftDto } from "./loyalty.dto";
import { GiftResponseDto, LoyaltyWalletResponseDto } from "./loyalty-response.dto";
import { LoyaltyService } from "./loyalty.service";

@ApiTags("loyalty")
@Controller("loyalty")
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get("gifts")
  @Public()
  @ApiOkResponse({ type: [GiftResponseDto] })
  gifts() { return this.loyalty.gifts(false); }

  @Get("me")
  @ApiBearerAuth()
  @Roles(Role.CUSTOMER)
  @ApiOkResponse({ type: LoyaltyWalletResponseDto })
  me(@CurrentUser() user: AuthUser) { return this.loyalty.wallet(user.id); }

  @Get("admin/gifts")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.CATALOG)
  @ApiOkResponse({ type: [GiftResponseDto] })
  adminGifts() { return this.loyalty.gifts(true); }

  @Post("admin/gifts")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.CATALOG)
  @ApiCreatedResponse({ type: GiftResponseDto })
  createGift(@CurrentUser() user: AuthUser, @Body() dto: CreateGiftDto) {
    return this.loyalty.createGift(user, dto);
  }

  @Patch("admin/gifts/:id")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.CATALOG)
  @ApiOkResponse({ type: GiftResponseDto })
  updateGift(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateGiftDto) {
    return this.loyalty.updateGift(user, id, dto);
  }
}
