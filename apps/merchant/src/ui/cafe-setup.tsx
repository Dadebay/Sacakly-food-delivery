import { useEffect, useState } from "react";
import { api, type CafeReadiness } from "../api/client";

export function CafeSetup({ cafeId, canManage, onNavigate }: { cafeId: string; canManage: boolean; onNavigate: (section: "catalog" | "receipts") => void }) {
  const [readiness, setReadiness] = useState<CafeReadiness | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    api.cafeReadiness(cafeId).then((value) => { if (active) { setReadiness(value); setError(""); } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Не удалось загрузить настройку"); });
    return () => { active = false; };
  }, [cafeId, revision]);
  return <div className="panel setup-panel" data-testid="merchant-cafe-setup"><div className="panel-heading"><h3>Подготовка кафе</h3><span>{readiness?.readyForOrdering ? "Готово к включению заказов" : "Заполните обязательные шаги"}</span></div>
    <p>OWNER создаёт кафе, назначает администратора и выбирает тип кухни. Администратор заполняет филиалы, меню и принтеры. После проверки OWNER включает приём заказов.</p>
    {error && <p className="notice error" role="alert">{error}</p>}
    {readiness && <ol className="setup-checklist">
      <li className={readiness.checks.cuisine ? "done" : ""}>Тип кухни: {readiness.checks.cuisine ? "готово" : "попросите OWNER выбрать категории"}</li>
      <li className={readiness.checks.manager ? "done" : ""}>Администратор: {readiness.checks.manager ? "подключён" : "OWNER должен подключить аккаунт"}</li>
      <li className={readiness.checks.branch ? "done" : ""}>Филиал: {readiness.checks.branch ? "готово" : "добавьте активный филиал"}</li>
      <li className={readiness.checks.menu ? "done" : ""}>Меню: {readiness.checks.menu ? "готово" : "добавьте активное блюдо"}</li>
      <li className={readiness.receiptsConfigured ? "done" : ""}>Чеки: {readiness.receiptsConfigured ? "принтер и агент настроены" : "настройте принтер и токен агента, если нужны чеки"}</li>
    </ol>}
    <div className="setup-actions">{canManage && <><button className="outline-button" data-testid="cafe-setup-open-catalog" onClick={() => onNavigate("catalog")}>Меню и филиалы</button><button className="outline-button" data-testid="cafe-setup-open-receipts" onClick={() => onNavigate("receipts")}>Принтеры и чеки</button></>}<button className="outline-button" data-testid="cafe-setup-refresh" onClick={() => setRevision((value) => value + 1)}>Обновить проверку</button></div>
  </div>;
}
