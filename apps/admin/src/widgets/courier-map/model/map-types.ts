import type { components } from "@sacakly/api-contract";
import type { CourierRoute, DispatchCourier } from "@/src/entities/courier";

export type { DispatchCourier };
export type DispatchBranchDto =
  components["schemas"]["DispatchBranchDto"];

export type CourierRouteOverlay = {
  color: string;
  courier: DispatchCourier;
  route: CourierRoute;
};
