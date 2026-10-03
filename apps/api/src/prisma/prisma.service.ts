import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import type { AppEnv } from "../config/env";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService<AppEnv, true>) {
    const adapter = new PrismaPg({
      connectionString: config.get("DATABASE_URL", { infer: true }),
    });
    super({ adapter });
  }

  async onModuleInit() {
    if (process.env.GENERATE_OPENAPI !== "true") {
      await this.$connect();
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
