import type { components } from "@sacakly/api-contract";
export type Cafe = components["schemas"]["MarketplaceCafeResponseDto"];
export type Category = components["schemas"]["CatalogCategoryResponseDto"];
export type Product = components["schemas"]["CatalogProductResponseDto"];
export type Session = components["schemas"]["AuthSessionResponseDto"];
export type Quote = components["schemas"]["OrderQuoteResponseDto"];
export type Order = components["schemas"]["OrderResponseDto"];
export type SitePage = components["schemas"]["SitePageResponseDto"];
export type SitePageSummary = components["schemas"]["SitePageSummaryDto"];
export type ExternalOffer = components["schemas"]["ExternalDeliveryOfferResponseDto"];
export type OrderItem = { productId: string; variantId?: string; quantity: number };

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
const SESSION_KEY = "sacakly.web.session";
function origin() { return typeof window === "undefined" ? (process.env.API_INTERNAL_URL || "http://127.0.0.1:4000") : ""; }
async function send<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${origin()}/api/v1${path}`, { ...init, headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers }, cache: "no-store" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { message?: string | string[] };
    throw new ApiError(response.status, Array.isArray(payload.message) ? payload.message.join("; ") : payload.message || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}
export const publicApi = {
  cafes: (cuisine?: Cafe["cuisines"][number]) => send<Cafe[]>(`/marketplace/cafes${cuisine ? `?cuisine=${encodeURIComponent(cuisine)}` : ""}`),
  categories: (cafeId: string) => send<Category[]>(`/catalog/categories?cafeId=${encodeURIComponent(cafeId)}`),
  pages: () => send<SitePageSummary[]>("/site/pages"),
  page: (locale: string, slug: string) => send<SitePage>(`/site/pages/${encodeURIComponent(locale)}/${encodeURIComponent(slug)}`),
};
export class CustomerApi {
  private session: Session | null = null;
  private refreshing: Promise<void> | null = null;
  constructor() { if (typeof window !== "undefined") { try { this.session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null") as Session | null; } catch { /* expired local state */ } } }
  getSession() { return this.session; }
  private save(session: Session | null) { this.session = session; if (typeof window !== "undefined") { if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); else sessionStorage.removeItem(SESSION_KEY); window.dispatchEvent(new Event("session-change")); } }
  async request<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
    try { return await send<T>(path, init, authenticated ? this.session?.accessToken : undefined); }
    catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401 || !authenticated || !this.session) throw error;
      if (!this.refreshing) this.refreshing = send<Session>("/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken: this.session.refreshToken }) }).then((session) => this.save(session)).catch((reason: unknown) => { this.save(null); throw reason; }).finally(() => { this.refreshing = null; });
      await this.refreshing;
      return send<T>(path, init, this.session?.accessToken);
    }
  }
  requestOtp(phone: string) { return this.request("/auth/otp/request", { method: "POST", body: JSON.stringify({ phone }) }, false); }
  async verifyOtp(phone: string, code: string) { const session = await this.request<Session>("/auth/otp/verify", { method: "POST", body: JSON.stringify({ phone, code }) }, false); this.save(session); return session; }
  quote(cafeId: string, items: OrderItem[], latitude?: number, longitude?: number) { return this.request<Quote>("/marketplace/checkout/quote", { method: "POST", body: JSON.stringify({ cafeId, items, latitude, longitude }) }); }
  order(input: { cafeId: string; items: OrderItem[]; address: string; latitude: number; longitude: number; idempotencyKey: string }) { return this.request<Order>("/marketplace/checkout/orders", { method: "POST", body: JSON.stringify(input) }); }
  applyCourier() { return this.request("/marketplace/courier-applications", { method: "POST" }); }
  offers() { return this.request<ExternalOffer[]>("/marketplace/delivery/courier/offers"); }
  claim(orderId: string) { return this.request(`/marketplace/delivery/courier/offers/${encodeURIComponent(orderId)}/claim`, { method: "POST" }); }
}
export const customerApi = new CustomerApi();
