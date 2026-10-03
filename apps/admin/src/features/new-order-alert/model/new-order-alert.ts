import type { Role } from "@/src/entities/order";

const alertRoles = new Set<Role>(["OPERATOR", "ADMIN", "SUPER_ADMIN"]);
export function canReceiveNewOrderAlerts(role: Role) {
  return alertRoles.has(role);
}

export function collectNewItems<T extends { id: string }>(
  previousIds: ReadonlySet<string> | null,
  currentItems: readonly T[],
) {
  if (!previousIds) return [];
  return currentItems.filter((item) => !previousIds.has(item.id));
}

/** Keep the initial boundary fixed: concurrent orders can commit out of creation order. */
export function createNewOrderTracker<T extends { id: string; createdAt: string }>() {
  let seenIds: Set<string> | null = null;
  let baselineCreatedAt = -Infinity;

  return (items: readonly T[]) => {
    if (!seenIds) {
      for (const item of items) {
        const createdAt = Date.parse(item.createdAt);
        if (createdAt > baselineCreatedAt) baselineCreatedAt = createdAt;
      }
    }
    const fresh = collectNewItems(seenIds, items).filter(
      (item) => Date.parse(item.createdAt) >= baselineCreatedAt,
    );
    seenIds ??= new Set();
    for (const item of items) seenIds.add(item.id);
    return fresh;
  };
}
