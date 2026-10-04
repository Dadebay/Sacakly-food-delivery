import { Body, Controller, Headers, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiHeader, ApiTags } from "@nestjs/swagger";
import { Public } from "../common/auth.decorators";
import { ReceiptActionResponseDto, ReceiptAgentLeaseDto, ReceiptAgentOutcomeDto, ReceiptClaimResultDto, ReceiptTaskResponseDto } from "../orders/receipt-queue.dto";
import { ReceiptQueueService } from "../orders/receipt-queue.service";
import { MarketplaceReceiptAgentGuard } from "./marketplace-receipt-agent.guard";
import type { CafeReceiptAgentRequest } from "./marketplace-receipt-agent.guard";

@ApiTags("marketplace receipt agent")
@ApiBearerAuth()
@ApiHeader({ name: "X-Receipt-Agent-Id", required: true })
@Public()
@UseGuards(MarketplaceReceiptAgentGuard)
@Controller("marketplace/receipt-agent/tasks")
export class MarketplaceReceiptAgentController {
  constructor(private readonly queue: ReceiptQueueService) {}
  private readonly stationIdPipe = new ParseUUIDPipe({ version: "4" });
  private parseStationId(value: string) {
    return this.stationIdPipe.transform(value, { type: "custom", metatype: String, data: "x-receipt-agent-id" });
  }

  @Post("claim")
  @ApiCreatedResponse({ type: ReceiptClaimResultDto })
  async claim(@Req() request: CafeReceiptAgentRequest, @Headers("x-receipt-agent-id") stationId: string) {
    return this.queue.claimCafeAgent(request.receiptCafeId, await this.parseStationId(stationId));
  }

  @Post(":id/heartbeat")
  @ApiCreatedResponse({ type: ReceiptActionResponseDto })
  async heartbeat(@Req() request: CafeReceiptAgentRequest, @Param("id", ParseUUIDPipe) id: string,
    @Headers("x-receipt-agent-id") stationId: string, @Body() dto: ReceiptAgentLeaseDto) {
    return this.queue.heartbeatCafeAgent(request.receiptCafeId, await this.parseStationId(stationId), id, dto);
  }

  @Post(":id/outcome")
  @ApiCreatedResponse({ type: ReceiptTaskResponseDto })
  async outcome(@Req() request: CafeReceiptAgentRequest, @Param("id", ParseUUIDPipe) id: string,
    @Headers("x-receipt-agent-id") stationId: string, @Body() dto: ReceiptAgentOutcomeDto) {
    return this.queue.acknowledgeCafeAgent(request.receiptCafeId, await this.parseStationId(stationId), id, dto);
  }
}
