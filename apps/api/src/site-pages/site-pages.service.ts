import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthUser } from "../common/auth.types";
import { MarketplaceService } from "../marketplace/marketplace.service";
import { PrismaService } from "../prisma/prisma.service";
import type { SaveSitePageDto, SitePageParamsDto } from "./site-pages.dto";

@Injectable()
export class SitePagesService {
  constructor(private readonly prisma: PrismaService, private readonly marketplace: MarketplaceService) {}

  publishedPages() {
    return this.prisma.sitePage.findMany({
      where: { published: true },
      select: { locale: true, slug: true, title: true, description: true, published: true, version: true, updatedAt: true },
      orderBy: [{ locale: "asc" }, { slug: "asc" }],
    });
  }

  async publishedPage(params: SitePageParamsDto) {
    const page = await this.prisma.sitePage.findUnique({ where: { locale_slug: params },
      select: { locale: true, slug: true, title: true, description: true, body: true, published: true, version: true, updatedAt: true } });
    if (!page?.published) throw new NotFoundException("Page not found");
    return page;
  }

  async ownerPages(actor: AuthUser) {
    await this.marketplace.assertOwner(actor);
    return this.prisma.sitePage.findMany({ orderBy: [{ locale: "asc" }, { slug: "asc" }] });
  }

  async save(actor: AuthUser, params: SitePageParamsDto, dto: SaveSitePageDto) {
    await this.marketplace.assertOwner(actor);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const data = {
          title: dto.title.trim(), description: dto.description.trim(),
          body: dto.body.trim(), published: dto.published, updatedById: actor.id,
        };
        let page;
        if (dto.expectedVersion === 0) {
          page = await tx.sitePage.create({ data: { ...params, ...data } });
        } else {
          const changed = await tx.sitePage.updateMany({
            where: { ...params, version: dto.expectedVersion },
            data: { ...data, version: { increment: 1 } },
          });
          if (changed.count !== 1) throw new ConflictException("Page changed; reload and retry");
          page = await tx.sitePage.findUniqueOrThrow({ where: { locale_slug: params } });
        }
        await tx.auditLog.create({
          data: { actorId: actor.id, action: "site.page.saved", entityType: "SitePage",
            entityId: `${params.locale}/${params.slug}`,
            metadata: { version: page.version, published: page.published } },
        });
        return page;
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        throw new ConflictException("Page changed; reload and retry");
      }
      throw error;
    }
  }
}
