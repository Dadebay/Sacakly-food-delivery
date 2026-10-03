import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useOrders, type Order } from "@/src/entities/order";
import { createNewOrderTracker } from "../model/new-order-alert";
import { useOrderAlertSound } from "../model/use-order-alert-sound";
import "./new-order-alert.css";

type AlertBatch = {
  orders: Order[];
  announcedAt: number;
};

type BrowserPermission = NotificationPermission | "unsupported";

function readBrowserPermission(): BrowserPermission {
  return typeof Notification === "undefined"
    ? "unsupported"
    : Notification.permission;
}

function notificationBody(orders: Order[]) {
  if (orders.length > 1) return `Поступило новых заказов: ${orders.length}`;
  const order = orders[0];
  if (!order) return "Поступил новый заказ";
  return `Заказ #${order.number} · ${Number(order.total).toFixed(2)} TMT`;
}

export function NewOrderAlert({
  onOpenOrders,
  userId,
}: {
  onOpenOrders: () => void;
  userId: string;
}) {
  const orders = useOrders({
    statuses: ["COOKING", "READY"],
    page: 1,
    limit: 100,
  });
  const trackOrders = useRef(createNewOrderTracker<Order>());
  const sound = useOrderAlertSound(userId);
  const [alert, setAlert] = useState<AlertBatch | null>(null);
  const [permission, setPermission] = useState<BrowserPermission>(
    readBrowserPermission,
  );

  const announce = useEffectEvent((newOrders: Order[]) => {
    sound.play();
    if (permission !== "granted" || typeof Notification === "undefined") {
      return;
    }

    try {
      const notification = new Notification("Новый заказ A7-tagam", {
        body: notificationBody(newOrders),
        icon: "/a7-tagam-logo.png",
        tag: `a7-new-orders-${newOrders.map((order) => order.id).join("-")}`,
        silent: true,
      });
      notification.onclick = () => {
        window.focus();
        onOpenOrders();
        notification.close();
      };
    } catch {
      // The in-app alert remains authoritative when the browser blocks a
      // system notification despite a previously granted permission.
    }
  });

  useEffect(() => {
    const currentOrders = orders.data?.items;
    if (!currentOrders) return;
    const newOrders = trackOrders.current(currentOrders);
    if (!newOrders.length) return;
    const alertTimeout = window.setTimeout(() => {
      setAlert({ orders: newOrders, announcedAt: Date.now() });
      announce(newOrders);
    }, 0);
    return () => window.clearTimeout(alertTimeout);
  }, [orders.data?.items]);

  async function requestPermission() {
    if (typeof Notification === "undefined") return;
    try {
      setPermission(await Notification.requestPermission());
    } catch {
      setPermission("denied");
    }
  }

  return (
    <>
      <div
        className={`new-order-alert-control ${orders.isError ? "error" : ""}`}
        data-testid="new-order-alert-control"
      >
        {orders.isError ? (
          <span role="status">Проверка заказов недоступна</span>
        ) : permission === "default" ? (
          <button
            type="button"
            data-testid="new-order-alert-enable"
            onClick={() => void requestPermission()}
          >
            <span aria-hidden="true">●</span>
            Включить уведомления
          </button>
        ) : (
          <span>
            <i aria-hidden="true" />
            {permission === "granted"
              ? "Уведомления включены"
              : "Уведомления внутри админки"}
          </span>
        )}
        {sound.state === "unsupported" ? (
          <span>Звук не поддерживается</span>
        ) : (
          <button
            type="button"
            className="new-order-sound-toggle"
            data-testid="new-order-alert-sound-toggle"
            aria-label="Звук новых заказов"
            aria-pressed={!sound.muted && sound.state === "ready"}
            onClick={() =>
              sound.setMuted(!sound.muted && sound.state === "ready")
            }
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11 5 6 9H3v6h3l5 4z" />
              {!sound.muted && sound.state === "ready" ? (
                <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
              ) : (
                <path d="m16 9 5 6m0-6-5 6" />
              )}
            </svg>
            {sound.muted
              ? "Звук выключен"
              : sound.state === "ready"
                ? "Звук включён"
                : "Включить звук"}
          </button>
        )}
        {!sound.muted && sound.state === "ready" && (
          <button
            type="button"
            className="new-order-sound-test"
            data-testid="new-order-alert-sound-test"
            onClick={sound.test}
          >
            Проверить звук
          </button>
        )}
        {!sound.muted && sound.state === "blocked" && (
          <small className="new-order-sound-help" role="status">
            Браузер приостановил звук. Нажмите «Включить звук».
          </small>
        )}
      </div>

      {alert && (
        <aside
          className="new-order-alert-toast"
          data-testid="new-order-alert-toast"
          role="status"
          aria-live="assertive"
        >
          <div>
            <span className="eyebrow">НОВЫЙ ЗАКАЗ</span>
            <strong>{notificationBody(alert.orders)}</strong>
            <small>
              Проверено в{" "}
              {new Intl.DateTimeFormat("ru-RU", {
                hour: "2-digit",
                minute: "2-digit",
              }).format(alert.announcedAt)}
            </small>
          </div>
          <div className="new-order-alert-actions">
            <button
              type="button"
              className="primary-button compact"
              data-testid="new-order-alert-open"
              onClick={() => {
                onOpenOrders();
                setAlert(null);
              }}
            >
              Открыть заказы
            </button>
            <button
              type="button"
              className="new-order-alert-close"
              data-testid="new-order-alert-close"
              aria-label="Закрыть уведомление"
              onClick={() => setAlert(null)}
            >
              ×
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
