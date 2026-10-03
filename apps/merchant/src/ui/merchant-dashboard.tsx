import { useEffect, useState } from "react";
import { api, type MemberCafe, type MerchantOrder } from "../api/client";

const statusLabels: Record<MerchantOrder["status"], string> = {
  COOKING: "Готовится",
  READY: "Готов",
  ASSIGNED_TO_COURIER: "Курьер назначен",
  OUT_FOR_DELIVERY: "В пути",
  DELIVERED: "Доставлен",
  CASH_RETURNED: "Наличные сданы",
  RECONCILED: "Сверен",
  CANCELLED: "Отменён",
};

export function MerchantDashboard({ cafes }: { cafes: MemberCafe[] }) {
  const [cafeId, setCafeId] = useState(cafes[0]?.cafeId ?? "");
  const [orders, setOrders] = useState<MerchantOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!cafeId) return;
    let active = true;
    setLoading(true);
    setError("");
    api.orders(cafeId).then((data) => { if (active) setOrders(data); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Не удалось загрузить заказы"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [cafeId, revision]);

  const selected = cafes.find((cafe) => cafe.cafeId === cafeId);
  return <section className="dashboard" data-testid="merchant-dashboard-root">
    <div className="section-intro"><div><p className="eyebrow">Кабинет кафе</p><h2>{selected?.cafe.name ?? "Моё кафе"}</h2><p>Заказы и доступ показаны только для выбранного кафе.</p></div>
      <button className="outline-button" onClick={() => setRevision((value) => value + 1)} disabled={loading} data-testid="merchant-refresh-orders">Обновить заказы ↻</button>
    </div>
    {cafes.length > 1 && <div className="cafe-switcher" role="group" aria-label="Выбрать кафе">{cafes.map((cafe) => <button key={cafe.cafeId} className={cafe.cafeId === cafeId ? "selected" : ""} onClick={() => setCafeId(cafe.cafeId)} data-testid={`merchant-cafe-${cafe.cafeId}`}>{cafe.cafe.name}</button>)}</div>}
    <div className="stat-row"><div><span>Текущие заказы</span><strong>{orders.filter((order) => !["RECONCILED", "CANCELLED"].includes(order.status)).length}</strong></div><div><span>Всего в списке</span><strong>{orders.length}</strong></div><div><span>Доступ</span><strong className="stat-role">{selected?.role}</strong></div></div>
    <div className="panel"><div className="panel-heading"><h3>Лента заказов</h3><span>Последние 100</span></div>
      {loading ? <p className="panel-message" role="status">Загружаем заказы…</p> : error ? <p className="panel-message error" role="alert">{error}</p> : orders.length === 0 ? <p className="panel-message">Пока нет заказов. Новые заказы появятся здесь.</p> : <div className="order-list">{orders.map((order) => <article className="order-row" key={order.id} data-testid={`merchant-order-${order.id}`}><div><strong>Заказ №{order.number}</strong><small>{new Date(order.createdAt).toLocaleString("ru-RU")}</small></div><span className={`status-pill status-${order.status.toLowerCase()}`}>{statusLabels[order.status]}</span><strong>{Number(order.total).toFixed(2)} TMT</strong></article>)}</div>}
    </div>
  </section>;
}
