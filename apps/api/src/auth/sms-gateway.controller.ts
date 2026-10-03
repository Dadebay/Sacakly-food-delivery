import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import { Public } from "../common/auth.decorators";
import {
  SmsGatewayHeartbeatResponseDto,
  SmsGatewayJobResponseDto,
  SmsGatewayStatusResponseDto,
  UpdateSmsGatewayJobStatusDto,
} from "./sms-gateway.dto";
import { SmsGatewayGuard } from "./sms-gateway.guard";
import { SmsGatewayService } from "./sms-gateway.service";

@ApiTags("sms-gateway")
@Public()
@UseGuards(SmsGatewayGuard)
@Controller("internal/sms-gateway")
export class SmsGatewayController {
  constructor(private readonly gateway: SmsGatewayService) {}

  @Post("heartbeat")
  @HttpCode(200)
  @ApiOperation({ summary: "Mark the configured Android SMS device online" })
  @ApiOkResponse({ type: SmsGatewayHeartbeatResponseDto })
  heartbeat() {
    return this.gateway.heartbeat();
  }

  @Get("pull")
  @ApiOperation({ summary: "Atomically claim the next outbound SMS job" })
  @ApiOkResponse({ type: SmsGatewayJobResponseDto })
  @ApiNoContentResponse({ description: "No SMS job is currently available" })
  async pull(
    @Res({ passthrough: true }) response: Response,
  ): Promise<SmsGatewayJobResponseDto | undefined> {
    const job = await this.gateway.pull();
    if (!job) {
      response.setHeader("Retry-After", "3");
      response.status(HttpStatus.NO_CONTENT);
      return;
    }
    return job;
  }

  @Post("jobs/:id/status")
  @HttpCode(200)
  @ApiOperation({ summary: "Acknowledge Android SMS delivery state" })
  @ApiOkResponse({ type: SmsGatewayStatusResponseDto })
  updateStatus(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: UpdateSmsGatewayJobStatusDto,
  ) {
    return this.gateway.updateStatus(
      id,
      dto.receipt,
      dto.status,
      dto.errorCode,
    );
  }
}
