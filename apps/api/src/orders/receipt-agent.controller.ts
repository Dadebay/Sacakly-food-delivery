import {
  Body,
  Controller,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Public } from "../common/auth.decorators";
import { ReceiptAgentGuard } from "./receipt-agent.guard";
import {
  ReceiptActionResponseDto,
  ReceiptAgentLeaseDto,
  ReceiptAgentOutcomeDto,
  ReceiptClaimResultDto,
  ReceiptTaskResponseDto,
} from "./receipt-queue.dto";
import { ReceiptQueueService } from "./receipt-queue.service";

@ApiTags("receipt-agent")
@ApiBearerAuth()
@ApiHeader({
  name: "X-Receipt-Agent-Id",
  description: "Persistent UUID shown by the visible print agent",
  required: true,
})
@Public()
@UseGuards(ReceiptAgentGuard)
@Controller("receipt-agent/tasks")
export class ReceiptAgentController {
  private readonly stationIdPipe = new ParseUUIDPipe({ version: "4" });

  constructor(private readonly queue: ReceiptQueueService) {}

  private parseStationId(value: string) {
    return this.stationIdPipe.transform(value, {
      type: "custom",
      metatype: String,
      data: "x-receipt-agent-id",
    });
  }

  @Post("claim")
  @ApiOperation({
    summary: "Lease one receipt to the configured standalone print agent",
  })
  @ApiCreatedResponse({ type: ReceiptClaimResultDto })
  async claim(@Headers("x-receipt-agent-id") stationId: string) {
    return this.queue.claimAgent(await this.parseStationId(stationId));
  }

  @Post(":id/heartbeat")
  @ApiOperation({ summary: "Extend the standalone print agent lease" })
  @ApiCreatedResponse({ type: ReceiptActionResponseDto })
  async heartbeat(
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("x-receipt-agent-id") stationId: string,
    @Body() dto: ReceiptAgentLeaseDto,
  ) {
    return this.queue.heartbeatAgent(
      await this.parseStationId(stationId),
      id,
      dto,
    );
  }

  @Post(":id/outcome")
  @ApiOperation({
    summary: "Record standalone agent byte-delivery result",
  })
  @ApiCreatedResponse({ type: ReceiptTaskResponseDto })
  async outcome(
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("x-receipt-agent-id") stationId: string,
    @Body() dto: ReceiptAgentOutcomeDto,
  ) {
    return this.queue.acknowledgeAgent(
      await this.parseStationId(stationId),
      id,
      dto,
    );
  }
}
