import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import {
  useCourierRoute,
  useCourierRoutes,
  useDispatchLiveUpdates,
  useDispatchSnapshot,
} from "@/src/entities/courier";
import { OtpLoginCard } from "@/src/features/otp-login";
import { useSession } from "@/src/shared/auth";
import {
  courierLocationCoverage,
  courierName,
  courierOverviewCounts,
  courierPresenceLabels,
  courierRouteColor,
  courierWorkLabel,
} from "../model/courier-status";
import { couriersOnMap } from "../model/map-view";
import type { CourierRouteOverlay } from "../model/map-types";
import { CourierOrderDetails } from "./courier-order-details";
import "./courier-map.css";

const CourierMapCanvas = lazy(() => import("./courier-map-canvas"));
const ACCESS_ROLES = new Set(["OPERATOR", "ADMIN", "SUPER_ADMIN"]);

function formatLocationTime(value?: string) {
  if (!value) return "Нет GPS";
  return `GPS ${new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(value))}`;
}

export function CourierMapPanel() {
  const { session, ready, logout } = useSession();
  const dispatch = useDispatchSnapshot();
  const liveState = useDispatchLiveUpdates();
  const [params, setParams] = useSearchParams();
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [collapsedId, setCollapsedId] = useState<string | null>(null);
  const [fitRevision, setFitRevision] = useState(0);
  const drawerToggle = useRef<HTMLButtonElement>(null);
  const selectedRow = useRef<HTMLButtonElement>(null);
  const branches = dispatch.data?.branches ?? [];
  const couriers = dispatch.data?.couriers ?? [];
  const selectedCourierId = params.get("courier");
  const selected = couriers.find(({ id }) => id === selectedCourierId) ?? null;
  const visibleCouriers = couriersOnMap(couriers, selected?.id ?? null);
  const showRoutes = params.get("routes") !== "hide";
  const courierRoute = useCourierRoute(
    showRoutes ? (selected?.id ?? null) : null,
  );
  const overviewRoutes = useCourierRoutes(
    showRoutes && !selected
      ? couriers
          .filter(({ activeOrders }) => activeOrders.length)
          .map(({ id }) => id)
      : [],
  );
  const overviewRouteByCourierId = new Map(
    (overviewRoutes.data ?? []).map(({ courierId, route }) => [
      courierId,
      route,
    ]),
  );
  const routeOverlays: CourierRouteOverlay[] = showRoutes
    ? visibleCouriers.flatMap((courier) => {
        const route = selected
          ? courierRoute.data
          : overviewRouteByCourierId.get(courier.id);
        return route
          ? [
              {
                color: courierRouteColor(
                  couriers.findIndex(({ id }) => id === courier.id),
                ),
                courier,
                route,
              },
            ]
          : [];
      })
    : [];
  const counts = courierOverviewCounts(couriers);
  const locationCoverage = courierLocationCoverage(couriers);

  useEffect(() => {
    const row = selectedRow.current;
    const list = row?.closest(".dispatch-drawer-list");
    if (!drawerOpen || !selectedCourierId || !row || !list) return;
    list.scrollTo({
      top:
        list.scrollTop +
        row.getBoundingClientRect().top -
        list.getBoundingClientRect().top -
        8,
    });
    row.scrollIntoView({ block: "nearest" });
  }, [drawerOpen, selectedCourierId]);

  function selectCourier(id: string | null) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (id) next.set("courier", id);
      else next.delete("courier");
      next.delete("routes");
      return next;
    });
    setCollapsedId(null);
    setFitRevision((value) => value + 1);
    if (id) setDrawerOpen(true);
  }

  if (!ready) {
    return (
      <aside className="dispatch-card live-dispatch">
        <div className="section-head compact">
          <div>
            <h2>Курьеры на карте</h2>
            <p>Подключаем защищённую сессию</p>
          </div>
        </div>
        <div className="map-loading">Проверяем сессию…</div>
      </aside>
    );
  }

  if (!session) {
    return (
      <aside className="dispatch-card live-dispatch">
        <div className="section-head compact">
          <div>
            <h2>Курьеры на карте</h2>
            <p>Войдите как оператор или администратор</p>
          </div>
        </div>
        <OtpLoginCard
          title="Подключить живую карту"
          description="Доступ защищён ролью сотрудника."
        />
      </aside>
    );
  }

  if (!ACCESS_ROLES.has(session.user.role)) {
    return (
      <aside className="dispatch-card live-dispatch">
        <div className="section-head compact">
          <div>
            <h2>Карта диспетчера</h2>
            <p>Недостаточно прав</p>
          </div>
        </div>
        <div className="map-message">
          Карта клиентов доступна только оператору и администраторам.
          {session.user.role === "COURIER" && (
            <a data-testid="dispatch-open-courier" href="/courier">
              Открыть экран курьера →
            </a>
          )}
          <button className="text-button" onClick={() => void logout()}>
            Выйти
          </button>
        </div>
      </aside>
    );
  }

  if (dispatch.isPending) {
    return (
      <aside className="dispatch-card live-dispatch">
        <div className="map-loading">Получаем курьеров и точки доставки…</div>
      </aside>
    );
  }

  if (dispatch.isError || !dispatch.data) {
    return (
      <aside className="dispatch-card live-dispatch">
        <div className="section-head compact">
          <div>
            <h2>Курьеры на карте</h2>
            <p>Нет соединения с сервером</p>
          </div>
        </div>
        <div className="map-message">
          <p>
            {dispatch.error instanceof Error
              ? dispatch.error.message
              : "Не удалось загрузить карту"}
          </p>
          <button
            className="secondary-button"
            onClick={() => void dispatch.refetch()}
          >
            Повторить
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="dispatch-card live-dispatch dispatch-workspace"
      data-testid="dispatch-map-panel"
    >
      <div className="dispatch-toolbar">
        <label className="dispatch-name-filter">
          <span>Показать на карте</span>
          <select
            data-testid="dispatch-courier-filter"
            value={selected?.id ?? ""}
            onChange={(event) => selectCourier(event.target.value || null)}
          >
            <option value="">Все курьеры ({couriers.length})</option>
            {couriers.map((courier) => (
              <option value={courier.id} key={courier.id}>
                {courierName(courier)}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary-button"
          data-testid="dispatch-toggle-routes"
          aria-pressed={showRoutes}
          onClick={() =>
            setParams((current) => {
              const next = new URLSearchParams(current);
              next.set("routes", showRoutes ? "hide" : "show");
              return next;
            })
          }
        >
          {showRoutes ? "Скрыть маршруты" : "Показать маршруты"}
        </button>
        <div className="dispatch-toolbar-end">
          <span className="dispatch-live-label" role="status">
            {liveState === "live"
              ? "● В эфире"
              : liveState === "connecting"
                ? "Подключение…"
                : "Обновление каждые 30 с"}
          </span>
          <button
            className="square-button"
            data-testid="dispatch-refresh-map"
            aria-label="Обновить карту"
            disabled={dispatch.isFetching}
            onClick={() => {
              void dispatch.refetch();
              if (showRoutes) {
                if (selected) void courierRoute.refetch();
                else void overviewRoutes.refetch();
              }
            }}
          >
            ↻
          </button>
          <button
            ref={drawerToggle}
            className="secondary-button"
            data-testid="dispatch-toggle-drawer"
            aria-expanded={drawerOpen}
            aria-controls="dispatch-courier-drawer"
            onClick={() => setDrawerOpen(!drawerOpen)}
          >
            Курьеры · {couriers.length}
          </button>
        </div>
      </div>
      <div className={`dispatch-map-layout ${drawerOpen ? "drawer-open" : ""}`}>
        <div className="dispatch-map-surface">
          <div className="dispatch-map-caption">
            <strong>{selected ? courierName(selected) : "Все курьеры"}</strong>
            <span>
              {selected
                ? courierWorkLabel(selected)
                : `В заказе: ${counts.busy} · свободных на линии: ${counts.freeOnline}`}
            </span>
            <button
              className="text-button"
              data-testid="dispatch-fit-map"
              onClick={() => setFitRevision((value) => value + 1)}
            >
              Вместить в карту
            </button>
          </div>
          <Suspense
            fallback={<div className="map-loading">Загружаем карту…</div>}
          >
            <CourierMapCanvas
              branches={branches}
              couriers={visibleCouriers}
              allCouriers={couriers}
              selectedCourierId={selected?.id ?? null}
              routes={routeOverlays}
              showStops={Boolean(selected) || showRoutes}
              fitRevision={fitRevision}
              onSelectCourier={selectCourier}
            />
          </Suspense>
          <div className="dispatch-map-footer">
            <span>
              <i className="dispatch-legend-courier" /> Курьер · нажмите для
              деталей
            </span>
            <span>
              <i className="dispatch-legend-branch" /> Филиал
            </span>
            <span>Один цвет — курьер, его линия и заказы</span>
            <span>
              GPS у {locationCoverage.located} из {locationCoverage.total}
            </span>
          </div>
          {selected && !selected.location && (
            <p className="dispatch-map-notice" role="status">
              У {courierName(selected)} нет GPS. Показаны адреса заказов;
              положение курьера неизвестно.
            </p>
          )}
          {showRoutes && (
            <div
              className="courier-route-status"
              data-testid="dispatch-route-summary"
              role="status"
            >
              {selected
                ? courierRoute.isPending
                  ? "Строим дорожный маршрут…"
                  : courierRoute.data?.routingStatus === "READY" &&
                      courierRoute.data.route
                    ? `${(courierRoute.data.route.distanceMeters / 1000).toFixed(1)} км · ~${Math.max(1, Math.ceil(courierRoute.data.route.durationSeconds / 60))} мин`
                    : courierRoute.data?.routingStatus === "NO_STOPS"
                      ? "Нет активных точек маршрута."
                      : "Маршрут недоступен. Адреса заказов сохранены."
                : `${routeOverlays.filter(({ route }) => route.routingStatus === "READY").length} из ${counts.busy} маршрутов показано${overviewRoutes.isPending ? " · загружаем остальные…" : " · без актуального GPS маршрут недоступен"}`}
            </div>
          )}
        </div>
        {drawerOpen && (
          <section
            className="dispatch-courier-drawer"
            id="dispatch-courier-drawer"
            aria-label="Список курьеров"
            data-testid="dispatch-courier-drawer"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setDrawerOpen(false);
                drawerToggle.current?.focus();
              }
            }}
          >
            <header className="dispatch-drawer-header">
              <div>
                <h2>
                  Курьеры <span>{couriers.length}</span>
                </h2>
                <p>Выберите имя, чтобы увидеть заказы</p>
              </div>
              <button
                className="square-button"
                data-testid="dispatch-close-drawer"
                aria-label="Скрыть список курьеров"
                onClick={() => {
                  setDrawerOpen(false);
                  drawerToggle.current?.focus();
                }}
              >
                ×
              </button>
            </header>
            <button
              className={`dispatch-all-couriers ${!selected ? "selected" : ""}`}
              data-testid="dispatch-show-all-couriers"
              aria-pressed={!selected}
              onClick={() => selectCourier(null)}
            >
              <strong>Все курьеры</strong>
              <span>
                {counts.online} на линии · {counts.busy} в заказе
              </span>
            </button>
            <div className="dispatch-drawer-list">
              {!couriers.length && (
                <p className="dispatch-detail-notice">
                  Активных курьеров пока нет.
                </p>
              )}
              {couriers.map((courier, index) => {
                const expanded =
                  selected?.id === courier.id && collapsedId !== courier.id;
                return (
                  <div
                    className={`dispatch-courier-row ${selected?.id === courier.id ? "selected" : ""}`}
                    key={courier.id}
                  >
                    <button
                      ref={
                        selected?.id === courier.id ? selectedRow : undefined
                      }
                      className="dispatch-courier-summary"
                      data-testid={`dispatch-select-courier-${courier.id}`}
                      aria-expanded={expanded}
                      aria-controls={`dispatch-details-${courier.id}`}
                      onClick={() => {
                        if (selected?.id === courier.id)
                          setCollapsedId(expanded ? courier.id : null);
                        else selectCourier(courier.id);
                      }}
                    >
                      <span
                        className="dispatch-courier-number"
                        style={{ backgroundColor: courierRouteColor(index) }}
                      >
                        {index + 1}
                      </span>
                      <span className="dispatch-courier-name">
                        <strong>{courierName(courier)}</strong>
                        <span>{courierWorkLabel(courier)}</span>
                        <small>
                          <i
                            className={`presence-dot ${courier.presence.toLowerCase()}`}
                          />
                          {courierPresenceLabels[courier.presence]} ·{" "}
                          {formatLocationTime(courier.location?.recordedAt)}
                        </small>
                      </span>
                      <span className="dispatch-expand-icon" aria-hidden="true">
                        {expanded ? "−" : "+"}
                      </span>
                    </button>
                    <div
                      id={`dispatch-details-${courier.id}`}
                      hidden={!expanded}
                    >
                      {expanded && <CourierOrderDetails courier={courier} />}
                    </div>
                  </div>
                );
              })}
            </div>
            {locationCoverage.missing.length > 0 && (
              <details
                className="dispatch-gps-help"
                data-testid="dispatch-location-coverage"
              >
                <summary data-testid="dispatch-gps-help-toggle">
                  Без GPS: {locationCoverage.missing.length} · подробнее
                </summary>
                <p>
                  {locationCoverage.missing.map(courierName).join(", ")}. Координаты
                  поступают из приложения курьера во время смены. Если точка не
                  появляется, проверьте разрешение на геолокацию и интернет в
                  приложении.
                </p>
              </details>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}
