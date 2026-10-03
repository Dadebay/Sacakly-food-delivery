import { CourierMapPanel } from "@/src/widgets/courier-map";

export function DispatchMap() {
  return (
    <section className="admin-section" data-testid="dispatch-map-page">
      <header className="section-head" data-testid="dispatch-map-header">
        <div>
          <h1>Карта доставки</h1>
          <p>Курьеры на смене, их статус и маршруты.</p>
        </div>
      </header>
      <CourierMapPanel />
    </section>
  );
}
