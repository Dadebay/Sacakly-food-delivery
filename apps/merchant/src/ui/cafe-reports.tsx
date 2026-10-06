import { useState, type FormEvent } from "react";
import { api, type CafeOrdersReport } from "../api/client";

function reportDate(daysAgo = 0) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ashgabat", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

export function CafeReports({ cafeId }: { cafeId: string }) {
  const [from, setFrom] = useState(() => reportDate(6));
  const [to, setTo] = useState(() => reportDate());
  const [report, setReport] = useState<CafeOrdersReport | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function load(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    try { setReport(await api.cafeOrdersReport(cafeId, from, to)); }
    catch (reason) { setReport(null); setError(reason instanceof Error ? reason.message : "Не удалось загрузить отчёт"); }
    finally { setPending(false); }
  }
  return <div className="panel cafe-report" data-testid="merchant-cafe-report"><div className="panel-heading"><h3>Отчёт кафе</h3><span>Только заказы выбранного кафе</span></div>
    <form data-testid="cafe-report-form" onSubmit={load} className="report-period"><label>С<input type="date" data-testid="cafe-report-from" required value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>По<input type="date" data-testid="cafe-report-to" required value={to} onChange={(event) => setTo(event.target.value)} /></label><button className="mini-primary" data-testid="cafe-report-submit" disabled={pending}>Показать</button></form>
    {error && <p className="notice error" role="alert">{error}</p>}
    {report && <><p data-testid="cafe-report-period">Период: {report.from} — {report.to} · Ашхабад</p><div className="report-cards"><div><span>Заказов</span><strong>{report.orders}</strong></div><div><span>Отменено</span><strong>{report.cancelled}</strong></div><div><span>Сумма заказов</span><strong>{report.orderValue} TMT</strong></div><div><span>Наличные сданы</span><strong>{report.cashCollected} TMT</strong></div><div><span>Доставлено, деньги ожидаются</span><strong>{report.deliveredAwaitingCash} TMT</strong></div></div><h4>По филиалам</h4><div className="report-branches">{report.branches.map((branch, index) => <div key={`${branch.branchId ?? "none"}-${index}`}><span>{branch.branchName || "Без филиала"}</span><span>{branch.orders} заказов</span><strong>{branch.cashCollected} TMT сдано</strong></div>)}</div><p className="report-note">Период определяется датой создания заказа в часовом поясе Ашхабада. Сумма заказов исключает отмены; «наличные сданы» показывает текущий статус этих заказов. Это операционный отчёт, не бухгалтерская выплата кафе.</p></>}
  </div>;
}
