import { useEffect, useState } from "react";
import { api, type MemberCafe, type MerchantOrder, type OwnCourier } from "../api/client";
import { CatalogManager } from "./catalog-manager";

const statusLabels: Record<MerchantOrder["status"], string> = {
  COOKING: "Готовится", READY: "Готов", ASSIGNED_TO_COURIER: "Курьер назначен",
  OUT_FOR_DELIVERY: "В пути", DELIVERED: "Доставлен", CASH_RETURNED: "Наличные сданы",
  RECONCILED: "Сверен", CANCELLED: "Отменён",
};
const deliveryLabels = { WAITING: "Ожидает времени рассылки", OFFERED: "Предложен внешним курьерам", CLAIMED: "Курьер принял", ASSIGNED: "Курьер назначен", CANCELLED: "Отменён" };

export function MerchantDashboard({ cafes }: { cafes: MemberCafe[] }) {
  const [cafeId, setCafeId] = useState(cafes[0]?.cafeId ?? "");
  const [orders, setOrders] = useState<MerchantOrder[]>([]);
  const [couriers, setCouriers] = useState<OwnCourier[]>([]);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const [section, setSection] = useState<"orders" | "catalog">("orders");
  const selected = cafes.find((cafe) => cafe.cafeId === cafeId);
  const manager = selected?.role === "ADMIN" || selected?.role === "OPERATOR";

  useEffect(() => {
    if (!cafeId) return;
    let active = true; setLoading(true); setError("");
    Promise.all([api.orders(cafeId), manager ? api.ownCouriers(cafeId) : Promise.resolve([])]).then(([data, own]) => { if (active) { setOrders(data); setCouriers(own); } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Не удалось загрузить заказы"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [cafeId, revision, manager]);

  async function choose(order: MerchantOrder, mode: "OWN" | "NETWORK") {
    const courierId = selection[order.id] || couriers[0]?.id;
    if (mode === "OWN" && !courierId) { setError("Подключите курьера кафе через OWNER"); return; }
    setPending(order.id); setError(""); setMessage("");
    try { await api.chooseDelivery(cafeId, order.id, mode, order.version, courierId); setMessage(mode === "OWN" ? "Свой курьер закреплён" : "Запрос внешним курьерам запланирован"); setRevision((value) => value + 1); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось выбрать доставку"); }
    finally { setPending(""); }
  }
  async function ready(order: MerchantOrder) {
    const checked = checks[order.id] || [];
    if (checked.length !== order.items.length) { setError("Отметьте каждое блюдо перед подтверждением готовности"); return; }
    setPending(order.id); setError(""); setMessage("");
    try { await api.readyOrder(cafeId, order.id, order.version, checked, order.gifts.map((gift) => gift.id)); setMessage("Заказ готов. Закреплённый курьер получил заказ."); setRevision((value) => value + 1); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось подтвердить готовность"); }
    finally { setPending(""); }
  }
  function toggleCheck(orderId: string, itemId: string) { setChecks((before) => { const current = before[orderId] || []; return { ...before, [orderId]: current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId] }; }); }

  return <section className="dashboard" data-testid="merchant-dashboard-root">
    <div className="section-intro"><div><p className="eyebrow">Кабинет кафе</p><h2>{selected?.cafe.name ?? "Моё кафе"}</h2><p>Заказы и доступ показаны только для выбранного кафе.</p></div><button className="outline-button" onClick={() => setRevision((value) => value + 1)} disabled={loading} data-testid="merchant-refresh-orders">Обновить заказы ↻</button></div>
    {cafes.length > 1 && <div className="cafe-switcher" role="group" aria-label="Выбрать кафе">{cafes.map((cafe) => <button key={cafe.cafeId} className={cafe.cafeId === cafeId ? "selected" : ""} onClick={() => setCafeId(cafe.cafeId)} data-testid={`merchant-cafe-${cafe.cafeId}`}>{cafe.cafe.name}</button>)}</div>}
    {error && <p className="notice error" role="alert">{error}</p>}{message && <p className="notice success" role="status">{message}</p>}
    <div className="stat-row"><div><span>Текущие заказы</span><strong>{orders.filter((order) => !["RECONCILED", "CANCELLED"].includes(order.status)).length}</strong></div><div><span>Всего в списке</span><strong>{orders.length}</strong></div><div><span>Доступ</span><strong className="stat-role">{selected?.role}</strong></div></div>
    {manager && <nav className="section-tabs" aria-label="Разделы кафе"><button className={section === "orders" ? "selected" : ""} onClick={() => setSection("orders")}>Заказы</button><button className={section === "catalog" ? "selected" : ""} onClick={() => setSection("catalog")}>Меню и филиалы</button></nav>}
    {section === "catalog" && manager ? <CatalogManager key={cafeId} cafeId={cafeId} /> : <div className="panel"><div className="panel-heading"><h3>Лента заказов</h3><span>Последние 100</span></div>
      {loading ? <p className="panel-message" role="status">Загружаем заказы…</p> : error ? <p className="panel-message error" role="alert">{error}</p> : orders.length === 0 ? <p className="panel-message">Пока нет заказов. Новые заказы появятся здесь.</p> : <div className="order-list">{orders.map((order) => <article className="merchant-order" key={order.id} data-testid={`merchant-order-${order.id}`}><div className="order-row"><div><strong>Заказ №{order.number}</strong><small>{new Date(order.createdAt).toLocaleString("ru-RU")}</small></div><span className={`status-pill status-${order.status.toLowerCase()}`}>{statusLabels[order.status]}</span><strong>{Number(order.total).toFixed(2)} TMT</strong></div>{manager && (order.status === "COOKING" || order.status === "READY") && <div className="delivery-actions"><div className="delivery-summary"><strong>Доставка</strong><span>{order.deliveryRequest ? `${order.deliveryRequest.mode === "OWN" ? "Свой курьер" : "Общая сеть"} · ${deliveryLabels[order.deliveryRequest.status]}` : "Не выбрана"}</span>{order.deliveryRequest?.mode === "NETWORK" && <small>Запрос откроется {new Date(order.deliveryRequest.offerAt).toLocaleString("ru-RU")}</small>}</div><div className="delivery-controls">{couriers.length > 0 && <select value={selection[order.id] || couriers[0]?.id || ""} onChange={(event) => setSelection((before) => ({ ...before, [order.id]: event.target.value }))} aria-label={`Свой курьер для заказа №${order.number}`}>{couriers.map((courier) => <option key={courier.id} value={courier.id}>{[courier.firstName, courier.lastName].filter(Boolean).join(" ") || courier.phone}</option>)}</select>}<button disabled={Boolean(pending) || couriers.length === 0 || order.deliveryRequest?.status === "CLAIMED"} onClick={() => choose(order, "OWN")}>Назначить своего курьера</button><button disabled={Boolean(pending) || order.deliveryRequest?.status === "CLAIMED"} onClick={() => choose(order, "NETWORK")}>Отправить во внешнюю сеть</button></div>{order.status === "COOKING" && <div className="packing-checks"><p>Проверьте блюда перед готовностью:</p>{order.items.map((item) => <label key={item.id}><input type="checkbox" checked={(checks[order.id] || []).includes(item.id)} onChange={() => toggleCheck(order.id, item.id)} /> {item.quantity} × {item.productName}</label>)}<button className="mini-primary" disabled={Boolean(pending) || !order.items.length} onClick={() => ready(order)}>Заказ готов</button></div>}</div>}</article>)}</div>}
    </div>}
  </section>;
}
