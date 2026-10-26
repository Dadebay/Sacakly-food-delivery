import { Controller, Get, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../common/auth.decorators";
import { PublicMarketplaceCafeResponseDto } from "./marketplace-response.dto";
import { MarketplaceService } from "./marketplace.service";
import { ListMarketplaceCafesDto } from "./marketplace.dto";

@ApiTags("marketplace")
@Controller("marketplace")
export class MarketplacePublicController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Get("cafes")
  @Public()
  @ApiOperation({ summary: "List active cafes with ordering enabled" })
  @ApiOkResponse({ type: [PublicMarketplaceCafeResponseDto] })
  publicCafes(@Query() query: ListMarketplaceCafesDto) { return this.marketplace.publicCafes(query); }
}
