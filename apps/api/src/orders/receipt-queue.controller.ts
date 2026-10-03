import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
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
  ReceiptActionResponseDto,
  ClaimReceiptDto,
  ReceiptLeaseDto,
  ReceiptOutcomeDto,
  ReprintReceiptDto,
  ReceiptClaimResultDto,
  ReceiptQueueResponseDto,
  ReceiptQueueHistoryResponseDto,
  ReceiptTaskResponseDto,
} from "./receipt-queue.dto";
import { ReceiptQueueService } from "./receipt-queue.service";

@ApiTags("receipt-queue")
@ApiBearerAuth()
@Roles(Role.OPERATOR, Role.ADMIN)
@AdminPages(AdminPage.ORDERS)
@Controller("receipt-print-tasks")
export class ReceiptQueueController {
  constructor(private readonly queue: ReceiptQueueService) {}
  @Get("history")
  @ApiOkResponse({ type: ReceiptQueueHistoryResponseDto })
  history(@CurrentUser() actor: AuthUser) {
    return this.queue.history(actor);
  }
  @Get()
  @ApiOperation({
    summary:
      "Get durable receipt backlog and failures without customer details",
  })
  @ApiOkResponse({ type: ReceiptQueueResponseDto })
  list(@CurrentUser() actor: AuthUser) {
    return this.queue.list(actor);
  }
  @Post("claim")
  @ApiOperation({
    summary:
      "Atomically lease one receipt; recovery stays on the original agent",
  })
  @ApiCreatedResponse({ type: ReceiptClaimResultDto })
  claim(@CurrentUser() actor: AuthUser, @Body() dto: ClaimReceiptDto) {
    return this.queue.claim(actor, dto.stationId);
  }
  @Post(":id/heartbeat")
  @ApiOperation({ summary: "Extend an owned receipt lease" })
  @ApiCreatedResponse({ type: ReceiptActionResponseDto })
  heartbeat(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReceiptLeaseDto,
  ) {
    return this.queue.heartbeat(actor, id, dto);
  }
  @Post(":id/outcome")
  @ApiOperation({
    summary:
      "Record agent byte-delivery result, never physical paper confirmation",
  })
  @ApiCreatedResponse({ type: ReceiptTaskResponseDto })
  outcome(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReceiptOutcomeDto,
  ) {
    return this.queue.acknowledge(actor, id, dto);
  }
  @Post(":id/retry")
  @ApiOperation({
    summary: "Retry safe pending/failed dispatch with the same identity",
  })
  @ApiCreatedResponse({ type: ReceiptActionResponseDto })
  retry(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.queue.retry(actor, id);
  }
  @Post(":id/cancel")
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: "Cancel a receipt that is still waiting in the queue" })
  @ApiCreatedResponse({ type: ReceiptTaskResponseDto })
  cancel(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.queue.cancel(actor, id);
  }
  @Post("orders/:orderId/reprint")
  @ApiOperation({
    summary:
      "Request an intentional new receipt with a separate idempotency key",
  })
  @ApiCreatedResponse({ type: ReceiptTaskResponseDto })
  reprint(
    @CurrentUser() actor: AuthUser,
    @Param("orderId", ParseUUIDPipe) id: string,
    @Body() dto: ReprintReceiptDto,
  ) {
    return this.queue.reprint(actor, id, dto);
  }
}
