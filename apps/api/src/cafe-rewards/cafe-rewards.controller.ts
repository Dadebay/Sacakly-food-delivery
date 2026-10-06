import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser, Public } from "../common/auth.decorators";
import type { AuthUser } from "../common/auth.types";
import { GiftResponseDto } from "../loyalty/loyalty-response.dto";
import { CafeRewardsService } from "./cafe-rewards.service";
import { CafePromotionResponseDto, CafeRewardsResponseDto, CafeWalletResponseDto, CreateCafeGiftDto, CreateCafePromotionDto, UpdateCafeGiftDto, UpdateCafePromotionDto } from "./cafe-rewards.dto";

@ApiTags("cafe-rewards")
@ApiBearerAuth()
@Controller("marketplace")
export class CafeRewardsController {
  constructor(private readonly rewards: CafeRewardsService) {}
  @Public() @Get("cafes/:cafeId/rewards") @ApiOkResponse({ type: CafeRewardsResponseDto })
  publicRewards(@Param("cafeId", ParseUUIDPipe) cafeId: string) { return this.rewards.publicRewards(cafeId); }
  @Get("cafes/:cafeId/loyalty/me") @ApiOkResponse({ type: CafeWalletResponseDto })
  wallet(@CurrentUser() actor: AuthUser, @Param("cafeId", ParseUUIDPipe) cafeId: string) { return this.rewards.wallet(actor, cafeId); }
  @Get("merchant/cafes/:cafeId/rewards") @ApiOkResponse({ type: CafeRewardsResponseDto })
  manage(@CurrentUser() actor: AuthUser, @Param("cafeId", ParseUUIDPipe) cafeId: string) { return this.rewards.manage(actor, cafeId); }
  @Post("merchant/cafes/:cafeId/rewards/promotions") @ApiCreatedResponse({ type: CafePromotionResponseDto })
  createPromotion(@CurrentUser() actor: AuthUser, @Param("cafeId", ParseUUIDPipe) cafeId: string, @Body() dto: CreateCafePromotionDto) { return this.rewards.savePromotion(actor, cafeId, dto); }
  @Patch("merchant/cafes/:cafeId/rewards/promotions/:id") @ApiOkResponse({ type: CafePromotionResponseDto })
  updatePromotion(@CurrentUser() actor: AuthUser, @Param("cafeId", ParseUUIDPipe) cafeId: string, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateCafePromotionDto) { return this.rewards.savePromotion(actor, cafeId, dto, id); }
  @Post("merchant/cafes/:cafeId/rewards/gifts") @ApiCreatedResponse({ type: GiftResponseDto })
  createGift(@CurrentUser() actor: AuthUser, @Param("cafeId", ParseUUIDPipe) cafeId: string, @Body() dto: CreateCafeGiftDto) { return this.rewards.saveGift(actor, cafeId, dto); }
  @Patch("merchant/cafes/:cafeId/rewards/gifts/:id") @ApiOkResponse({ type: GiftResponseDto })
  updateGift(@CurrentUser() actor: AuthUser, @Param("cafeId", ParseUUIDPipe) cafeId: string, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateCafeGiftDto) { return this.rewards.saveGift(actor, cafeId, dto, id); }
}
