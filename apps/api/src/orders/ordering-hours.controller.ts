import { Body, Controller, Get, Patch } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  AdminPages,
  CurrentUser,
  Public,
  Roles,
} from "../common/auth.decorators";
import type { AuthUser } from "../common/auth.types";
import { AdminPage, Role } from "../generated/prisma/client";
import {
  OrderingHoursResponseDto,
  UpdateOrderingHoursDto,
} from "./ordering-hours.dto";
import { OrderingHoursService } from "./ordering-hours.service";

@ApiTags("ordering-hours")
@Controller("ordering-hours")
export class OrderingHoursController {
  constructor(private readonly hours: OrderingHoursService) {}

  @Get()
  @Public()
  @ApiOkResponse({ type: OrderingHoursResponseDto })
  get() {
    return this.hours.get();
  }

  @Patch()
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @AdminPages(AdminPage.CATALOG)
  @ApiOkResponse({ type: OrderingHoursResponseDto })
  update(@CurrentUser() actor: AuthUser, @Body() dto: UpdateOrderingHoursDto) {
    return this.hours.update(actor, dto);
  }
}
