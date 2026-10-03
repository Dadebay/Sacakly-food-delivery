import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
} from "@nestjs/common";
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser, Roles } from "../common/auth.decorators";
import type { AuthUser } from "../common/auth.types";
import { Role } from "../generated/prisma/client";
import { FavoritesService } from "./favorites.service";

@ApiTags("favorites")
@ApiBearerAuth()
@Roles(Role.CUSTOMER)
@Controller("favorites")
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  @ApiOkResponse({ description: "Current customer's favorited products" })
  list(@CurrentUser() user: AuthUser) {
    return this.favorites.list(user.id);
  }

  @Put(":productId")
  @ApiOkResponse({ description: "Favorite product" })
  add(
    @CurrentUser() user: AuthUser,
    @Param("productId", ParseUUIDPipe) productId: string,
  ) {
    return this.favorites.add(user.id, productId);
  }

  @Delete(":productId")
  @HttpCode(204)
  @ApiNoContentResponse({ description: "Remove favorite product" })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param("productId", ParseUUIDPipe) productId: string,
  ) {
    await this.favorites.remove(user.id, productId);
  }
}
