import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiConflictResponse,
  ApiNoContentResponse,
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
  AddProductImageDto,
  CreateCafeDto,
  CreateCategoryDto,
  CreateProductDto,
  CreateReceiptPrinterDto,
  ListAdminCatalogProductsQueryDto,
  ListCatalogCategoriesQueryDto,
  ListCatalogProductsQueryDto,
  UpdateCafeDto,
  UpdateCategoryDto,
  UpdateProductDto,
  UpdateReceiptPrinterDto,
  UpdateReceiptPrintSettingsDto,
} from "./catalog.dto";
import { CatalogService } from "./catalog.service";
import {
  CatalogAdminCafeResponseDto,
  CatalogAdminCategoryResponseDto,
  CatalogAdminCategoryListItemResponseDto,
  CatalogAdminCategorySummaryResponseDto,
  CatalogAdminProductPageResponseDto,
  CatalogAdminProductResponseDto,
  CatalogCategoryResponseDto,
  CatalogProductImageResponseDto,
  CatalogProductResponseDto,
  CatalogCafeResponseDto,
  ReceiptPrintSettingsResponseDto,
  ReceiptPrinterResponseDto,
} from "./catalog-response.dto";

@ApiTags("catalog")
@Controller("catalog")
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get("cafes")
  @Public()
  @ApiOperation({ summary: "List public cafes for customer catalog selection" })
  @ApiOkResponse({ type: [CatalogCafeResponseDto] })
  cafes() {
    return this.catalog.cafes();
  }

  @Get("categories")
  @Public()
  @ApiOperation({ summary: "List public categories with products" })
  @ApiOkResponse({ type: [CatalogCategoryResponseDto] })
  categories(@Query() query: ListCatalogCategoriesQueryDto) {
    return this.catalog.categories(false, query.cafeId);
  }

  @Get("products")
  @Public()
  @ApiOperation({ summary: "List public products" })
  @ApiOkResponse({ type: [CatalogProductResponseDto] })
  products(@Query() query: ListCatalogProductsQueryDto) {
    return this.catalog.products(query, false);
  }

  @Get("admin/cafes")
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.OPERATOR)
  @AdminPages(AdminPage.CATALOG, AdminPage.MEAL_CONFIG, AdminPage.ORDERS)
  @ApiOperation({ summary: "List cafes including hidden records" })
  @ApiOkResponse({ type: [CatalogAdminCafeResponseDto] })
  adminCafes() {
    return this.catalog.cafes(true);
  }

  @Get("admin/categories")
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.OPERATOR)
  @AdminPages(AdminPage.CATALOG, AdminPage.MEAL_CONFIG, AdminPage.ORDERS)
  @ApiOperation({ summary: "List categories including hidden records" })
  @ApiOkResponse({ type: [CatalogAdminCategoryResponseDto] })
  adminCategories(@Query() query: ListCatalogCategoriesQueryDto) {
    return this.catalog.categories(true, query.cafeId);
  }

  @Get("admin/category-summaries")
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.OPERATOR)
  @AdminPages(AdminPage.CATALOG, AdminPage.MEAL_CONFIG, AdminPage.ORDERS)
  @ApiOperation({
    summary: "List lightweight administrator category summaries",
  })
  @ApiOkResponse({ type: [CatalogAdminCategoryListItemResponseDto] })
  adminCategorySummaries(@Query() query: ListCatalogCategoriesQueryDto) {
    return this.catalog.categorySummaries(query.cafeId);
  }

  @Post("cafes")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.CATALOG)
  @ApiCreatedResponse({ type: CatalogAdminCafeResponseDto })
  createCafe(@CurrentUser() actor: AuthUser, @Body() dto: CreateCafeDto) {
    return this.catalog.createCafe(actor, dto);
  }

  @Patch("cafes/:id")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.CATALOG)
  @ApiOkResponse({ type: CatalogAdminCafeResponseDto })
  updateCafe(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateCafeDto,
  ) {
    return this.catalog.updateCafe(actor, id, dto);
  }

  @Delete("cafes/:id")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.CATALOG)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Permanently delete an unused non-default cafe" })
  @ApiNoContentResponse({ description: "Cafe deleted" })
  @ApiConflictResponse({
    description: "Cafe is the compatibility default or contains order history",
  })
  deleteCafe(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.catalog.deleteCafe(actor, id);
  }

  @Get("admin/receipt-print-settings")
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.OPERATOR)
  @AdminPages(AdminPage.CATALOG, AdminPage.ORDERS)
  @ApiOperation({ summary: "Get the complete administrator receipt printer" })
  @ApiOkResponse({ type: ReceiptPrintSettingsResponseDto })
  receiptPrintSettings() {
    return this.catalog.receiptPrintSettings();
  }

  @Get("admin/receipt-printers")
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.OPERATOR)
  @AdminPages(AdminPage.CATALOG, AdminPage.ORDERS)
  @ApiOperation({ summary: "List registered LAN receipt printers" })
  @ApiOkResponse({ type: [ReceiptPrinterResponseDto] })
  receiptPrinters() {
    return this.catalog.receiptPrinters();
  }

  @Post("categories")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.CATALOG)
  @ApiCreatedResponse({ type: CatalogAdminCategorySummaryResponseDto })
  createCategory(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.catalog.createCategory(actor, dto);
  }

  @Patch("categories/:id")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.CATALOG)
  @ApiOkResponse({ type: CatalogAdminCategorySummaryResponseDto })
  updateCategory(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.catalog.updateCategory(actor, id, dto);
  }

  @Delete("categories/:id")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.CATALOG)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Permanently delete an unused category" })
  @ApiNoContentResponse({ description: "Category deleted" })
  @ApiConflictResponse({
    description: "Category contains a product referenced by order history",
  })
  deleteCategory(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.catalog.deleteCategory(actor, id);
  }

  @Patch("receipt-print-settings")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.CATALOG)
  @ApiOperation({
    summary: "Configure the complete administrator receipt printer",
  })
  @ApiOkResponse({ type: ReceiptPrintSettingsResponseDto })
  updateReceiptPrintSettings(
    @CurrentUser() actor: AuthUser,
    @Body() dto: UpdateReceiptPrintSettingsDto,
  ) {
    return this.catalog.updateReceiptPrintSettings(actor, dto);
  }

  @Post("receipt-printers")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.CATALOG)
  @ApiOperation({ summary: "Register a LAN receipt printer" })
  @ApiCreatedResponse({ type: ReceiptPrinterResponseDto })
  createReceiptPrinter(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateReceiptPrinterDto,
  ) {
    return this.catalog.createReceiptPrinter(actor, dto);
  }

  @Patch("receipt-printers/:id")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.CATALOG)
  @ApiOperation({ summary: "Update a registered LAN receipt printer" })
  @ApiOkResponse({ type: ReceiptPrinterResponseDto })
  updateReceiptPrinter(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateReceiptPrinterDto,
  ) {
    return this.catalog.updateReceiptPrinter(actor, id, dto);
  }

  @Delete("receipt-printers/:id")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.CATALOG)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete an unused registered receipt printer" })
  @ApiNoContentResponse({ description: "Receipt printer deleted" })
  @ApiConflictResponse({
    description: "Receipt printer is referenced by catalog settings",
  })
  deleteReceiptPrinter(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.catalog.deleteReceiptPrinter(actor, id);
  }

  @Get("admin/products")
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.OPERATOR)
  @AdminPages(AdminPage.CATALOG, AdminPage.MEAL_CONFIG, AdminPage.ORDERS)
  @ApiOkResponse({ type: [CatalogAdminProductResponseDto] })
  adminProducts(@Query() query: ListCatalogProductsQueryDto) {
    return this.catalog.products(query, true);
  }

  @Get("admin/products/page")
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.OPERATOR)
  @AdminPages(AdminPage.CATALOG, AdminPage.MEAL_CONFIG, AdminPage.ORDERS)
  @ApiOperation({
    summary: "List administrator products with pagination and filtering",
  })
  @ApiOkResponse({ type: CatalogAdminProductPageResponseDto })
  adminProductPage(@Query() query: ListAdminCatalogProductsQueryDto) {
    return this.catalog.productPage(query);
  }

  @Post("products")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.CATALOG)
  @ApiCreatedResponse({ type: CatalogAdminProductResponseDto })
  createProduct(@CurrentUser() actor: AuthUser, @Body() dto: CreateProductDto) {
    return this.catalog.createProduct(actor, dto);
  }

  @Patch("products/:id")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.CATALOG)
  @ApiOkResponse({ type: CatalogAdminProductResponseDto })
  updateProduct(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.catalog.updateProduct(actor, id, dto);
  }

  @Delete("products/:id")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.CATALOG)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Permanently delete an unused product" })
  @ApiNoContentResponse({ description: "Product deleted" })
  @ApiConflictResponse({
    description: "Product is referenced by order history",
  })
  deleteProduct(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.catalog.deleteProduct(actor, id);
  }

  @Post("products/:id/images")
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.CATALOG)
  @ApiCreatedResponse({ type: CatalogProductImageResponseDto })
  addImage(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AddProductImageDto,
  ) {
    return this.catalog.addImage(actor, id, dto);
  }
}
