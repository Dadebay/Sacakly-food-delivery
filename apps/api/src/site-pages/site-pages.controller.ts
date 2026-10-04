import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser, Public } from "../common/auth.decorators";
import type { AuthUser } from "../common/auth.types";
import { SaveSitePageDto, SitePageParamsDto, SitePageResponseDto, SitePageSummaryDto } from "./site-pages.dto";
import { SitePagesService } from "./site-pages.service";

@ApiTags("site pages")
@Controller("site")
export class SitePagesController {
  constructor(private readonly pages: SitePagesService) {}

  @Get("pages")
  @Public()
  @ApiOkResponse({ type: [SitePageSummaryDto] })
  publishedPages() { return this.pages.publishedPages(); }

  @Get("pages/:locale/:slug")
  @Public()
  @ApiOkResponse({ type: SitePageResponseDto })
  publishedPage(@Param() params: SitePageParamsDto) { return this.pages.publishedPage(params); }

  @Get("owner/pages")
  @ApiBearerAuth()
  @ApiOkResponse({ type: [SitePageResponseDto] })
  ownerPages(@CurrentUser() actor: AuthUser) { return this.pages.ownerPages(actor); }

  @Put("owner/pages/:locale/:slug")
  @ApiBearerAuth()
  @ApiOkResponse({ type: SitePageResponseDto })
  save(@CurrentUser() actor: AuthUser, @Param() params: SitePageParamsDto, @Body() dto: SaveSitePageDto) {
    return this.pages.save(actor, params, dto);
  }
}
