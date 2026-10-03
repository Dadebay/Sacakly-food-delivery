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
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AdminPages, CurrentUser, Roles } from "../common/auth.decorators";
import type { AuthUser } from "../common/auth.types";
import { AdminPage, Role } from "../generated/prisma/client";
import {
  CreateStaffDto,
  LoginAttemptsQueryDto,
  UpdateStaffDto,
} from "./users.dto";
import {
  CourierSummaryResponseDto,
  RecentLoginResponseDto,
  LoginAttemptsResponseDto,
  StaffMutationResponseDto,
  StaffResponseDto,
  CustomerCountsResponseDto,
} from "./users-response.dto";
import { UsersService } from "./users.service";

@ApiTags("staff")
@ApiBearerAuth()
@Controller("staff")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get("customer-counts")
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @AdminPages(AdminPage.LOGIN_ATTEMPTS)
  @ApiOkResponse({ type: CustomerCountsResponseDto })
  customerCounts() {
    return this.users.customerCounts();
  }

  @Get("login-attempts")
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @AdminPages(AdminPage.LOGIN_ATTEMPTS)
  @ApiOkResponse({ type: LoginAttemptsResponseDto })
  loginAttempts(@Query() query: LoginAttemptsQueryDto) {
    return this.users.loginAttempts(query);
  }

  @Get()
  @Roles(Role.ADMIN, Role.OPERATOR, Role.ACCOUNTANT)
  @AdminPages(AdminPage.STAFF)
  @ApiOkResponse({ type: [StaffResponseDto] })
  list(@Query("role") role?: Role) {
    return this.users.list(role);
  }

  @Get("couriers")
  @Roles(Role.ADMIN, Role.OPERATOR)
  @AdminPages(AdminPage.ORDERS, AdminPage.COURIER_MAP)
  @ApiOkResponse({ type: [CourierSummaryResponseDto] })
  couriers() {
    return this.users.couriers();
  }

  @Get("recent-logins")
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.STAFF)
  @ApiOkResponse({ type: [RecentLoginResponseDto] })
  recentLogins() {
    return this.users.recentLogins();
  }

  @Post()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.STAFF)
  @ApiCreatedResponse({ type: StaffMutationResponseDto })
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateStaffDto) {
    return this.users.create(actor, dto);
  }

  @Patch(":id")
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.STAFF)
  @ApiOkResponse({ type: StaffMutationResponseDto })
  update(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.users.update(actor, id, dto);
  }
}
