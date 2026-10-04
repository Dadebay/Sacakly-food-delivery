import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../common/auth.decorators";
import { MarketplaceCafeResponseDto } from "./marketplace-response.dto";
import { MarketplaceService } from "./marketplace.service";

@ApiTags("marketplace")
@Controller("marketplace")
export class MarketplacePublicController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Get("cafes")
  @Public()
  @ApiOperation({ summary: "List active cafes with ordering enabled" })
  @ApiOkResponse({ type: [MarketplaceCafeResponseDto] })
  publicCafes() { return this.marketplace.publicCafes(); }
}
