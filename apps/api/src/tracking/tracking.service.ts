import {
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { AuthUser } from "../common/auth.types";
import { OrderStatus, Role } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import {
  type CourierLocationDto,
  type DispatchCourierDto,
  type DispatchSnapshotDto,
  type UpdateCourierLocationDto,
  type UpdateCourierLocationResponseDto,
} from "./tracking.dto";
import { TrackingLiveService } from "./tracking-live.service";
import { RoutingService, RoutingUnavailableError } from "../routing/routing.service";

const COURIER_UPDATE_INTERVAL_SECONDS = 15;
const LOCATION_TTL_SECONDS = 15 * 60;
const ONLINE_WINDOW_MS = 5 * 60 * 1_000;
const MAX_READING_AGE_MS = 10 * 60 * 1_000;
const MAX_FUTURE_SKEW_MS = 60 * 1_000;
const ACTIVE_DELIVERY_STATUSES = [
  OrderStatus.ASSIGNED_TO_COURIER,
  OrderStatus.OUT_FOR_DELIVERY,
] as const;

type StoredCourierLocation = CourierLocationDto & {
  recordedAtMs: number;
};

const STORE_NEWEST_LOCATION_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if current then
  local ok, decoded = pcall(cjson.decode, current)
  if ok and decoded["recordedAtMs"] and tonumber(decoded["recordedAtMs"]) > tonumber(ARGV[1]) then
    return 0
  end
end
redis.call("SET", KEYS[1], ARGV[2], "EX", ARGV[3])
return 1
`;

@Injectable()
export class TrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly live: TrackingLiveService,
    private readonly routing: RoutingService,
  ) {}

  async updateLocation(
    courier: AuthUser,
    dto: UpdateCourierLocationDto,
  ): Promise<UpdateCourierLocationResponseDto> {
    const now = Date.now();
    const recordedAtMs = Date.parse(dto.recordedAt);
    if (recordedAtMs < now - MAX_READING_AGE_MS) {
      throw new UnprocessableEntityException(
        "Location reading is older than 10 minutes",
      );
    }
    if (recordedAtMs > now + MAX_FUTURE_SKEW_MS) {
      throw new UnprocessableEntityException(
        "Location reading is too far in the future",
      );
    }

    const location: StoredCourierLocation = {
      latitude: dto.latitude,
      longitude: dto.longitude,
      ...(dto.accuracy !== undefined ? { accuracy: dto.accuracy } : {}),
      ...(dto.heading !== undefined ? { heading: dto.heading } : {}),
      ...(dto.speed !== undefined ? { speed: dto.speed } : {}),
      recordedAt: new Date(recordedAtMs).toISOString(),
      receivedAt: new Date(now).toISOString(),
      recordedAtMs,
    };
    const accepted = await this.redis.evalNumber(
      STORE_NEWEST_LOCATION_SCRIPT,
      [this.locationKey(courier.id)],
      [
        String(recordedAtMs),
        JSON.stringify(location),
        String(LOCATION_TTL_SECONDS),
      ],
    );
    if (accepted !== 1) {
      throw new ConflictException(
        "A newer courier location has already been received",
      );
    }

    const publicLocation = this.publicLocation(location);
    this.live.publishLocation(courier.id, publicLocation);
    return {
      accepted: true,
      location: publicLocation,
      nextUpdateInSeconds: COURIER_UPDATE_INTERVAL_SECONDS,
    };
  }

  async stopSharing(courier: AuthUser) {
    await this.redis.delete(this.locationKey(courier.id));
    this.live.publishLocation(courier.id, null);
    return { success: true };
  }

  dispatchLive() {
    return this.live.stream();
  }

  async getCourierLocation(
    courierId: string,
  ): Promise<CourierLocationDto | null> {
    return this.parseLocation(
      await this.redis.get(this.locationKey(courierId)),
    );
  }

  async customerCourierLocation(customer: AuthUser, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId: customer.id },
      select: { courierId: true, status: true },
    });
    if (!order) {
      throw new UnprocessableEntityException(
        "Order is not available for this customer",
      );
    }
    const location = order.courierId && order.status === OrderStatus.OUT_FOR_DELIVERY
      ? await this.getCourierLocation(order.courierId)
      : null;
    return { location: location && Date.now() - Date.parse(location.recordedAt) <= 90_000
      ? location : null };
  }

  async customerCourierRoute(customer: AuthUser, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId: customer.id },
      select: { courierId: true, status: true, latitude: true, longitude: true },
    });
    if (!order) {
      throw new UnprocessableEntityException("Order is not available for this customer");
    }
    const unavailable = (routingStatus: "NO_COURIER" | "UNAVAILABLE") => ({
      routingStatus, geometry: null, distanceMeters: null, durationSeconds: null,
    });
    if (order.status !== OrderStatus.OUT_FOR_DELIVERY || !order.courierId) {
      return unavailable("NO_COURIER");
    }
    const courier = await this.getCourierLocation(order.courierId);
    if (!courier || Date.now() - Date.parse(courier.recordedAt) > 90_000) {
      return unavailable("NO_COURIER");
    }
    try {
      const route = await this.routing.planDrivingRoute([
        { latitude: courier.latitude, longitude: courier.longitude },
        { latitude: Number(order.latitude), longitude: Number(order.longitude) },
      ]);
      return {
        routingStatus: "READY" as const,
        geometry: route.geometry,
        distanceMeters: route.distanceMeters,
        durationSeconds: route.durationSeconds,
      };
    } catch (error) {
      if (!(error instanceof RoutingUnavailableError)) throw error;
      return unavailable("UNAVAILABLE");
    }
  }

  async getDispatchSnapshot(): Promise<DispatchSnapshotDto> {
    const [couriers, branches] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: Role.COURIER, isActive: true },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          courierOrders: {
            where: { status: { in: [...ACTIVE_DELIVERY_STATUSES] } },
            select: {
              id: true,
              number: true,
              status: true,
              address: true,
              latitude: true,
              longitude: true,
              branchId: true,
              branchName: true,
              branchAddress: true,
              branchLatitude: true,
              branchLongitude: true,
              entrance: true,
              floor: true,
              apartment: true,
              customerNote: true,
              total: true,
              assignedAt: true,
              customer: {
                select: {
                  firstName: true,
                  lastName: true,
                  phone: true,
                },
              },
              items: {
                select: {
                  productName: true,
                  variantName: true,
                  quantity: true,
                },
                orderBy: { productName: "asc" },
              },
            },
            orderBy: [{ assignedAt: "asc" }, { createdAt: "asc" }],
          },
        },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      }),
      this.prisma.branch.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
      }),
    ]);

    const courierIds = couriers.map(({ id }) => id);
    const [locations, ratedOrders] = await Promise.all([
      this.redis.getMany(
        courierIds.map((courierId) => this.locationKey(courierId)),
      ),
      courierIds.length
        ? this.prisma.order.findMany({
            where: {
              courierId: { in: courierIds },
              rating: { isNot: null },
            },
            select: {
              courierId: true,
              rating: { select: { score: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const ratings = new Map<string, number[]>();
    for (const order of ratedOrders) {
      if (!order.courierId || !order.rating) continue;
      const scores = ratings.get(order.courierId) ?? [];
      scores.push(order.rating.score);
      ratings.set(order.courierId, scores);
    }

    const now = Date.now();
    const result: DispatchCourierDto[] = couriers.map((courier, index) => {
      const location = this.parseLocation(locations[index]);
      const age = location ? now - Date.parse(location.recordedAt) : Infinity;
      const scores = ratings.get(courier.id) ?? [];
      return {
        id: courier.id,
        firstName: courier.firstName,
        lastName: courier.lastName,
        phone: courier.phone,
        presence:
          age <= ONLINE_WINDOW_MS ? "ONLINE" : location ? "STALE" : "OFFLINE",
        location,
        rating: scores.length
          ? Number(
              (
                scores.reduce((sum, score) => sum + score, 0) / scores.length
              ).toFixed(1),
            )
          : null,
        activeOrders: courier.courierOrders.map((order) => ({
          id: order.id,
          number: order.number,
          status: order.status,
          address: order.address,
          latitude: Number(order.latitude),
          longitude: Number(order.longitude),
          branch: order.branchId
            ? {
                id: order.branchId,
                name: order.branchName,
                address: order.branchAddress,
                latitude: order.branchLatitude
                  ? Number(order.branchLatitude)
                  : null,
                longitude: order.branchLongitude
                  ? Number(order.branchLongitude)
                  : null,
              }
            : null,
          entrance: order.entrance,
          floor: order.floor,
          apartment: order.apartment,
          customerNote: order.customerNote,
          cashToCollect: Number(order.total),
          assignedAt: order.assignedAt?.toISOString() ?? null,
          customer: order.customer,
          items: order.items,
        })),
      };
    });

    return {
      generatedAt: new Date(now).toISOString(),
      courierUpdateIntervalSeconds: COURIER_UPDATE_INTERVAL_SECONDS,
      branches: branches.map((branch) => ({
        id: branch.id,
        name: branch.name,
        address: branch.address,
        latitude: Number(branch.latitude),
        longitude: Number(branch.longitude),
        phone: branch.phone,
      })),
      couriers: result,
    };
  }

  private locationKey(courierId: string) {
    return `tracking:courier:${courierId}:latest`;
  }

  private parseLocation(raw: string | null | undefined) {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<StoredCourierLocation>;
      if (
        typeof parsed.latitude !== "number" ||
        typeof parsed.longitude !== "number" ||
        typeof parsed.recordedAt !== "string" ||
        typeof parsed.receivedAt !== "string"
      ) {
        return null;
      }
      return this.publicLocation(parsed as StoredCourierLocation);
    } catch {
      return null;
    }
  }

  private publicLocation(location: StoredCourierLocation): CourierLocationDto {
    return {
      latitude: location.latitude,
      longitude: location.longitude,
      ...(location.accuracy !== undefined
        ? { accuracy: location.accuracy }
        : {}),
      ...(location.heading !== undefined ? { heading: location.heading } : {}),
      ...(location.speed !== undefined ? { speed: location.speed } : {}),
      recordedAt: location.recordedAt,
      receivedAt: location.receivedAt,
    };
  }
}
