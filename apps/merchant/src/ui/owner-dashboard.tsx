import { useEffect, useState, type FormEvent } from "react";
import { PageManager } from "./page-manager";
import { api, type Cafe, type CafeMember, type CourierApplication, type DispatchCourier, type DispatchOrder, type Module, type ModuleKey } from "../api/client";

const moduleLabels: Record<ModuleKey, string> = {
  CATALOG: "Каталог", ORDERING: "Заказы", KITCHEN: "Кухня", DELIVERY: "Доставка",
  RECEIPTS: "Чеки", INVENTORY: "Склад", LOYALTY: "Лояльность", ACCOUNTING: "Бухгалтерия",
};
const moduleKeys = Object.keys(moduleLabels) as ModuleKey[];

export function OwnerDashboard() {
  const [cafes, setCafes] = useState<Cafe[]>([]);
  const [selectedCafeId, setSelectedCafeId] = useState("");
  const [modules, setModules] = useState<Module[]>([]);
  const [members, setMembers] = useState<CafeMember[]>([]);
  const [applications, setApplications] = useState<CourierApplication[]>([]);
  const [dispatchOrders, setDispatchOrders] = useState<DispatchOrder[]>([]);
  const [dispatchCouriers, setDispatchCouriers] = useState<DispatchCourier[]>([]);
  const [courierSelection, setCourierSelection] = useState<Record<string, string>>({});
  const [memberPhone, setMemberPhone] = useState("");
  const [memberRole, setMemberRole] = useState<"ADMIN" | "OPERATOR" | "COOK" | "ACCOUNTANT" | "COURIER">("ADMIN");
  const [newCafeName, setNewCafeName] = useState("");
  const [newCafeSlug, setNewCafeSlug] = useState("");
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([api.cafes(), api.pendingCouriers(), api.dispatchOrders(), api.dispatchCouriers()]).then(([loadedCafes, loadedApplications, loadedOrders, loadedCouriers]) => {
      if (!active) return;
      setCafes(loadedCafes);
      setApplications(loadedApplications);
      setDispatchOrders(loadedOrders);
      setDispatchCouriers(loadedCouriers);
      setSelectedCafeId((current) => current || loadedCafes[0]?.id || "");
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Не удалось загрузить платформу"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedCafeId) return;
    let active = true;
    Promise.all([api.modules(selectedCafeId), api.members(selectedCafeId)]).then(([loadedModules, loadedMembers]) => {
      if (active) { setModules(loadedModules); setMembers(loadedMembers); }
    })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Не удалось загрузить модули"); });
    return () => { active = false; };
  }, [selectedCafeId]);

  async function toggleModule(key: ModuleKey) {
    const current = modules.find((entry) => entry.key === key);
    setPending(key); setError(""); setSuccess("");
    try {
      const updated = await api.setModule(selectedCafeId, key, !current?.enabled, current?.version ?? 0);
      setModules((before) => [...before.filter((entry) => entry.key !== key), updated]);
      setSuccess(`${moduleLabels[key]}: настройки сохранены`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось изменить модуль"); }
    finally { setPending(""); }
  }

  async function review(application: CourierApplication, decision: "APPROVED" | "REJECTED") {
    setPending(application.userId); setError(""); setSuccess("");
    try {
      await api.reviewCourier(application.userId, decision);
      setApplications((before) => before.filter((entry) => entry.userId !== application.userId));
      if (decision === "APPROVED") setDispatchCouriers(await api.dispatchCouriers());
      setSuccess(decision === "APPROVED" ? "Курьер одобрен" : "Заявка отклонена");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось обработать заявку"); }
    finally { setPending(""); }
  }

  async function assignCourier(order: DispatchOrder) {
    const courierId = courierSelection[order.id] || dispatchCouriers[0]?.id;
    if (!courierId) { setError("Сначала одобрите курьера"); return; }
    setPending(order.id); setError(""); setSuccess("");
    try {
      await api.assignCourier(order.id, courierId, order.version);
      setDispatchOrders(await api.dispatchOrders());
      setSuccess(`Курьер назначен заказу №${order.number}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось назначить курьера"); }
    finally { setPending(""); }
  }

  async function grantMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("member"); setError(""); setSuccess("");
    try {
      const user = await api.lookupUser(memberPhone.trim());
      const previous = members.find((entry) => entry.userId === user.id);
      const updated = await api.grantMember(selectedCafeId, user.id, memberRole, previous?.version ?? 0);
      setMembers((before) => [...before.filter((entry) => entry.userId !== user.id), { ...updated, user }]);
      setMemberPhone("");
      setSuccess("Сотрудник подключён к выбранному кафе");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось подключить сотрудника"); }
    finally { setPending(""); }
  }

  async function changeMember(member: CafeMember, isActive: boolean) {
    setPending(member.userId); setError(""); setSuccess("");
    try {
      const updated = await api.grantMember(selectedCafeId, member.userId, member.role as typeof memberRole, member.version, isActive);
      setMembers((before) => before.map((entry) => entry.userId === member.userId ? { ...entry, ...updated } : entry));
      setSuccess(isActive ? "Доступ восстановлен" : "Доступ отключён");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось изменить доступ"); }
    finally { setPending(""); }
  }

  async function createCafe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("cafe"); setError(""); setSuccess("");
    try {
      const created = await api.createCafe(newCafeName.trim(), newCafeSlug.trim());
      const loaded = await api.cafes();
      setCafes(loaded);
      setSelectedCafeId(created.id);
      setNewCafeName(""); setNewCafeSlug("");
      setSuccess("Кафе создано. Включите нужные модули и назначьте сотрудника.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось создать кафе"); }
    finally { setPending(""); }
  }

  return <section className="dashboard" data-testid="owner-dashboard-root">
    <div className="section-intro"><div><p className="eyebrow">Управление платформой</p><h2>Центр Saçakly</h2><p>Подключайте кафе, настраивайте модули и проверяйте будущих курьеров.</p></div><span className="owner-chip">OWNER</span></div>
    {error && <p className="notice error" role="alert">{error}</p>}{success && <p className="notice success" role="status">{success}</p>}
    <div className="owner-grid">
      <div className="panel member-panel"><div className="panel-heading"><h3>Новое кафе</h3><span>Отдельный контур заказов</span></div><form onSubmit={createCafe} className="member-form" data-testid="owner-create-cafe-form"><label>Название<input required minLength={2} maxLength={120} value={newCafeName} onChange={(event) => setNewCafeName(event.target.value)} placeholder="Название кафе" data-testid="owner-new-cafe-name" /></label><label>Адрес в каталоге<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={140} value={newCafeSlug} onChange={(event) => setNewCafeSlug(event.target.value.toLowerCase())} placeholder="cafe-name" data-testid="owner-new-cafe-slug" /></label><button className="primary-button" disabled={Boolean(pending)} data-testid="owner-create-cafe">Создать кафе</button></form></div>
      <div className="panel"><div className="panel-heading"><h3>Кафе и модули</h3><span>{cafes.length} подключено</span></div>
        {cafes.length === 0 ? <p className="panel-message">Активных кафе пока нет. Создайте первое кафе выше.</p> : <>
          <label className="select-label">Выбранное кафе<select value={selectedCafeId} onChange={(event) => setSelectedCafeId(event.target.value)} data-testid="owner-cafe-select">{cafes.map((cafe) => <option key={cafe.id} value={cafe.id}>{cafe.name}</option>)}</select></label>
          <div className="module-list">{moduleKeys.map((key) => { const active = modules.find((entry) => entry.key === key)?.enabled ?? false; const available = key === "ORDERING"; return <div className="module-row" key={key}><span>{moduleLabels[key]} {!available && <small>скоро</small>}</span><button className={active ? "toggle active" : "toggle"} aria-label={`${moduleLabels[key]}: ${active ? "выключить" : available ? "включить" : "пока недоступно"}`} aria-pressed={active} disabled={Boolean(pending) || (!available && !active)} onClick={() => toggleModule(key)} data-testid={`owner-module-${key.toLowerCase()}`}><span /></button></div>; })}</div>
        </>}
      </div>
      <div className="panel"><div className="panel-heading"><h3>Заявки курьеров</h3><span>{applications.length} ожидают</span></div>
        {applications.length === 0 ? <p className="panel-message">Новых заявок нет.</p> : <div className="application-list">{applications.map((entry) => <article key={entry.userId} className="application-row" data-testid={`owner-application-${entry.userId}`}><div><strong>{[entry.user.firstName, entry.user.lastName].filter(Boolean).join(" ") || "Новый курьер"}</strong><small>{entry.user.phone}</small></div><div className="application-actions"><button disabled={Boolean(pending)} onClick={() => review(entry, "REJECTED")} data-testid={`owner-reject-${entry.userId}`}>Отклонить</button><button className="mini-primary" disabled={Boolean(pending)} onClick={() => review(entry, "APPROVED")} data-testid={`owner-approve-${entry.userId}`}>Одобрить</button></div></article>)}</div>}
      </div>
      <div className="panel member-panel"><div className="panel-heading"><h3>Общая доставка</h3><span>{dispatchOrders.length} заказов к назначению</span></div>
        {dispatchOrders.length === 0 ? <p className="panel-message">Готовых заказов сейчас нет.</p> : <div className="application-list" data-testid="owner-dispatch-list">{dispatchOrders.map((order) => <div className="application-row" key={order.id} data-testid={`owner-dispatch-${order.id}`}><div><strong>№{order.number} · {order.cafe.name}</strong><small>{order.address} · {order.status === "READY" ? "Готов" : "Курьер назначен"}</small></div><div className="dispatch-controls"><select aria-label={`Курьер для заказа №${order.number}`} value={courierSelection[order.id] || dispatchCouriers[0]?.id || ""} onChange={(event) => setCourierSelection((before) => ({ ...before, [order.id]: event.target.value }))} disabled={Boolean(pending) || dispatchCouriers.length === 0} data-testid={`owner-dispatch-courier-${order.id}`}>{dispatchCouriers.length === 0 ? <option value="">Нет курьеров</option> : dispatchCouriers.map((courier) => <option key={courier.id} value={courier.id}>{[courier.firstName, courier.lastName].filter(Boolean).join(" ") || courier.phone}</option>)}</select><button className="mini-primary" disabled={Boolean(pending) || dispatchCouriers.length === 0} onClick={() => assignCourier(order)} data-testid={`owner-dispatch-assign-${order.id}`}>Назначить</button></div></div>)}</div>}
      </div>
      <div className="panel member-panel"><div className="panel-heading"><h3>Доступ сотрудников</h3><span>Только выбранное кафе</span></div><p>Сотрудник сначала входит в систему по SMS. Затем подключите его номер к этому кафе.</p><form onSubmit={grantMember} className="member-form" data-testid="owner-member-form"><label>Номер телефона<input type="tel" required placeholder="+993 6X XX XX XX" value={memberPhone} onChange={(event) => setMemberPhone(event.target.value)} data-testid="owner-member-phone" /></label><label>Роль в кафе<select value={memberRole} onChange={(event) => setMemberRole(event.target.value as typeof memberRole)} data-testid="owner-member-role"><option value="ADMIN">Менеджер</option><option value="OPERATOR">Оператор</option><option value="COOK">Кухня</option><option value="ACCOUNTANT">Бухгалтер</option><option value="COURIER">Курьер кафе</option></select></label><button className="primary-button" disabled={Boolean(pending) || !selectedCafeId} data-testid="owner-grant-member">Подключить</button></form>
        {members.length > 0 && <div className="member-list" data-testid="owner-member-list">{members.map((member) => <div className="application-row" key={member.userId}><div><strong>{member.user.firstName || member.user.phone}</strong><small>{member.user.phone} · {member.role} · {member.isActive ? "активен" : "отключён"}</small></div><div className="application-actions"><button type="button" disabled={Boolean(pending)} onClick={() => changeMember(member, !member.isActive)} data-testid={`owner-member-toggle-${member.userId}`}>{member.isActive ? "Отключить" : "Восстановить"}</button></div></div>)}</div>}
      </div>
    </div>
    <PageManager />
  </section>;
}
