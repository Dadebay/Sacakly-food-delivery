import { Body, Controller, Get, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { AdminPages, CurrentUser, Public, Roles } from "../common/auth.decorators";
import type { AuthUser } from "../common/auth.types";
import { AdminPage, Role } from "../generated/prisma/client";
import { UpdateContactSettingsDto } from "./contact.dto";
import { ContactSettingsResponseDto } from "./contact-response.dto";
import { ContactService } from "./contact.service";

@ApiTags("contacts")
@Controller("contacts")
export class ContactController {
  constructor(private readonly contacts: ContactService) {}
  @Get()
  @Public()
  @ApiOkResponse({ type: ContactSettingsResponseDto })
  get() {
    return this.contacts.get();
  }

  @Put()
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @AdminPages(AdminPage.CONTACTS)
  @ApiOkResponse({ type: ContactSettingsResponseDto })
  update(@CurrentUser() actor: AuthUser, @Body() dto: UpdateContactSettingsDto) {
    return this.contacts.update(actor, dto);
  }
}
