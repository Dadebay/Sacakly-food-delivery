import { useEffect, useState, type FormEvent } from "react";
import { api, type CafeCatalog, type CafeReceiptConfig, type CafeReceiptPrinter, type CafeReceiptQueue } from "../api/client";

export function ReceiptManager({ cafeId, role }: { cafeId: string; role: "ADMIN" | "OPERATOR" }) {
  const [config, setConfig] = useState<CafeReceiptConfig | null>(null);
  const [printers, setPrinters] = useState<CafeReceiptPrinter[]>([]);
  const [queue, setQueue] = useState<CafeReceiptQueue | null>(null);
  const [catalog, setCatalog] = useState<CafeCatalog | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const [port, setPort] = useState("9100");
  const [transport, setTransport] = useState<"RAW_TCP" | "JSPEED_HTTP">("RAW_TCP");
  const [mainPrinterId, setMainPrinterId] = useState("");
  const [mainCopies, setMainCopies] = useState("1");
  const [businessPhone, setBusinessPhone] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([api.cafeReceiptConfig(cafeId), api.cafeReceiptPrinters(cafeId), api.cafeReceiptQueue(cafeId), api.cafeCatalog(cafeId)])
      .then(([nextConfig, nextPrinters, nextQueue, nextCatalog]) => {
        if (!active) return;
        setConfig(nextConfig); setPrinters(nextPrinters); setQueue(nextQueue); setCatalog(nextCatalog);
        setMainPrinterId(nextConfig.mainPrinterId ?? ""); setMainCopies(String(nextConfig.mainCopies)); setBusinessPhone(nextConfig.businessPhone ?? "");
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Не удалось загрузить печать"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [cafeId, revision]);

  async function mutate(action: () => Promise<unknown>, success: string) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); setMessage(success); setRevision((value) => value + 1); return true; }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось сохранить"); return false; }
    finally { setBusy(false); }
  }

  async function addPrinter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await mutate(() => api.createCafeReceiptPrinter(cafeId, { name, ipAddress, port: Number(port), transport }), "Принтер добавлен")) { setName(""); setIpAddress(""); }
  }
  async function saveConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!config || !mainPrinterId) return;
    await mutate(() => api.setCafeReceiptConfig(cafeId, { mainPrinterId, mainCopies: Number(mainCopies), businessPhone: businessPhone || undefined, expectedVersion: config.version }), "Настройки чеков сохранены");
  }
  async function rotateToken() {
    if (!config) return;
    setBusy(true); setError(""); setToken("");
    try { const result = await api.rotateCafeReceiptToken(cafeId, config.version); setToken(result.token); setMessage("Новый ключ показан только сейчас. Скопируйте его в программу печати кафе."); setRevision((value) => value + 1); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось создать ключ"); }
    finally { setBusy(false); }
  }
  const available = printers.filter((printer) => printer.isActive);
  const printerOptions = (emptyLabel: string) => <><option value="">{emptyLabel}</option>{available.map((printer) => <option key={printer.id} value={printer.id}>{printer.name} · {printer.ipAddress}</option>)}</>;

  return <div className="receipt-manager" data-testid="merchant-receipts-root">
    <div className="catalog-heading"><div><h3>Чеки кафе</h3><p>Принтеры, агент и очередь относятся только к выбранному кафе. OWNER включает модуль после настройки.</p></div><button className="outline-button" onClick={() => setRevision((value) => value + 1)} disabled={busy || loading}>Обновить</button></div>
    {error && <p className="notice error" role="alert">{error}</p>}{message && <p className="notice success" role="status">{message}</p>}
    {loading && <p role="status">Загружаем печать…</p>}
    {config && <div className="catalog-grid">
      {role === "ADMIN" && <section className="panel"><h3>Принтеры</h3><form className="catalog-form" onSubmit={addPrinter}>
        <label>Название<input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <div className="catalog-two"><label>Локальный IP<input required placeholder="192.168.1.10" value={ipAddress} onChange={(event) => setIpAddress(event.target.value)} /></label><label>Порт<input required type="number" min="1" max="65535" value={port} onChange={(event) => setPort(event.target.value)} /></label></div>
        <label>Подключение<select value={transport} onChange={(event) => setTransport(event.target.value as typeof transport)}><option value="RAW_TCP">RAW TCP</option><option value="JSPEED_HTTP">JSPEED HTTP</option></select></label>
        <button disabled={busy}>Добавить принтер</button></form><div className="catalog-list">{printers.map((printer) => <div className="catalog-row" key={printer.id}><strong>{printer.name}</strong><small>{printer.ipAddress}:{printer.port} · {printer.transport}{printer.isActive ? "" : " · отключён"}</small></div>)}</div>
      </section>}
      {role === "ADMIN" && <section className="panel"><h3>Главный чек и агент</h3><form className="catalog-form" onSubmit={saveConfig}>
        <label>Главный принтер<select required value={mainPrinterId} onChange={(event) => setMainPrinterId(event.target.value)}><option value="">Выберите принтер</option>{available.map((printer) => <option key={printer.id} value={printer.id}>{printer.name} · {printer.ipAddress}</option>)}</select></label>
        <div className="catalog-two"><label>Копии<input required type="number" min="1" max="3" value={mainCopies} onChange={(event) => setMainCopies(event.target.value)} /></label><label>Телефон кафе<input value={businessPhone} onChange={(event) => setBusinessPhone(event.target.value)} placeholder="+993…" /></label></div>
        <button disabled={busy || !available.length}>Сохранить</button></form>
        <p>Ключ агента: {config.agentConfigured ? "настроен" : "не создан"}</p><button className="outline-button" disabled={busy || !config.mainPrinterId} onClick={rotateToken}>Создать новый ключ агента</button>
        {token && <p className="receipt-token"><strong>Скопируйте сейчас:</strong> <code>{token}</code></p>}
        <p className="receipt-help">Запустите программу печати с <code>-api-scope marketplace</code> и переменной <code>SACAKLY_RECEIPT_AGENT_TOKEN</code>. Старый ключ сразу перестанет работать.</p>
      </section>}
      {role === "ADMIN" && catalog && <section className="panel catalog-branches"><h3>Кухонные маршруты</h3><p>Маршрут блюда переопределяет категорию; без обоих маршрутов оно остаётся на главном чеке.</p><div className="receipt-route-list">{catalog.categories.map((category) => <div key={category.id}><label>{category.name}<select disabled={busy} value={category.receiptPrinterId ?? ""} onChange={(event) => void mutate(() => api.routeCafeCategoryPrinter(cafeId, category.id, event.target.value || null, category.version), "Маршрут категории сохранён")}>{printerOptions("Только главный чек")}</select></label>{category.products.map((product) => <label key={product.id}>{product.name}<select disabled={busy} value={product.receiptPrinterId ?? ""} onChange={(event) => void mutate(() => api.routeCafeProductPrinter(cafeId, product.id, event.target.value || null, product.version), "Маршрут блюда сохранён")}>{printerOptions("По категории")}</select></label>)}</div>)}</div></section>}
      <section className="panel catalog-branches"><div className="panel-heading"><h3>Очередь печати</h3><span>{queue?.pending ?? 0} в работе · {queue?.needsAttention ?? 0} требуют внимания</span></div><div className="catalog-list">{queue?.items.length ? queue.items.map((task) => <div className="catalog-row" key={task.id}><div><strong>Заказ №{task.orderNumber} · {task.documentType}</strong><small>{task.status} · попыток: {task.attempts}{task.lastError ? ` · ${task.lastError}` : ""}</small></div><div className="catalog-actions">{(task.status === "FAILED" || task.status === "PENDING") && <button disabled={busy} onClick={() => void mutate(() => api.retryCafeReceipt(cafeId, task.id), "Чек возвращён в очередь")}>Повторить</button>}{role === "ADMIN" && task.status === "PENDING" && <button disabled={busy} onClick={() => void mutate(() => api.cancelCafeReceipt(cafeId, task.id), "Ожидающий чек отменён")}>Отменить</button>}</div></div>) : <p>Очередь пуста.</p>}</div></section>
    </div>}
  </div>;
}
