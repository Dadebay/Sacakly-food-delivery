import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { OtpService } from "./otp.service";
import { SmsGatewayController } from "./sms-gateway.controller";
import { SmsGatewayGuard } from "./sms-gateway.guard";
import { SmsGatewayService } from "./sms-gateway.service";
import { SmsService } from "./sms.service";

@Module({
  controllers: [AuthController, SmsGatewayController],
  providers: [
    AuthService,
    OtpService,
    SmsGatewayGuard,
    SmsGatewayService,
    SmsService,
  ],
})
export class AuthModule {}
