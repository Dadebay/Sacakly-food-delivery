import type { components, operations } from "@sacakly/api-contract";

export type Session = components["schemas"]["AuthSessionResponseDto"];
export type MemberCafe = components["schemas"]["MemberCafeResponseDto"];
export type Cafe = components["schemas"]["CatalogCafeResponseDto"];
export type Module = components["schemas"]["CafeModuleResponseDto"];
export type CourierApplication = components["schemas"]["PendingCourierApplicationResponseDto"];
export type MerchantOrder = components["schemas"]["MerchantOrderResponseDto"];
export type CafeMember = components["schemas"]["CafeMembershipWithUserResponseDto"];
export type MarketplaceUser = components["schemas"]["MarketplaceUserResponseDto"];
export type DispatchOrder = components["schemas"]["DispatchOrderResponseDto"];
export type DispatchCourier = components["schemas"]["DispatchCourierResponseDto"];
export type OwnCourier = components["schemas"]["OwnCafeCourierResponseDto"];
export type DeliveryRequest = components["schemas"]["DeliveryRequestResponseDto"];
export type ExternalOffer = components["schemas"]["ExternalDeliveryOfferResponseDto"];
export type SitePage = components["schemas"]["SitePageResponseDto"];
export type CafeCatalog = components["schemas"]["CafeCatalogResponseDto"];
export type CafeCategory = components["schemas"]["CafeCategoryResponseDto"];
export type CafeProduct = components["schemas"]["CafeProductResponseDto"];
export type CafeBranch = components["schemas"]["CafeBranchResponseDto"];
export type ModuleKey = operations["MarketplaceController_setCafeModule_v1"]["parameters"]["path"]["key"];

const SESSION_KEY = "sacakly.merchant.session";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class ApiClient {
  private session: Session | null = null;
  private refreshPromise: Promise<void> | null = null;

  constructor() {
    try {
      const value = sessionStorage.getItem(SESSION_KEY);
      this.session = value ? JSON.parse(value) as Session : null;
    } catch {
      this.session = null;
    }
  }

  getSession() { return this.session; }

  setSession(session: Session | null) {
    this.session = session;
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  }

  private async refresh() {
    if (!this.session) throw new ApiError(401, "Войдите снова");
    if (!this.refreshPromise) {
      this.refreshPromise = (async () => {
        const response = await fetch("/api/v1/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: this.session?.refreshToken }),
        });
        if (!response.ok) {
          this.setSession(null);
          throw new ApiError(401, "Сессия истекла. Войдите снова");
        }
        this.setSession(await response.json() as Session);
      })().finally(() => { this.refreshPromise = null; });
    }
    return this.refreshPromise;
  }

  async request<T>(path: string, method = "GET", body?: unknown, authenticated = true): Promise<T> {
    const send = () => fetch(`/api/v1${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(authenticated && this.session ? { Authorization: `Bearer ${this.session.accessToken}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let response = await send();
    if (response.status === 401 && authenticated && this.session) {
      await this.refresh();
      response = await send();
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { message?: string | string[] };
      const message = Array.isArray(data.message) ? data.message.join("; ") : data.message;
      throw new ApiError(response.status, message || "Не удалось выполнить запрос");
    }
    return response.json() as Promise<T>;
  }

  requestOtp(phone: string) {
    return this.request<components["schemas"]["RequestOtpResponseDto"]>("/auth/otp/request", "POST", { phone }, false);
  }

  async verifyOtp(phone: string, code: string) {
    const session = await this.request<Session>("/auth/otp/verify", "POST", { phone, code }, false);
    this.setSession(session);
    return session;
  }

  async logout() {
    const refreshToken = this.session?.refreshToken;
    this.setSession(null);
    if (refreshToken) {
      try { await this.request("/auth/logout", "POST", { refreshToken }, false); }
      catch { /* Local session is already cleared. */ }
    }
  }

  ownCouriers(cafeId: string) { return this.request<OwnCourier[]>(`/marketplace/delivery/merchant/cafes/${encodeURIComponent(cafeId)}/couriers`); }
  chooseDelivery(cafeId: string, orderId: string, mode: "OWN" | "NETWORK", expectedOrderVersion: number, courierId?: string) { return this.request<DeliveryRequest>(`/marketplace/delivery/merchant/cafes/${encodeURIComponent(cafeId)}/orders/${encodeURIComponent(orderId)}/route`, "POST", { mode, expectedOrderVersion, ...(mode === "OWN" ? { courierId } : {}) }); }
  readyOrder(cafeId: string, orderId: string, version: number, checkedItemIds: string[], checkedGiftIds: string[]) { return this.request<components["schemas"]["OrderResponseDto"]>(`/marketplace/delivery/merchant/cafes/${encodeURIComponent(cafeId)}/orders/${encodeURIComponent(orderId)}/ready`, "POST", { version, checkedItemIds, checkedGiftIds }); }
  externalOffers() { return this.request<ExternalOffer[]>("/marketplace/delivery/courier/offers"); }
  claimOffer(orderId: string) { return this.request<DeliveryRequest>(`/marketplace/delivery/courier/offers/${encodeURIComponent(orderId)}/claim`, "POST"); }
  sitePages() { return this.request<SitePage[]>("/site/owner/pages"); }
  saveSitePage(locale: "tk" | "ru" | "en", slug: string, input: { title: string; description: string; body: string; published: boolean; expectedVersion: number }) { return this.request<SitePage>(`/site/owner/pages/${locale}/${encodeURIComponent(slug)}`, "PUT", input); }

  cafeCatalog(cafeId: string) { return this.request<CafeCatalog>(`/marketplace/merchant/cafes/${encodeURIComponent(cafeId)}/catalog`); }
  createCafeCategory(cafeId: string, input: { name: string; slug: string }) { return this.request<CafeCategory>(`/marketplace/merchant/cafes/${encodeURIComponent(cafeId)}/catalog/categories`, "POST", input); }
  updateCafeCategory(cafeId: string, id: string, input: { expectedVersion: number; name?: string; isActive?: boolean }) { return this.request<CafeCategory>(`/marketplace/merchant/cafes/${encodeURIComponent(cafeId)}/catalog/categories/${encodeURIComponent(id)}`, "PATCH", input); }
  createCafeProduct(cafeId: string, input: { categoryId: string; name: string; slug: string; description: string; price: number; preparationMinutes: number }) { return this.request<CafeProduct>(`/marketplace/merchant/cafes/${encodeURIComponent(cafeId)}/catalog/products`, "POST", input); }
  updateCafeProduct(cafeId: string, id: string, input: { expectedVersion: number; categoryId?: string; name?: string; description?: string; price?: number; preparationMinutes?: number; isActive?: boolean }) { return this.request<CafeProduct>(`/marketplace/merchant/cafes/${encodeURIComponent(cafeId)}/catalog/products/${encodeURIComponent(id)}`, "PATCH", input); }
  createCafeBranch(cafeId: string, input: { name: string; address: string; latitude: number; longitude: number }) { return this.request<CafeBranch>(`/marketplace/merchant/cafes/${encodeURIComponent(cafeId)}/catalog/branches`, "POST", input); }
  updateCafeBranch(cafeId: string, id: string, input: { expectedVersion: number; name?: string; address?: string; latitude?: number; longitude?: number; isActive?: boolean }) { return this.request<CafeBranch>(`/marketplace/merchant/cafes/${encodeURIComponent(cafeId)}/catalog/branches/${encodeURIComponent(id)}`, "PATCH", input); }

  myCafes() { return this.request<MemberCafe[]>("/marketplace/merchant/cafes/me"); }
  ownerStatus() { return this.request<components["schemas"]["OwnerStatusResponseDto"]>("/marketplace/owner/me"); }
  cafes() { return this.request<Cafe[]>("/catalog/cafes", "GET", undefined, false); }
  orders(cafeId: string) { return this.request<MerchantOrder[]>(`/marketplace/merchant/cafes/${encodeURIComponent(cafeId)}/orders`); }
  pendingCouriers() { return this.request<CourierApplication[]>("/marketplace/owner/courier-applications"); }
  reviewCourier(userId: string, decision: "APPROVED" | "REJECTED") {
    return this.request(`/marketplace/owner/courier-applications/${encodeURIComponent(userId)}`, "PATCH", { decision });
  }
  modules(cafeId: string) { return this.request<Module[]>(`/marketplace/owner/cafes/${encodeURIComponent(cafeId)}/modules`); }
  members(cafeId: string) { return this.request<CafeMember[]>(`/marketplace/owner/cafes/${encodeURIComponent(cafeId)}/members`); }
  lookupUser(phone: string) { return this.request<MarketplaceUser>("/marketplace/owner/users/lookup", "POST", { phone }); }
  createCafe(name: string, slug: string) {
    return this.request<components["schemas"]["MarketplaceCafeResponseDto"]>("/marketplace/owner/cafes", "POST", { name, slug });
  }
  dispatchOrders() { return this.request<DispatchOrder[]>("/marketplace/owner/dispatch/orders"); }
  dispatchCouriers() { return this.request<DispatchCourier[]>("/marketplace/owner/dispatch/couriers"); }
  assignCourier(orderId: string, courierId: string, version: number) {
    return this.request<components["schemas"]["OrderResponseDto"]>(`/marketplace/owner/dispatch/orders/${encodeURIComponent(orderId)}/courier`, "PATCH", { courierId, version });
  }
  setModule(cafeId: string, key: ModuleKey, enabled: boolean, expectedVersion: number) {
    return this.request<Module>(`/marketplace/owner/cafes/${encodeURIComponent(cafeId)}/modules/${key}`, "PUT", { enabled, expectedVersion });
  }
  grantMember(cafeId: string, userId: string, role: "ADMIN" | "OPERATOR" | "COOK" | "ACCOUNTANT" | "COURIER", expectedVersion: number, isActive = true) {
    return this.request<components["schemas"]["CafeMembershipResponseDto"]>(`/marketplace/owner/cafes/${encodeURIComponent(cafeId)}/members`, "PUT", { userId, role, expectedVersion, isActive });
  }
}

export const api = new ApiClient();
