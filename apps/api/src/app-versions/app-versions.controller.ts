import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Put,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
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
  AdminAppVersionResponseDto,
  PublicAppVersionResponseDto,
} from "./app-versions-response.dto";
import { AppVersionPlatformDto, SaveAppVersionDto } from "./app-versions.dto";
import { AppVersionsService } from "./app-versions.service";

@ApiTags("app-versions")
@Controller("app")
export class AppVersionsController {
  constructor(private readonly versions: AppVersionsService) {}

  @Public()
  @Get("version")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "Read the mobile update policy before login",
    description:
      "Only configured platforms return a policy. On 404 or any check failure mobile clients continue normally.",
  })
  @ApiOkResponse({ type: PublicAppVersionResponseDto })
  @ApiNotFoundResponse({
    description:
      "Platform is not configured; continue without an update prompt",
  })
  publicVersion(@Query() query: AppVersionPlatformDto) {
    return this.versions.publicVersion(query.platform);
  }

  @Get("admin/versions")
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.APP_VERSIONS)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List configured mobile platform versions" })
  @ApiOkResponse({ type: AdminAppVersionResponseDto, isArray: true })
  list() {
    return this.versions.list();
  }

  @Put("admin/versions/:platform")
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.APP_VERSIONS)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      "Create or replace a platform update policy with optimistic concurrency and audit",
  })
  @ApiOkResponse({ type: AdminAppVersionResponseDto })
  save(
    @CurrentUser() actor: AuthUser,
    @Param() params: AppVersionPlatformDto,
    @Body() body: SaveAppVersionDto,
  ) {
    return this.versions.save(actor, params.platform, body);
  }
}
