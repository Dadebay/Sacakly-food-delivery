import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/auth.decorators";
import type { AuthUser } from "../common/auth.types";
import { CreateAddressDto, UpdateAddressDto } from "./addresses.dto";
import { AddressesService } from "./addresses.service";

@ApiTags("addresses")
@ApiBearerAuth()
@Controller("users/me/addresses")
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  @ApiOperation({ summary: "List saved addresses; active address comes first" })
  list(@CurrentUser() user: AuthUser) {
    return this.addresses.list(user.id);
  }

  @Post()
  @ApiOperation({ summary: "Save a new address and make it active" })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAddressDto) {
    return this.addresses.create(user.id, dto);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update one of the current user's addresses" })
  update(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addresses.update(user.id, id, dto);
  }

  @Post(":id/activate")
  @ApiOperation({ summary: "Make a saved address active" })
  activate(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.addresses.activate(user.id, id);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete one of the current user's addresses" })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    await this.addresses.remove(user.id, id);
  }
}
