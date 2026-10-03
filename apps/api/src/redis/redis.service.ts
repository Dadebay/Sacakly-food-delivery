import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, type RedisClientType } from "redis";
import type { AppEnv } from "../config/env";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: RedisClientType;

  constructor(config: ConfigService<AppEnv, true>) {
    this.client = createClient({
      url: config.get("REDIS_URL", { infer: true }),
      socket: {
        connectTimeout: 5_000,
        reconnectStrategy: (retries) =>
          retries >= 3 ? false : Math.min(100 * 2 ** retries, 1_000),
      },
    });
    this.client.on("error", () => {
      this.logger.error("Redis connection error");
    });
  }

  async onModuleInit() {
    await this.client.connect();
  }

  onModuleDestroy() {
    if (this.client.isOpen) this.client.destroy();
  }

  async evalNumber(script: string, keys: string[], args: string[]) {
    const result = await this.eval(script, keys, args);
    return Number(result);
  }

  eval(script: string, keys: string[], args: string[]) {
    return this.client.eval(script, {
      keys,
      arguments: args,
    });
  }

  async getMany(keys: string[]) {
    if (!keys.length) return [];
    return this.client.mGet(keys);
  }

  get(key: string) {
    return this.client.get(key);
  }

  hGet(key: string, field: string) {
    return this.client.hGet(key, field);
  }

  async delete(key: string) {
    return this.client.del(key);
  }
}
