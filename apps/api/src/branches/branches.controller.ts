import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { CreateBranchDto, UpdateBranchDto } from "./branches.dto";
import { BranchResponseDto } from "./branches-response.dto";
import { BranchesService } from "./branches.service";

@ApiTags("branches")
@ApiBearerAuth()
@Roles(Role.OPERATOR, Role.COOK, Role.COURIER, Role.ACCOUNTANT, Role.ADMIN)
@Controller("branches")
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  @ApiOperation({ summary: "List all branches for operations" })
  @ApiOkResponse({ type: [BranchResponseDto] })
  list() {
    return this.branches.list();
  }

  @Post()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.BRANCHES)
  @ApiOperation({ summary: "Create a delivery branch" })
  @ApiCreatedResponse({ type: BranchResponseDto })
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateBranchDto) {
    return this.branches.create(actor, dto);
  }

  @Patch(":id")
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.BRANCHES)
  @ApiOperation({ summary: "Update or deactivate a delivery branch" })
  @ApiOkResponse({ type: BranchResponseDto })
  update(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.branches.update(actor, id, dto);
  }
}
