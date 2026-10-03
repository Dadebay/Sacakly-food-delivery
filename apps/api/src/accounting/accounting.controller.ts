import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { AdminPages, CurrentUser, Roles } from "../common/auth.decorators";
import type { AuthUser } from "../common/auth.types";
import { AdminPage, Role } from "../generated/prisma/client";
import {
  AccountingRangeQueryDto,
  ConfirmCashHandoffDto,
  SubmitCashHandoffDto,
  UpdateAccountingSettingsDto,
} from "./accounting.dto";
import {
  AccountingReportResponseDto,
  AccountingSettingsResponseDto,
  AccountingShiftResponseDto,
  CashHandoffResponseDto,
} from "./accounting-response.dto";
import { AccountingService } from "./accounting.service";

@ApiTags("accounting")
@ApiBearerAuth()
@Controller("accounting")
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  @Get("settings")
  @Roles(Role.ACCOUNTANT, Role.ADMIN)
  @AdminPages(AdminPage.ACCOUNTING)
  @ApiOperation({
    summary: "Get the configurable Ashgabat cash shift schedule",
  })
  @ApiOkResponse({ type: AccountingSettingsResponseDto })
  settings() {
    return this.accounting.settings();
  }

  @Patch("settings")
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: "Update shift names and boundaries for future handoffs",
  })
  @ApiOkResponse({ type: AccountingSettingsResponseDto })
  updateSettings(
    @CurrentUser() actor: AuthUser,
    @Body() dto: UpdateAccountingSettingsDto,
  ) {
    return this.accounting.updateSettings(actor, dto);
  }

  @Get("shifts")
  @Roles(Role.ACCOUNTANT, Role.ADMIN)
  @AdminPages(AdminPage.ACCOUNTING)
  @ApiOperation({ summary: "List shift totals and cash handoff state" })
  @ApiOkResponse({ type: [AccountingShiftResponseDto] })
  shifts(@Query() query: AccountingRangeQueryDto) {
    return this.accounting.shifts(query);
  }

  @Post("handoffs")
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.ACCOUNTING)
  @ApiOperation({
    summary: "Submit one completed shift cash packet to accounting",
  })
  @ApiOkResponse({ type: CashHandoffResponseDto })
  submit(@CurrentUser() actor: AuthUser, @Body() dto: SubmitCashHandoffDto) {
    return this.accounting.submit(actor, dto);
  }

  @Patch("handoffs/:id/confirm")
  @Roles(Role.ACCOUNTANT)
  @AdminPages(AdminPage.ACCOUNTING)
  @ApiOperation({
    summary: "Confirm a submitted packet and reconcile every included order",
  })
  @ApiOkResponse({ type: CashHandoffResponseDto })
  confirm(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ConfirmCashHandoffDto,
  ) {
    return this.accounting.confirm(actor, id, dto);
  }

  @Get("report")
  @Roles(Role.ACCOUNTANT)
  @AdminPages(AdminPage.ACCOUNTING)
  @ApiOperation({
    summary:
      "Get cash totals, handoffs, daily series and accountant/owner product analytics",
  })
  @ApiOkResponse({ type: AccountingReportResponseDto })
  report(
    @CurrentUser() actor: AuthUser,
    @Query() query: AccountingRangeQueryDto,
  ) {
    return this.accounting.report(actor, query);
  }
}
