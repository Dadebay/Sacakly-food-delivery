import { useEffect, useState } from "react";
import { api, ApiError, type MemberCafe, type Session } from "../api/client";
import { Login } from "./login";
import { MerchantDashboard } from "./merchant-dashboard";
import { OwnerDashboard } from "./owner-dashboard";

type Access = { owner: boolean; cafes: MemberCafe[] };

export function App() {
  const [session, setSession] = useState<Session | null>(() => api.getSession());
  const [access, setAccess] = useState<Access | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [section, setSection] = useState<"merchant" | "owner">("merchant");

  useEffect(() => {
    if (!session) { setAccess(null); return; }
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      api.myCafes(),
      api.ownerStatus().then(() => true).catch((reason: unknown) => {
        if (reason instanceof ApiError && reason.status === 403) return false;
        throw reason;
      }),
    ]).then(([cafes, owner]) => {
      if (!active) return;
      setAccess({ cafes, owner });
      setSection(owner && cafes.length === 0 ? "owner" : "merchant");
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Не удалось загрузить доступ");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session]);

  async function signOut() {
    await api.logout();
    setSession(null);
    setAccess(null);
  }

  return <div className="app-shell" data-testid="merchant-app-root">
    <header className="topbar">
      <a className="brand" href="/" aria-label="Saçakly — главная">
        <span className="brand-mark">S<span>.</span></span>
        <span>Saçak<span>ly</span><small>для партнёров</small></span>
      </a>
      {session && <div className="top-actions">
        <span className="account-phone">{session.user.phone}</span>
        <button className="text-button" onClick={signOut} data-testid="merchant-sign-out">Выйти</button>
      </div>}
    </header>

    {!session ? <Login onSuccess={setSession} /> : <main className="workspace">
      <div className="workspace-heading">
        <div><p className="eyebrow">Рабочее пространство</p><h1>Добро пожаловать, {session.user.firstName || "партнёр"}</h1></div>
        <span className="secure-badge">Доступ защищён сервером</span>
      </div>
      {loading && <div className="notice" role="status">Загружаем доступ…</div>}
      {error && <div className="notice error" role="alert">{error}<button onClick={() => setSession({ ...session })}>Повторить</button></div>}
      {access && <>
        {access.owner && access.cafes.length > 0 && <nav className="section-tabs" aria-label="Разделы">
          <button className={section === "merchant" ? "selected" : ""} onClick={() => setSection("merchant")} data-testid="merchant-section-tab">Мои кафе</button>
          <button className={section === "owner" ? "selected" : ""} onClick={() => setSection("owner")} data-testid="owner-section-tab">Платформа</button>
        </nav>}
        {section === "owner" && access.owner ? <OwnerDashboard /> : access.cafes.length > 0 ? <MerchantDashboard cafes={access.cafes} /> : access.owner ? <OwnerDashboard /> : <div className="empty-state"><h2>Нет подключённых кафе</h2><p>Владелец платформы должен назначить вам доступ к вашему кафе.</p></div>}
      </>}
    </main>}
    <footer>Saçakly · кафе, заказы и курьеры в одной сети</footer>
  </div>;
}
