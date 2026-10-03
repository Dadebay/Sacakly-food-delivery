import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PushDevicePlatform, Role } from "../src/generated/prisma/client";
import { PrismaService } from "../src/prisma/prisma.service";
import { AppVersionsService } from "../src/app-versions/app-versions.service";

const policy = {
  latestVersion: "1.10.0",
  minSupportedVersion: "1.9.3",
  storeUrl:
    "https://play.google.com/store/apps/details?id=com.gurbanov.alowalow",
  releaseNotesRu: "Обновление карты",
  releaseNotesTk: null,
  version: 0,
  publishedConfirmed: true,
  confirmMinimumIncrease: true,
};

describe("mobile app version policy HTTP", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  const tokens = new Map<Role, string>();
  const userIds = new Map<Role, string>();
  const auth = (role = Role.ADMIN) => ({
    Authorization: `Bearer ${tokens.get(role)}`,
  });
  const save = (
    body: object = policy,
    platform = "ANDROID",
    role = Role.ADMIN,
  ) =>
    request(server)
      .put(`/api/v1/app/admin/versions/${platform}`)
      .set(auth(role))
      .send(body);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    await app.listen(0, "127.0.0.1");
    server = app.getHttpServer() as Parameters<typeof request>[0];
    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);
    for (const [i, role] of Object.values(Role).entries()) {
      const user = await prisma.user.create({
        data: { phone: `+9936100840${i}`, role },
      });
      userIds.set(role, user.id);
      tokens.set(
        role,
        await jwt.signAsync({ sub: user.id, phone: user.phone, role }),
      );
    }
  });
  beforeEach(async () => {
    await prisma.appVersion.deleteMany();
    await prisma.auditLog.deleteMany({ where: { entityType: "AppVersion" } });
  });
  afterAll(async () => {
    await prisma?.appVersion.deleteMany();
    await app?.close();
  });

  it("starts without a policy on either platform and fails open before login", async () => {
    for (const platform of ["ANDROID", "IOS"])
      await request(server)
        .get(`/api/v1/app/version?platform=${platform}`)
        .expect(404);
    expect(
      (
        await request(server)
          .get("/api/v1/app/admin/versions")
          .set(auth())
          .expect(200)
      ).body,
    ).toEqual([]);
  });

  it.each([
    "",
    "?platform=android",
    "?platform=WEB",
    "?platform=ANDROID&unexpected=x",
    "?platform=IOS&platform=ANDROID",
  ])("strictly validates public query %s", async (query) => {
    await request(server).get(`/api/v1/app/version${query}`).expect(400);
  });

  it("denies anonymous and every non-administrator role for reads and writes", async () => {
    await request(server).get("/api/v1/app/admin/versions").expect(401);
    await request(server)
      .put("/api/v1/app/admin/versions/ANDROID")
      .send(policy)
      .expect(401);
    for (const role of [
      Role.CUSTOMER,
      Role.OPERATOR,
      Role.COOK,
      Role.COURIER,
      Role.ACCOUNTANT,
    ]) {
      await request(server)
        .get("/api/v1/app/admin/versions")
        .set(auth(role))
        .expect(403);
      await save(policy, "ANDROID", role).expect(403);
    }
    expect(await prisma.appVersion.count()).toBe(0);
  });

  it("allows administrators, isolates platforms and exposes only the mobile contract without caching", async () => {
    await save().expect(200);
    await save(
      {
        ...policy,
        latestVersion: "2.1.0",
        storeUrl: "https://apps.apple.com/tm/app/test/id123456789",
      },
      "IOS",
      Role.SUPER_ADMIN,
    ).expect(200);
    const android = await request(server)
      .get("/api/v1/app/version?platform=ANDROID")
      .expect(200);
    expect(android.headers["cache-control"]).toBe("no-store");
    expect(android.body).toEqual({
      latestVersion: "1.10.0",
      minSupportedVersion: "1.9.3",
      storeUrl: policy.storeUrl,
      releaseNotesRu: policy.releaseNotesRu,
      releaseNotesTk: null,
    });
    expect(
      (
        await request(server)
          .get("/api/v1/app/version?platform=IOS")
          .expect(200)
      ).body,
    ).toMatchObject({ latestVersion: "2.1.0" });
    expect(
      (
        await request(server)
          .get("/api/v1/app/admin/versions")
          .set(auth(Role.SUPER_ADMIN))
          .expect(200)
      ).body,
    ).toHaveLength(2);
  });

  it.each([
    "1.4",
    "1.4.0+37",
    "v1.4.0",
    "1.4.0-beta",
    "1.-4.0",
    "1.4.0 ",
    "9".repeat(33) + ".0.0",
  ])("rejects invalid marketing version %s", async (latestVersion) => {
    await save({ ...policy, latestVersion }).expect(400);
  });

  it("compares components numerically and rejects a minimum above latest", async () => {
    await save({
      ...policy,
      latestVersion: "1.9.3",
      minSupportedVersion: "1.10.0",
    }).expect(400);
    await save().expect(200);
    await save({
      ...policy,
      version: 1,
      latestVersion: "1.10.0",
      minSupportedVersion: "01.10.00",
    }).expect(200);
  });

  it.each([
    [
      "ANDROID",
      "http://play.google.com/store/apps/details?id=com.gurbanov.alowalow",
    ],
    [
      "ANDROID",
      "https://evil.example/store/apps/details?id=com.gurbanov.alowalow",
    ],
    ["ANDROID", "https://play.google.com/store/apps/details?id=wrong.app"],
    ["ANDROID", "https://apps.apple.com/app/id12345"],
    ["IOS", "https://apps.apple.com/app/id<APP_STORE_ID>"],
    ["IOS", "https://apps.apple.com.evil.example/app/id12345"],
    ["IOS", "not a url"],
  ])("rejects invalid %s store URL %s", async (platform, storeUrl) => {
    await save({ ...policy, storeUrl }, platform).expect(400);
  });

  it("rejects embedded credentials in store URLs", async () => {
    const storeUrl = new URL(policy.storeUrl);
    storeUrl.username = "qa";
    storeUrl.password = "invalid";
    await save({ ...policy, storeUrl: storeUrl.href }).expect(400);
  });

  it("requires publication and minimum-increase acknowledgements, also on initial configuration", async () => {
    await save({ ...policy, publishedConfirmed: false }).expect(400);
    await save({ ...policy, publishedConfirmed: undefined }).expect(400);
    await save({ ...policy, confirmMinimumIncrease: false }).expect(400);
    await save({
      ...policy,
      minSupportedVersion: "0.0.0",
      confirmMinimumIncrease: false,
    }).expect(200);
    await save({ ...policy, version: 1, confirmMinimumIncrease: false }).expect(
      400,
    );
    await save({ ...policy, version: 1 }).expect(200);
  });

  it("allows an emergency minimum rollback and store/notes correction without a new blocking acknowledgement", async () => {
    await save().expect(200);
    await save({
      ...policy,
      version: 1,
      minSupportedVersion: "1.0.0",
      releaseNotesRu: " ",
      confirmMinimumIncrease: false,
    }).expect(200);
    const result = await request(server)
      .get("/api/v1/app/version?platform=ANDROID")
      .expect(200);
    expect(result.body).toMatchObject({ minSupportedVersion: "1.0.0", releaseNotesRu: null });
  });

  it("rejects stale updates and concurrent creation without losing the committed policy or audit", async () => {
    const responses = await Promise.all([save(), save()]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    await save().expect(409);
    expect(
      await prisma.auditLog.count({ where: { entityType: "AppVersion" } }),
    ).toBe(1);
    const updates = await Promise.all([
      save({ ...policy, version: 1, latestVersion: "2.0.0" }),
      save({ ...policy, version: 1, latestVersion: "3.0.0" }),
    ]);
    expect(updates.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await prisma.auditLog.count({ where: { entityType: "AppVersion" } }),
    ).toBe(2);
    expect(
      (
        await prisma.appVersion.findUniqueOrThrow({
          where: { platform: "ANDROID" },
        })
      ).version,
    ).toBe(2);
  });

  it("atomically audits actor and before/after policy and rolls back if audit cannot persist", async () => {
    await save().expect(200);
    await save({ ...policy, version: 1, latestVersion: "2.0.0" }).expect(200);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: "AppVersion" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit.actorId).toBe(userIds.get(Role.ADMIN));
    expect(audit.metadata).toMatchObject({
      previous: { latestVersion: "1.10.0" },
      current: { latestVersion: "2.0.0" },
      publishedConfirmed: true,
    });
    await expect(
      app
        .get(AppVersionsService)
        .save(
          {
            id: "00000000-0000-4000-8000-000000000000",
            role: Role.ADMIN,
            phone: "+99361008499",
          },
          PushDevicePlatform.ANDROID,
          { ...policy, version: 2, latestVersion: "3.0.0" },
        ),
    ).rejects.toThrow();
    expect(
      (
        await prisma.appVersion.findUniqueOrThrow({
          where: { platform: "ANDROID" },
        })
      ).latestVersion,
    ).toBe("2.0.0");
  });

  it("rejects unknown body fields, invalid platform, missing version and stale role claims", async () => {
    await save({ ...policy, unknown: true }).expect(400);
    await save(policy, "WEB").expect(400);
    await save({ ...policy, version: undefined }).expect(400);
    await prisma.user.update({
      where: { id: userIds.get(Role.ADMIN) },
      data: { role: Role.CUSTOMER },
    });
    try {
      await save().expect(403);
    } finally {
      await prisma.user.update({
        where: { id: userIds.get(Role.ADMIN) },
        data: { role: Role.ADMIN },
      });
    }
  });
});
