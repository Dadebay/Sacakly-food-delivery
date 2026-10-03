import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { AdminPage, Role, type User } from "../src/generated/prisma/client";
import { PrismaService } from "../src/prisma/prisma.service";

type ActorName =
  | "accountant"
  | "admin"
  | "cook"
  | "courier"
  | "courierTwo"
  | "customer"
  | "operator"
  | "superAdmin";

type PageAccessResponse = {
  role: Role;
  allowedPages: AdminPage[];
  availablePages: AdminPage[];
  expandedPages: AdminPage[];
  editable: boolean;
  version: number;
};

describe("role-wide admin page access", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let users: Record<ActorName, User>;
  let tokens: Record<ActorName, string>;

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);
    server = app.getHttpServer() as Parameters<typeof request>[0];

    await prisma.adminRolePageAccess.deleteMany({
      where: {
        role: {
          in: [
            Role.ACCOUNTANT,
            Role.ADMIN,
            Role.COOK,
            Role.COURIER,
            Role.OPERATOR,
          ],
        },
      },
    });

    const roles = {
      accountant: Role.ACCOUNTANT,
      admin: Role.ADMIN,
      cook: Role.COOK,
      courier: Role.COURIER,
      courierTwo: Role.COURIER,
      customer: Role.CUSTOMER,
      operator: Role.OPERATOR,
      superAdmin: Role.SUPER_ADMIN,
    } satisfies Record<ActorName, Role>;
    users = Object.fromEntries(
      await Promise.all(
        Object.entries(roles).map(async ([name, role], index) => [
          name,
          await prisma.user.create({
            data: {
              phone: `+99365009${String(index + 1).padStart(3, "0")}`,
              firstName: `page-access-${name}`,
              role,
            },
          }),
        ]),
      ),
    ) as Record<ActorName, User>;
    tokens = Object.fromEntries(
      await Promise.all(
        Object.entries(users).map(async ([name, user]) => [
          name,
          await jwt.signAsync({
            sub: user.id,
            phone: user.phone,
            role: user.role,
          }),
        ]),
      ),
    ) as Record<ActorName, string>;
  });

  afterAll(async () => {
    await prisma.adminRolePageAccess.deleteMany({
      where: {
        role: {
          in: [
            Role.ACCOUNTANT,
            Role.ADMIN,
            Role.COOK,
            Role.COURIER,
            Role.OPERATOR,
          ],
        },
      },
    });
    await prisma.auditLog.deleteMany({
      where: { action: "admin_role_page_access.updated" },
    });
    await prisma.user.deleteMany({
      where: { firstName: { startsWith: "page-access-" } },
    });
    await app.close();
  });

  it("returns role defaults and all 14 pages for every configurable role", async () => {
    await request(server).get("/api/v1/admin-page-access/me").expect(401);
    await request(server)
      .get("/api/v1/admin-page-access/me")
      .set(bearer(tokens.customer))
      .expect(403);

    for (const [name, defaults] of [
      ["accountant", [AdminPage.ACCOUNTING]],
      ["operator", [AdminPage.ORDERS, AdminPage.COURIER_MAP]],
      ["cook", [AdminPage.ORDERS]],
      ["courier", [AdminPage.COURIER_WORKSPACE]],
    ] as const) {
      const response = await request(server)
        .get("/api/v1/admin-page-access/me")
        .set(bearer(tokens[name]))
        .expect(200);
      expect(response.body).toMatchObject({
        role: users[name].role,
        allowedPages: defaults,
        availablePages: Object.values(AdminPage),
        editable: true,
        version: 0,
      });
    }

    const superAdmin = await request(server)
      .get("/api/v1/admin-page-access/me")
      .set(bearer(tokens.superAdmin))
      .expect(200);
    expect(superAdmin.body).toMatchObject({
      role: Role.SUPER_ADMIN,
      editable: false,
      allowedPages: Object.values(AdminPage),
      availablePages: Object.values(AdminPage),
    });

    const matrix = await request(server)
      .get("/api/v1/admin-page-access")
      .set(bearer(tokens.superAdmin))
      .expect(200);
    const matrixBody = matrix.body as { roles: PageAccessResponse[] };
    expect(matrixBody.roles.map(({ role }) => role)).toEqual([
      Role.SUPER_ADMIN,
      Role.ADMIN,
      Role.OPERATOR,
      Role.COOK,
      Role.COURIER,
      Role.ACCOUNTANT,
    ]);
    for (const access of matrixBody.roles) {
      expect(access.availablePages).toEqual(Object.values(AdminPage));
    }
  });

  it("lets only super admin update a role with optimistic concurrency", async () => {
    await request(server)
      .get("/api/v1/admin-page-access")
      .set(bearer(tokens.admin))
      .expect(403);
    await request(server)
      .put("/api/v1/admin-page-access/ADMIN")
      .set(bearer(tokens.admin))
      .send({ allowedPages: [AdminPage.ORDERS], version: 0 })
      .expect(403);

    const saved = await request(server)
      .put("/api/v1/admin-page-access/ADMIN")
      .set(bearer(tokens.superAdmin))
      .send({
        allowedPages: [AdminPage.ORDERS, AdminPage.CATALOG],
        version: 0,
      })
      .expect(200);
    expect(saved.body).toMatchObject({
      role: Role.ADMIN,
      allowedPages: [AdminPage.ORDERS, AdminPage.CATALOG],
      version: 1,
    });

    const mine = await request(server)
      .get("/api/v1/admin-page-access/me")
      .set(bearer(tokens.admin))
      .expect(200);
    expect((mine.body as PageAccessResponse).allowedPages).toEqual([
      AdminPage.ORDERS,
      AdminPage.CATALOG,
    ]);
    await request(server)
      .get("/api/v1/staff/recent-logins")
      .set(bearer(tokens.admin))
      .expect(403);

    await request(server)
      .put("/api/v1/admin-page-access/ADMIN")
      .set(bearer(tokens.superAdmin))
      .send({ allowedPages: [AdminPage.ORDERS], version: 0 })
      .expect(409);
    expect(
      await prisma.auditLog.count({
        where: {
          actorId: users.superAdmin.id,
          action: "admin_role_page_access.updated",
          entityId: Role.ADMIN,
        },
      }),
    ).toBe(1);
  });

  it("grants normal admin access to every courier in the role", async () => {
    for (const token of [tokens.courier, tokens.courierTwo]) {
      await request(server)
        .get("/api/v1/staff/recent-logins")
        .set(bearer(token))
        .expect(403);
    }

    const saved = await request(server)
      .put("/api/v1/admin-page-access/COURIER")
      .set(bearer(tokens.superAdmin))
      .send({ allowedPages: [AdminPage.STAFF], version: 0 })
      .expect(200);
    expect((saved.body as PageAccessResponse).allowedPages).toEqual([
      AdminPage.STAFF,
    ]);
    expect((saved.body as PageAccessResponse).expandedPages).toEqual([
      AdminPage.STAFF,
    ]);

    for (const name of ["courier", "courierTwo"] as const) {
      const mine = await request(server)
        .get("/api/v1/admin-page-access/me")
        .set(bearer(tokens[name]))
        .expect(200);
      expect((mine.body as PageAccessResponse).allowedPages).toEqual([
        AdminPage.STAFF,
      ]);
      await request(server)
        .get("/api/v1/staff/recent-logins")
        .set(bearer(tokens[name]))
        .expect(200);
      await request(server)
        .get("/api/v1/orders")
        .set(bearer(tokens[name]))
        .expect(403);
    }
  });

  it("accepts cross-role expansion and rejects immutable roles", async () => {
    const accountant = await request(server)
      .put("/api/v1/admin-page-access/ACCOUNTANT")
      .set(bearer(tokens.superAdmin))
      .send({
        allowedPages: [AdminPage.ACCOUNTING, AdminPage.ORDERS],
        version: 0,
      })
      .expect(200);
    expect((accountant.body as PageAccessResponse).allowedPages).toEqual([
      AdminPage.ORDERS,
      AdminPage.ACCOUNTING,
    ]);

    await request(server)
      .put("/api/v1/admin-page-access/SUPER_ADMIN")
      .set(bearer(tokens.superAdmin))
      .send({ allowedPages: [], version: 0 })
      .expect(400);
    await request(server)
      .put("/api/v1/admin-page-access/CUSTOMER")
      .set(bearer(tokens.superAdmin))
      .send({ allowedPages: [AdminPage.ORDERS], version: 0 })
      .expect(400);
  });
});
