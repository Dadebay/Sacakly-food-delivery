import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { AdminPages, CurrentUser, Roles } from "../common/auth.decorators";
import type { AuthUser } from "../common/auth.types";
import { AdminPage, Role } from "../generated/prisma/client";
import {
  AdjustInventoryStockDto,
  CreateIngredientDto,
  InventoryStockQueryDto,
  InventoryMovementQueryDto,
  UpdateIngredientDto,
  UpsertRecipeDto,
} from "./inventory.dto";
import {
  InventoryAlertResponseDto,
  InventoryIngredientResponseDto,
  InventoryRecipeResponseDto,
  InventoryStockResponseDto,
  InventoryMovementResponseDto,
} from "./inventory-response.dto";
import { InventoryService } from "./inventory.service";
import { InventoryFlowService } from "./inventory-flow.service";
import {
  InventoryBranchQueryDto, InventoryLocationDto, InventoryReceiptDto,
  InventoryTransferDto, InventoryProcessDto, InventoryWasteDto,
  InventoryStocktakeDto, InventoryProductLinkDto,
  InventoryLocationResponseDto, InventoryLotResponseDto,
  InventoryDocumentResponseDto, InventoryLotTraceResponseDto,
  InventoryProductLinkResponseDto,
  InventorySavedProductLinkResponseDto,
} from "./inventory-flow.dto";

@ApiTags("inventory")
@ApiBearerAuth()
@Roles(Role.OPERATOR, Role.COOK, Role.ADMIN)
@Controller("inventory")
export class InventoryController {
  constructor(private readonly inventory: InventoryService, private readonly flow: InventoryFlowService) {}

  @Get("product-links")
  @AdminPages(AdminPage.MEAL_CONFIG, AdminPage.ORDERS)
  @ApiOperation({ summary: "List direct-sale stock links, including product variants" })
  @ApiOkResponse({ type: [InventoryProductLinkResponseDto] })
  productLinks() { return this.inventory.listProductLinks(); }

  @Put("product-links/:productId")
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.MEAL_CONFIG)
  @ApiOperation({ summary: "Set or clear a direct-sale stock link" })
  @ApiOkResponse({ type: InventorySavedProductLinkResponseDto })
  linkProduct(@CurrentUser() actor: AuthUser,
    @Param("productId", ParseUUIDPipe) productId: string,
    @Body() dto: InventoryProductLinkDto) {
    return this.inventory.linkProduct(actor, productId, dto);
  }

  @Get("locations")
  @AdminPages(AdminPage.MEAL_CONFIG, AdminPage.ORDERS)
  @ApiOperation({ summary: "List physical stock locations in a branch" })
  @ApiOkResponse({ type: [InventoryLocationResponseDto] })
  locations(@Query() query: InventoryBranchQueryDto) { return this.flow.listLocations(query.branchId); }

  @Post("locations")
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.MEAL_CONFIG)
  @ApiOperation({ summary: "Create a stock location such as a kitchen" })
  @ApiCreatedResponse({ type: InventoryLocationResponseDto })
  createLocation(@CurrentUser() actor: AuthUser, @Body() dto: InventoryLocationDto) {
    return this.flow.createLocation(actor, dto);
  }

  @Get("lots")
  @AdminPages(AdminPage.MEAL_CONFIG, AdminPage.ORDERS)
  @ApiOperation({ summary: "List physical lots and their location balances" })
  @ApiOkResponse({ type: [InventoryLotResponseDto] })
  lots(@Query() query: InventoryBranchQueryDto) { return this.flow.listLots(query.branchId); }

  @Get("lots/:id/trace")
  @AdminPages(AdminPage.MEAL_CONFIG, AdminPage.ORDERS)
  @ApiOperation({ summary: "Trace a lot through source, transfer, process, waste and order documents" })
  @ApiOkResponse({ type: InventoryLotTraceResponseDto })
  traceLot(@Param("id", ParseUUIDPipe) id: string) { return this.flow.traceLot(id); }

  @Get("documents")
  @AdminPages(AdminPage.MEAL_CONFIG, AdminPage.ORDERS)
  @ApiOperation({ summary: "List the most recent stock documents" })
  @ApiOkResponse({ type: [InventoryDocumentResponseDto] })
  documents(@Query() query: InventoryBranchQueryDto) { return this.flow.listDocuments(query.branchId); }

  @Get("documents/:id")
  @AdminPages(AdminPage.MEAL_CONFIG, AdminPage.ORDERS)
  @ApiOperation({ summary: "Get a stock document with all lot lines" })
  @ApiOkResponse({ type: InventoryDocumentResponseDto })
  document(@Param("id", ParseUUIDPipe) id: string) { return this.flow.getDocument(id); }

  @Post("documents/receipt")
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.MEAL_CONFIG)
  @ApiOperation({ summary: "Receive a supplier lot" })
  @ApiCreatedResponse({ type: InventoryDocumentResponseDto })
  receipt(@CurrentUser() actor: AuthUser, @Body() dto: InventoryReceiptDto) { return this.flow.receipt(actor, dto); }

  @Post("documents/transfer")
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.MEAL_CONFIG)
  @ApiOperation({ summary: "Transfer a lot to another location" })
  @ApiCreatedResponse({ type: InventoryDocumentResponseDto })
  transfer(@CurrentUser() actor: AuthUser, @Body() dto: InventoryTransferDto) { return this.flow.transfer(actor, dto); }

  @Post("documents/process")
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.MEAL_CONFIG)
  @ApiOperation({ summary: "Process input lots into output lots and measured waste" })
  @ApiCreatedResponse({ type: InventoryDocumentResponseDto })
  process(@CurrentUser() actor: AuthUser, @Body() dto: InventoryProcessDto) { return this.flow.process(actor, dto); }

  @Post("documents/waste")
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.MEAL_CONFIG)
  @ApiOperation({ summary: "Write off spoiled or damaged lots with a reason" })
  @ApiCreatedResponse({ type: InventoryDocumentResponseDto })
  waste(@CurrentUser() actor: AuthUser, @Body() dto: InventoryWasteDto) { return this.flow.waste(actor, dto); }

  @Post("documents/stocktake")
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.MEAL_CONFIG)
  @ApiOperation({ summary: "Record a counted physical lot balance and unexplained variance" })
  @ApiCreatedResponse({ type: InventoryDocumentResponseDto })
  stocktake(@CurrentUser() actor: AuthUser, @Body() dto: InventoryStocktakeDto) { return this.flow.stocktake(actor, dto); }

  @Get("ingredients")
  @AdminPages(AdminPage.MEAL_CONFIG, AdminPage.ORDERS)
  @ApiOperation({ summary: "List recipe ingredients" })
  @ApiOkResponse({ type: [InventoryIngredientResponseDto] })
  listIngredients() {
    return this.inventory.listIngredients();
  }

  @Post("ingredients")
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.MEAL_CONFIG)
  @ApiOperation({ summary: "Create an ingredient" })
  @ApiCreatedResponse({ type: InventoryIngredientResponseDto })
  createIngredient(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateIngredientDto,
  ) {
    return this.inventory.createIngredient(actor, dto);
  }

  @Patch("ingredients/:id")
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.MEAL_CONFIG)
  @ApiOperation({ summary: "Update an ingredient" })
  @ApiOkResponse({ type: InventoryIngredientResponseDto })
  updateIngredient(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateIngredientDto,
  ) {
    return this.inventory.updateIngredient(actor, id, dto);
  }

  @Get("recipes")
  @AdminPages(AdminPage.MEAL_CONFIG, AdminPage.ORDERS)
  @ApiOperation({ summary: "List configured product recipes" })
  @ApiOkResponse({ type: [InventoryRecipeResponseDto] })
  listRecipes() {
    return this.inventory.listRecipes();
  }

  @Get("recipes/:productId")
  @AdminPages(AdminPage.MEAL_CONFIG, AdminPage.ORDERS)
  @ApiOperation({ summary: "Get a product recipe" })
  @ApiOkResponse({ type: InventoryRecipeResponseDto })
  getRecipe(@Param("productId", ParseUUIDPipe) productId: string) {
    return this.inventory.getRecipe(productId);
  }

  @Put("recipes/:productId")
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.MEAL_CONFIG)
  @ApiOperation({ summary: "Create or replace a product recipe" })
  @ApiOkResponse({ type: InventoryRecipeResponseDto })
  upsertRecipe(
    @CurrentUser() actor: AuthUser,
    @Param("productId", ParseUUIDPipe) productId: string,
    @Body() dto: UpsertRecipeDto,
  ) {
    return this.inventory.upsertRecipe(actor, productId, dto);
  }

  @Get("stock")
  @AdminPages(AdminPage.MEAL_CONFIG, AdminPage.ORDERS)
  @ApiOperation({ summary: "List stock by branch and ingredient" })
  @ApiOkResponse({ type: [InventoryStockResponseDto] })
  listStock(@Query() query: InventoryStockQueryDto) {
    return this.inventory.listStock(query);
  }

  @Get("alerts")
  @AdminPages(AdminPage.MEAL_CONFIG, AdminPage.ORDERS)
  @ApiOperation({ summary: "List ingredients at or below reorder point" })
  @ApiOkResponse({ type: [InventoryAlertResponseDto] })
  listAlerts(@Query() query: InventoryStockQueryDto) {
    return this.inventory.listAlerts(query);
  }

  @Get("movements")
  @AdminPages(AdminPage.MEAL_CONFIG, AdminPage.ORDERS)
  @ApiOperation({
    summary:
      "List recent stock decreases for the in-app inventory notification feed",
  })
  @ApiOkResponse({ type: [InventoryMovementResponseDto] })
  listMovements(@Query() query: InventoryMovementQueryDto) {
    return this.inventory.listMovements(query);
  }

  @Post("stock/:ingredientId/adjust")
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.MEAL_CONFIG)
  @ApiOperation({ summary: "Adjust ingredient stock" })
  @ApiCreatedResponse({ type: InventoryStockResponseDto })
  adjustStock(
    @CurrentUser() actor: AuthUser,
    @Param("ingredientId", ParseUUIDPipe) ingredientId: string,
    @Body() dto: AdjustInventoryStockDto,
  ) {
    return this.inventory.adjustStock(actor, ingredientId, dto);
  }
}
