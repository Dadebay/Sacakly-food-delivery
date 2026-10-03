import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import type { DeliveryZoneSuggestionResponseDto } from "../src/delivery/delivery-response.dto";
import { Role } from "../src/generated/prisma/client";
import { GeocodingService } from "../src/geocoding/geocoding.service";
import { PrismaService } from "../src/prisma/prisma.service";

describe("delivery zone suggestion HTTP", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  const tokens = new Map<Role, string>();
  const phones = ["+99361009981", "+99361009982"];
  const suggestion = vi.fn().mockResolvedValue({
    label: "Berkararlyk etraby, Aşgabat",
    nameRu: "Беркарарлыкский этрап",
    nameTk: "Berkararlyk etraby",
    nameEn: "Berkararlyk District",
    boundary: [
      { latitude: 37.94, longitude: 58.3 },
      { latitude: 37.95, longitude: 58.35 },
      { latitude: 37.92, longitude: 58.34 },
    ],
    provider: "NOMINATIM" as const,
  });
  const auth = (role: Role) => ({
    Authorization: `Bearer ${tokens.get(role)}`,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GeocodingService)
      .useValue({
        suggestDistrictBoundary: suggestion,
      })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);
    server = app.getHttpServer() as Parameters<typeof request>[0];

    for (const [index, role] of [Role.ADMIN, Role.CUSTOMER].entries()) {
      const user = await prisma.user.create({
        data: { phone: phones[index]!, role },
      });
      tokens.set(
        role,
        await jwt.signAsync({ sub: user.id, phone: user.phone, role }),
      );
    }
  });

  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { phone: { in: phones } } });
    await app?.close();
  });

  it("denies anonymous and customer access", async () => {
    const body = { latitude: 37.94, longitude: 58.33 };
    await request(server)
      .post("/api/v1/delivery/admin/zone-suggestion")
      .send(body)
      .expect(401);
    await request(server)
      .post("/api/v1/delivery/admin/zone-suggestion")
      .set(auth(Role.CUSTOMER))
      .send(body)
      .expect(403);
    expect(suggestion).not.toHaveBeenCalled();
  });

  it("lets an administrator load the editable provider suggestion", async () => {
    const response = await request(server)
      .post("/api/v1/delivery/admin/zone-suggestion")
      .set(auth(Role.ADMIN))
      .send({ latitude: 37.94, longitude: 58.33 })
      .expect(200);

    const body = response.body as DeliveryZoneSuggestionResponseDto;
    expect(body).toMatchObject({
      label: "Berkararlyk etraby, Aşgabat",
      nameRu: "Беркарарлыкский этрап",
      nameTk: "Berkararlyk etraby",
      provider: "NOMINATIM",
    });
    expect(body.boundary).toHaveLength(3);
    expect(suggestion).toHaveBeenCalledWith(37.94, 58.33);
  });

  it("rejects unexpected or invalid coordinates before calling the provider", async () => {
    suggestion.mockClear();
    await request(server)
      .post("/api/v1/delivery/admin/zone-suggestion")
      .set(auth(Role.ADMIN))
      .send({ latitude: 999, longitude: 58.33 })
      .expect(400);
    await request(server)
      .post("/api/v1/delivery/admin/zone-suggestion")
      .set(auth(Role.ADMIN))
      .send({ latitude: 37.94, longitude: 58.33, unexpected: true })
      .expect(400);
    expect(suggestion).not.toHaveBeenCalled();
  });
});
