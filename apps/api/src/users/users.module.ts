import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { AddressesController } from "./addresses.controller";
import { AddressesService } from "./addresses.service";
import { UsersService } from "./users.service";
import { CustomerController } from "./customer.controller";
import { AdminPageAccessController } from "./admin-page-access.controller";
import { AdminPageAccessService } from "./admin-page-access.service";

@Module({
  controllers: [
    UsersController,
    AddressesController,
    CustomerController,
    AdminPageAccessController,
  ],
  providers: [AddressesService, UsersService, AdminPageAccessService],
  exports: [AddressesService],
})
export class UsersModule {}
