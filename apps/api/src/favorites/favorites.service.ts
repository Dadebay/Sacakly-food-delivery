import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { toApiResponse } from "../common/api-response";
import { ProductPricingType } from "../generated/prisma/client";

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const favorites = await this.prisma.favorite.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { productId: true, createdAt: true },
    });
    return toApiResponse(favorites);
  }

  async add(userId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        isActive: true,
        category: { isActive: true, cafe: { isActive: true } },
        OR: [
          { pricingType: ProductPricingType.FIXED },
          {
            pricingType: ProductPricingType.VARIANT,
            variants: { some: { isActive: true } },
          },
        ],
      },
      select: { id: true },
    });
    if (!product) throw new NotFoundException("Product not found");
    const favorite = await this.prisma.favorite.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      update: {},
      select: { productId: true, createdAt: true },
    });
    return toApiResponse(favorite);
  }

  async remove(userId: string, productId: string) {
    await this.prisma.favorite.deleteMany({ where: { userId, productId } });
  }
}
