import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser, Roles } from "../common/auth.decorators";
import type { AuthUser } from "../common/auth.types";
import { Role } from "../generated/prisma/client";
import { UsersService } from "./users.service";

@ApiTags("customer")
@ApiBearerAuth()
@Roles(Role.CUSTOMER)
@Controller("users/me")
export class CustomerController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOkResponse({ description: "Authenticated customer profile" })
  me(@CurrentUser() user: AuthUser) {
    return this.users.me(user.id);
  }
}
