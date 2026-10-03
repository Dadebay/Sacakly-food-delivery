import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../common/auth.decorators";
import { AuthService } from "./auth.service";
import {
  AuthSessionResponseDto,
  LogoutResponseDto,
  RefreshTokenDto,
  RequestOtpDto,
  RequestOtpResponseDto,
  VerifyOtpDto,
} from "./auth.dto";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("otp/request")
  @Public()
  @HttpCode(200)
  @ApiOperation({
    summary: "Send a one-time login code to the phone by SMS",
  })
  @ApiOkResponse({ type: RequestOtpResponseDto })
  request(@Body() dto: RequestOtpDto) {
    return this.auth.requestOtp(dto);
  }

  @Post("otp/verify")
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: "Verify code and create or sign in a user" })
  @ApiOkResponse({ type: AuthSessionResponseDto })
  verify(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto);
  }

  @Post("refresh")
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: "Rotate refresh token and issue a new session" })
  @ApiOkResponse({ type: AuthSessionResponseDto })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post("logout")
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: "Revoke a refresh token" })
  @ApiOkResponse({ type: LogoutResponseDto })
  logout(@Body() dto: RefreshTokenDto) {
    return this.auth.logout(dto.refreshToken);
  }
}
