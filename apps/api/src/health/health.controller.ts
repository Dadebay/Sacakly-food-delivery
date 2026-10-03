import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../common/auth.decorators";

@ApiTags("system")
@Controller("health")
export class HealthController {
  @Get()
  @Public()
  @ApiOperation({ summary: "Liveness check" })
  health() {
    return {
      status: "ok",
      service: "alowalow-api",
      time: new Date().toISOString(),
    };
  }
}
