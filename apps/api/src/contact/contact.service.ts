import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { toApiResponse } from "../common/api-response";
import { UpdateContactSettingsDto } from "./contact.dto";
import type { AuthUser } from "../common/auth.types";

@Injectable()
export class ContactService {
  constructor(private readonly prisma: PrismaService) {}
  async get() {
    const value = await this.prisma.contactSettings.upsert({
      where: { id: "default" }, create: { id: "default", displayName: "AloWAlow Destek", phone: "+99312000000" }, update: {},
    });
    return toApiResponse(value);
  }
  async update(actor: AuthUser, dto: UpdateContactSettingsDto) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.contactSettings.findUnique({ where: { id: "default" } });
      const after = await tx.contactSettings.upsert({ where: { id: "default" }, create: { id: "default", ...dto }, update: dto });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "contacts.updated", entityType: "ContactSettings", entityId: "default", metadata: { before: toApiResponse(before), after: toApiResponse(after) } } });
      return toApiResponse(after);
    });
  }
}
