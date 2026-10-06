import { RewardsManager } from "./rewards-manager";
import { useEffect, useRef, useState } from "react";
import { api, type MemberCafe, type MerchantOrder, type OwnCourier } from "../api/client";
import { CatalogManager } from "./catalog-manager";
import { ReceiptManager } from "./receipt-manager";
import { CafeSetup } from "./cafe-setup";
import { CafeReports } from "./cafe-reports";

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
  const reprintKeys = useRef<Record<string, string>>({});
  const [section, setSection] = useState<"orders" | "catalog" | "receipts" | "setup" | "reports" | "rewards">("orders");
  const selected = cafes.find((cafe) => cafe.cafeId === cafeId);
  const manager = selected?.role === "ADMIN" || selected?.role === "OPERATOR";
  const canReport = selected?.role === "ADMIN" || selected?.role === "ACCOUNTANT";

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
    if (![...order.items, ...order.gifts].every((item) => checked.includes(item.id))) { setError("Отметьте каждое блюдо и подарок перед подтверждением готовности"); return; }
    setPending(order.id); setError(""); setMessage("");
    try { await api.readyOrder(cafeId, order.id, order.version, order.items.filter((item) => checked.includes(item.id)).map((item) => item.id), order.gifts.filter((gift) => checked.includes(gift.id)).map((gift) => gift.id)); setMessage("Заказ готов. Закреплённый курьер получил заказ."); setRevision((value) => value + 1); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось подтвердить готовность"); }
    finally { setPending(""); }
  }
  async function reprint(order: MerchantOrder) {
    const key = reprintKeys.current[order.id] ?? crypto.randomUUID();
    reprintKeys.current[order.id] = key;
    setPending(order.id); setError(""); setMessage("");
    try { await api.reprintCafeReceipt(cafeId, order.id, key); delete reprintKeys.current[order.id]; setMessage(`Повторный чек заказа №${order.number} добавлен в очередь`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось создать повторный чек"); }
    finally { setPending(""); }
  }
  function toggleCheck(orderId: string, itemId: string) { setChecks((before) => { const current = before[orderId] || []; return { ...before, [orderId]: current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId] }; }); }

  return <section className="dashboard" data-testid="merchant-dashboard-root">
    <div className="section-intro"><div><p className="eyebrow">Кабинет кафе</p><h2>{selected?.cafe.name ?? "Моё кафе"}</h2><p>Заказы и доступ показаны только для выбранного кафе.</p></div><button className="outline-button" onClick={() => setRevision((value) => value + 1)} disabled={loading} data-testid="merchant-refresh-orders">Обновить заказы ↻</button></div>
    {cafes.length > 1 && <div className="cafe-switcher" role="group" aria-label="Выбрать кафе">{cafes.map((cafe) => <button key={cafe.cafeId} className={cafe.cafeId === cafeId ? "selected" : ""} onClick={() => setCafeId(cafe.cafeId)} data-testid={`merchant-cafe-${cafe.cafeId}`}>{cafe.cafe.name}</button>)}</div>}
    {error && <p className="notice error" role="alert">{error}</p>}{message && <p className="notice success" role="status">{message}</p>}
    <div className="stat-row"><div><span>Текущие заказы</span><strong>{orders.filter((order) => !["RECONCILED", "CANCELLED"].includes(order.status)).length}</strong></div><div><span>Всего в списке</span><strong>{orders.length}</strong></div><div><span>Доступ</span><strong className="stat-role">{selected?.role}</strong></div></div>
    {(manager || canReport) && <nav className="section-tabs" aria-label="Разделы кафе"><button className={section === "orders" ? "selected" : ""} data-testid="merchant-tab-orders" onClick={() => setSection("orders")}>Заказы</button><button className={section === "setup" ? "selected" : ""} data-testid="merchant-tab-setup" onClick={() => setSection("setup")}>Настройка</button>{manager && <><button className={section === "catalog" ? "selected" : ""} data-testid="merchant-tab-catalog" onClick={() => setSection("catalog")}>Меню и филиалы</button><button className={section === "receipts" ? "selected" : ""} data-testid="merchant-tab-receipts" onClick={() => setSection("receipts")}>Чеки</button></>}{selected?.role === "ADMIN" && <button className={section === "rewards" ? "selected" : ""} data-testid="merchant-tab-rewards" onClick={() => setSection("rewards")}>Акции и баллы</button>}{canReport && <button className={section === "reports" ? "selected" : ""} data-testid="merchant-tab-reports" onClick={() => setSection("reports")}>Отчёты</button>}</nav>}
    {section === "rewards" && selected?.role === "ADMIN" ? <RewardsManager key={cafeId} cafeId={cafeId} /> : section === "setup" && (manager || canReport) ? <CafeSetup key={cafeId} cafeId={cafeId} canManage={manager} onNavigate={setSection} /> : section === "reports" && canReport ? <CafeReports key={cafeId} cafeId={cafeId} /> : section === "catalog" && manager ? <CatalogManager key={cafeId} cafeId={cafeId} /> : section === "receipts" && manager ? <ReceiptManager key={cafeId} cafeId={cafeId} role={selected!.role as "ADMIN" | "OPERATOR"} /> : <div className="panel"><div className="panel-heading"><h3>Лента заказов</h3><span>Последние 100</span></div>
      {loading ? <p className="panel-message" role="status">Загружаем заказы…</p> : orders.length === 0 ? <p className="panel-message">Пока нет заказов. Новые заказы появятся здесь.</p> : <div className="order-list">{orders.map((order) => <article className="merchant-order" key={order.id} data-testid={`merchant-order-${order.id}`}><div className="order-row"><div><strong>Заказ №{order.number}</strong><small>{new Date(order.createdAt).toLocaleString("ru-RU")}</small></div><span className={`status-pill status-${order.status.toLowerCase()}`}>{statusLabels[order.status]}</span><strong>{Number(order.total).toFixed(2)} TMT</strong></div>{Number(order.discount) > 0 && <p className="order-reward-note">Скидка: {Number(order.discount).toFixed(2)} TMT · {order.promotionLabel}</p>}{order.gifts.length > 0 && <p className="order-reward-note">Подарки: {order.gifts.map((gift) => `${gift.quantity} × ${gift.name}`).join(", ")} · {order.loyaltyPointsSpent} баллов</p>}{selected?.role === "ADMIN" && <button className="outline-button" disabled={Boolean(pending)} onClick={() => reprint(order)}>Повторить чек</button>}{manager && (order.status === "COOKING" || order.status === "READY") && <div className="delivery-actions"><div className="delivery-summary"><strong>Доставка</strong><span>{order.deliveryRequest ? `${order.deliveryRequest.mode === "OWN" ? "Свой курьер" : "Общая сеть"} · ${deliveryLabels[order.deliveryRequest.status]}` : "Не выбрана"}</span>{order.deliveryRequest?.mode === "NETWORK" && <small>Запрос откроется {new Date(order.deliveryRequest.offerAt).toLocaleString("ru-RU")}</small>}</div><div className="delivery-controls">{couriers.length > 0 && <select value={selection[order.id] || couriers[0]?.id || ""} onChange={(event) => setSelection((before) => ({ ...before, [order.id]: event.target.value }))} aria-label={`Свой курьер для заказа №${order.number}`}>{couriers.map((courier) => <option key={courier.id} value={courier.id}>{[courier.firstName, courier.lastName].filter(Boolean).join(" ") || courier.phone}</option>)}</select>}<button disabled={Boolean(pending) || couriers.length === 0 || order.deliveryRequest?.status === "CLAIMED"} onClick={() => choose(order, "OWN")}>Назначить своего курьера</button><button disabled={Boolean(pending) || order.deliveryRequest?.status === "CLAIMED"} onClick={() => choose(order, "NETWORK")}>Отправить во внешнюю сеть</button></div>{order.status === "COOKING" && <div className="packing-checks"><p>Проверьте блюда перед готовностью:</p>{order.items.map((item) => <label key={item.id}><input type="checkbox" checked={(checks[order.id] || []).includes(item.id)} onChange={() => toggleCheck(order.id, item.id)} /> {item.quantity} × {item.productName}</label>)}{order.gifts.map((gift) => <label key={gift.id}><input data-testid={`pack-gift-${gift.id}`} type="checkbox" disabled={Boolean(pending)} checked={(checks[order.id] || []).includes(gift.id)} onChange={() => toggleCheck(order.id, gift.id)} /> {gift.quantity} × {gift.name} · подарок</label>)}<button className="mini-primary" disabled={Boolean(pending) || !order.items.length} onClick={() => ready(order)}>Заказ готов</button></div>}</div>}</article>)}</div>}
    </div>}
  </section>;
}
