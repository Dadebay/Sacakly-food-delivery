import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { CreateReceiptPrinterDto } from "../catalog/catalog.dto";
import { CurrentUser } from "../common/auth.decorators";
import type { AuthUser } from "../common/auth.types";
import { ReceiptActionResponseDto, ReceiptQueueHistoryResponseDto, ReceiptQueueResponseDto, ReceiptTaskResponseDto, ReprintReceiptDto } from "../orders/receipt-queue.dto";
import { CafeReceiptConfigResponseDto, CafeReceiptTokenResponseDto, RotateCafeReceiptTokenDto, RouteCafeReceiptPrinterDto, SetCafeReceiptConfigDto } from "./marketplace-receipts.dto";
import { MarketplaceReceiptsService } from "./marketplace-receipts.service";

@ApiTags("marketplace receipts")
@ApiBearerAuth()
@Controller("marketplace/merchant/cafes/:cafeId/receipts")
export class MarketplaceReceiptsController {
  constructor(private readonly receipts: MarketplaceReceiptsService) {}

  @Get("config")
  @ApiOkResponse({ type: CafeReceiptConfigResponseDto })
  config(@CurrentUser() actor: AuthUser, @Param("cafeId", ParseUUIDPipe) cafeId: string) { return this.receipts.config(actor, cafeId); }

  @Put("config")
  @ApiOkResponse({ type: CafeReceiptConfigResponseDto })
  setConfig(@CurrentUser() actor: AuthUser, @Param("cafeId", ParseUUIDPipe) cafeId: string, @Body() dto: SetCafeReceiptConfigDto) { return this.receipts.setConfig(actor, cafeId, dto); }

  @Get("printers")
  printers(@CurrentUser() actor: AuthUser, @Param("cafeId", ParseUUIDPipe) cafeId: string) { return this.receipts.printers(actor, cafeId); }

  @Post("printers")
  createPrinter(@CurrentUser() actor: AuthUser, @Param("cafeId", ParseUUIDPipe) cafeId: string, @Body() dto: CreateReceiptPrinterDto) { return this.receipts.createPrinter(actor, cafeId, dto); }

  @Put("categories/:categoryId/printer")
  routeCategory(@CurrentUser() actor: AuthUser, @Param("cafeId", ParseUUIDPipe) cafeId: string, @Param("categoryId", ParseUUIDPipe) categoryId: string, @Body() dto: RouteCafeReceiptPrinterDto) { return this.receipts.routeCategory(actor, cafeId, categoryId, dto); }

  @Put("products/:productId/printer")
  routeProduct(@CurrentUser() actor: AuthUser, @Param("cafeId", ParseUUIDPipe) cafeId: string, @Param("productId", ParseUUIDPipe) productId: string, @Body() dto: RouteCafeReceiptPrinterDto) { return this.receipts.routeProduct(actor, cafeId, productId, dto); }

  @Post("agent-token/rotate")
  @ApiCreatedResponse({ type: CafeReceiptTokenResponseDto })
  rotateAgentToken(@CurrentUser() actor: AuthUser, @Param("cafeId", ParseUUIDPipe) cafeId: string, @Body() dto: RotateCafeReceiptTokenDto) { return this.receipts.rotateAgentToken(actor, cafeId, dto); }

  @Get("queue")
  @ApiOkResponse({ type: ReceiptQueueResponseDto })
  queue(@CurrentUser() actor: AuthUser, @Param("cafeId", ParseUUIDPipe) cafeId: string) { return this.receipts.queueList(actor, cafeId); }

  @Get("queue/history")
  @ApiOkResponse({ type: ReceiptQueueHistoryResponseDto })
  history(@CurrentUser() actor: AuthUser, @Param("cafeId", ParseUUIDPipe) cafeId: string) { return this.receipts.queueHistory(actor, cafeId); }

  @Post("queue/:taskId/retry")
  @ApiCreatedResponse({ type: ReceiptActionResponseDto })
  retry(@CurrentUser() actor: AuthUser, @Param("cafeId", ParseUUIDPipe) cafeId: string, @Param("taskId", ParseUUIDPipe) taskId: string) { return this.receipts.retry(actor, cafeId, taskId); }

  @Post("queue/:taskId/cancel")
  @ApiCreatedResponse({ type: ReceiptTaskResponseDto })
  cancel(@CurrentUser() actor: AuthUser, @Param("cafeId", ParseUUIDPipe) cafeId: string, @Param("taskId", ParseUUIDPipe) taskId: string) { return this.receipts.cancel(actor, cafeId, taskId); }

  @Post("orders/:orderId/reprint")
  @ApiCreatedResponse({ type: ReceiptTaskResponseDto })
  reprint(@CurrentUser() actor: AuthUser, @Param("cafeId", ParseUUIDPipe) cafeId: string, @Param("orderId", ParseUUIDPipe) orderId: string, @Body() dto: ReprintReceiptDto) { return this.receipts.reprint(actor, cafeId, orderId, dto); }
}
