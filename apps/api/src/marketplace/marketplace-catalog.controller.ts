import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/auth.decorators";
import type { AuthUser } from "../common/auth.types";
import {
  CafeBranchResponseDto, CafeCatalogResponseDto, CafeCategoryItemResponseDto, CafeProductResponseDto,
  CreateCafeBranchDto, CreateCafeCategoryDto, CreateCafeProductDto,
  UpdateCafeBranchDto, UpdateCafeCategoryDto, UpdateCafeProductDto,
} from "./marketplace-catalog.dto";
import { MarketplaceCatalogService } from "./marketplace-catalog.service";

@ApiTags("marketplace-catalog")
@ApiBearerAuth()
@Controller("marketplace/merchant/cafes/:cafeId/catalog")
export class MarketplaceCatalogController {
  constructor(private readonly catalog: MarketplaceCatalogService) {}

  @Get()
  @ApiOperation({ summary: "Manage only this cafe's categories, products and branches" })
  @ApiOkResponse({ type: CafeCatalogResponseDto })
  list(@CurrentUser() actor: AuthUser, @Param("cafeId", ParseUUIDPipe) cafeId: string) {
    return this.catalog.catalog(actor, cafeId);
  }

  @Post("categories")
  @ApiCreatedResponse({ type: CafeCategoryItemResponseDto })
  createCategory(@CurrentUser() actor: AuthUser, @Param("cafeId", ParseUUIDPipe) cafeId: string, @Body() dto: CreateCafeCategoryDto) {
    return this.catalog.createCategory(actor, cafeId, dto);
  }

  @Patch("categories/:id")
  @ApiOkResponse({ type: CafeCategoryItemResponseDto })
  updateCategory(@CurrentUser() actor: AuthUser, @Param("cafeId", ParseUUIDPipe) cafeId: string, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateCafeCategoryDto) {
    return this.catalog.updateCategory(actor, cafeId, id, dto);
  }

  @Post("products")
  @ApiCreatedResponse({ type: CafeProductResponseDto })
  createProduct(@CurrentUser() actor: AuthUser, @Param("cafeId", ParseUUIDPipe) cafeId: string, @Body() dto: CreateCafeProductDto) {
    return this.catalog.createProduct(actor, cafeId, dto);
  }

  @Patch("products/:id")
  @ApiOkResponse({ type: CafeProductResponseDto })
  updateProduct(@CurrentUser() actor: AuthUser, @Param("cafeId", ParseUUIDPipe) cafeId: string, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateCafeProductDto) {
    return this.catalog.updateProduct(actor, cafeId, id, dto);
  }

  @Post("branches")
  @ApiCreatedResponse({ type: CafeBranchResponseDto })
  createBranch(@CurrentUser() actor: AuthUser, @Param("cafeId", ParseUUIDPipe) cafeId: string, @Body() dto: CreateCafeBranchDto) {
    return this.catalog.createBranch(actor, cafeId, dto);
  }

  @Patch("branches/:id")
  @ApiOkResponse({ type: CafeBranchResponseDto })
  updateBranch(@CurrentUser() actor: AuthUser, @Param("cafeId", ParseUUIDPipe) cafeId: string, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateCafeBranchDto) {
    return this.catalog.updateBranch(actor, cafeId, id, dto);
  }
}
