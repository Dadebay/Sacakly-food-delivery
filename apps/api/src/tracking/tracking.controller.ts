import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Put,
  Sse,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from "@nestjs/swagger";
import { AdminPages, CurrentUser, Roles } from "../common/auth.decorators";
import type { AuthUser } from "../common/auth.types";
import { AdminPage, Role } from "../generated/prisma/client";
import {
  DispatchSnapshotDto,
  DispatchLiveEventDto,
  CustomerCourierRouteResponseDto,
  StopCourierLocationResponseDto,
  UpdateCourierLocationDto,
  UpdateCourierLocationResponseDto,
} from "./tracking.dto";
import { TrackingService } from "./tracking.service";

@ApiTags("tracking")
@ApiBearerAuth()
@Controller("tracking")
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Put("me/location")
  @Roles(Role.COURIER)
  @AdminPages(AdminPage.COURIER_WORKSPACE)
  @ApiOperation({
    summary:
      "Publish courier GPS about every 15 seconds for the complete courier shift",
  })
  @ApiOkResponse({ type: UpdateCourierLocationResponseDto })
  updateLocation(
    @CurrentUser() courier: AuthUser,
    @Body() dto: UpdateCourierLocationDto,
  ) {
    return this.tracking.updateLocation(courier, dto);
  }

  @Delete("me/location")
  @Roles(Role.COURIER)
  @AdminPages(AdminPage.COURIER_WORKSPACE)
  @ApiOperation({ summary: "Stop sharing the authenticated courier location" })
  @ApiOkResponse({ type: StopCourierLocationResponseDto })
  stopSharing(@CurrentUser() courier: AuthUser) {
    return this.tracking.stopSharing(courier);
  }

  @Get("dispatch")
  @Roles(Role.OPERATOR, Role.ADMIN)
  @AdminPages(AdminPage.COURIER_MAP)
  @ApiOperation({
    summary:
      "Get active couriers, their latest locations, delivery stops and customer details",
  })
  @ApiOkResponse({ type: DispatchSnapshotDto })
  dispatch() {
    return this.tracking.getDispatchSnapshot();
  }

  @Get("orders/:orderId/courier-location")
  @Roles(Role.CUSTOMER)
  @ApiOperation({ summary: "Get the current customer's courier location for one order" })
  customerCourierLocation(
    @CurrentUser() customer: AuthUser,
    @Param("orderId", ParseUUIDPipe) orderId: string,
  ) {
    return this.tracking.customerCourierLocation(customer, orderId);
  }

  @Get("orders/:orderId/route")
  @Roles(Role.CUSTOMER)
  @ApiOperation({ summary: "Get the remaining road route for the customer's active delivery" })
  @ApiOkResponse({ type: CustomerCourierRouteResponseDto })
  customerCourierRoute(
    @CurrentUser() customer: AuthUser,
    @Param("orderId", ParseUUIDPipe) orderId: string,
  ) {
    return this.tracking.customerCourierRoute(customer, orderId);
  }

  @Sse("dispatch/live")
  @Roles(Role.OPERATOR, Role.ADMIN)
  @AdminPages(AdminPage.COURIER_MAP)
  @Header("Cache-Control", "no-cache, no-transform")
  @Header("X-Accel-Buffering", "no")
  @ApiOperation({
    summary: "Stream accepted courier GPS updates to authorized dispatchers",
  })
  @ApiProduces("text/event-stream")
  @ApiOkResponse({ type: DispatchLiveEventDto })
  dispatchLive() {
    return this.tracking.dispatchLive();
  }
}
