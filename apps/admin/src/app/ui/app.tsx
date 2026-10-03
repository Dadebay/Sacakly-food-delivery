import {
  lazy,
  Suspense,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from "react";
import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router";
import {
  AdminDashboard,
  adminNavigation,
  defaultAdminPathForRole,
  navigationForRole,
  type AdminNavigationItem,
  type AdminView,
} from "@/src/widgets/admin-dashboard";
import { useMyAdminPageAccess } from "@/src/entities/admin-page-access";
import { roleLabels } from "@/src/entities/order";
import { useSession } from "@/src/shared/auth";
import { AppProviders } from "../providers";

const adminRouteComponents = {
  "app-versions": lazy(() =>
    import("@/src/widgets/app-version-manager").then((module) => ({
      default: module.AppVersionManager,
    })),
  ),
  orders: lazy(() =>
    import("@/src/widgets/order-board").then((module) => ({
      default: module.OrderBoard,
    })),
  ),
  map: lazy(() =>
    import("@/src/widgets/dispatch-map").then((module) => ({
      default: module.DispatchMap,
    })),
  ),
  branches: lazy(() =>
    import("@/src/widgets/branch-manager").then((module) => ({
      default: module.BranchManager,
    })),
  ),
  delivery: lazy(() =>
    import("@/src/widgets/delivery-manager").then((module) => ({
      default: module.DeliveryManager,
    })),
  ),
  catalog: lazy(() =>
    import("@/src/widgets/catalog-manager").then((module) => ({
      default: module.CatalogManager,
    })),
  ),
  marketing: lazy(() =>
    import("@/src/widgets/marketing-manager").then((module) => ({
      default: module.MarketingManager,
    })),
  ),
  notifications: lazy(() =>
    import("@/src/widgets/notification-manager").then((module) => ({
      default: module.NotificationManager,
    })),
  ),
  staff: lazy(() =>
    import("@/src/widgets/staff-manager").then((module) => ({
      default: module.StaffManager,
    })),
  ),
  contacts: lazy(() =>
    import("@/src/widgets/contact-manager").then((module) => ({
      default: module.ContactManager,
    })),
  ),
  "login-attempts": lazy(() =>
    import("@/src/widgets/login-attempt-manager").then((module) => ({
      default: module.LoginAttemptManager,
    })),
  ),
  "meal-config": lazy(() =>
    import("@/src/widgets/meal-config-calculator").then((module) => ({
      default: module.MealConfigCalculator,
    })),
  ),
  accounting: lazy(() =>
    import("@/src/widgets/accounting-dashboard").then((module) => ({
      default: module.AccountingDashboard,
    })),
  ),
  access: lazy(() =>
    import("@/src/widgets/page-access-manager").then((module) => ({
      default: module.PageAccessManager,
    })),
  ),
} satisfies Record<AdminView, LazyExoticComponent<ComponentType>>;

const CourierTrackingScreen = lazy(() =>
  import("@/src/widgets/courier-tracking").then((module) => ({
    default: module.CourierTrackingScreen,
  })),
);

function RouteFallback() {
  return (
    <main className="login-page" data-testid="app-route-loading">
      Загружаем защищённую админку…
    </main>
  );
}

function NotFound() {
  return (
    <main className="login-page" data-testid="app-not-found">
      <section className="access-card">
        <h1>Страница не найдена</h1>
        <p>Проверьте адрес или вернитесь в центр управления.</p>
        <Link
          className="primary-button link-button"
          data-testid="app-not-found-home"
          to="/"
        >
          Открыть центр управления
        </Link>
      </section>
    </main>
  );
}

function PageAccessLoadError() {
  const pageAccess = useMyAdminPageAccess();
  const { logout } = useSession();
  return (
    <main className="login-page" data-testid="admin-page-access-error">
      <section className="access-card">
        <h1>Не удалось проверить доступ</h1>
        <p>Рабочие страницы закрыты до загрузки серверной матрицы прав.</p>
        <button
          className="primary-button"
          type="button"
          onClick={() => void pageAccess.refetch()}
        >
          Повторить
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => void logout()}
        >
          Выйти
        </button>
      </section>
    </main>
  );
}

function NoPageAccess() {
  const { session, ready, logout } = useSession();
  if (!ready) return <RouteFallback />;
  if (!session) return <Navigate replace to="/" />;
  return (
    <main className="login-page" data-testid="admin-no-page-access">
      <section className="access-card">
        <h1>Нет доступных рабочих страниц</h1>
        <p>
          Главный администратор не выдал роли «{roleLabels[session.user.role]}»
          ни одной рабочей страницы.
        </p>
        <button
          className="secondary-button"
          type="button"
          onClick={() => void logout()}
        >
          Выйти
        </button>
      </section>
    </main>
  );
}

function CourierRoute() {
  const { session, ready } = useSession();
  const pageAccess = useMyAdminPageAccess();
  if (!ready) return <RouteFallback />;
  if (!session || session.user.role !== "COURIER") {
    return <CourierTrackingScreen />;
  }
  if (pageAccess.isPending) return <RouteFallback />;
  if (pageAccess.isError || !pageAccess.data) return <PageAccessLoadError />;
  if (!pageAccess.data.allowedPages.includes("COURIER_WORKSPACE")) {
    return <Navigate replace to="/access-denied" />;
  }
  return <CourierTrackingScreen />;
}

function RoleProtectedView({
  navigationItem,
  children,
}: {
  navigationItem: AdminNavigationItem;
  children: ReactNode;
}) {
  const { session } = useSession();
  const pageAccess = useMyAdminPageAccess();

  if (!session) return null;
  if (pageAccess.isPending) return <RouteFallback />;
  if (pageAccess.isError || !pageAccess.data) return <PageAccessLoadError />;
  const allowedNavigation = navigationForRole(
    session.user.role,
    pageAccess.data.allowedPages,
  );
  if (!allowedNavigation.some(({ id }) => id === navigationItem.id)) {
    return (
      <Navigate
        replace
        to={defaultAdminPathForRole(
          session.user.role,
          pageAccess.data.allowedPages,
        )}
      />
    );
  }

  return children;
}

function RootRedirect() {
  const { session, ready } = useSession();
  const pageAccess = useMyAdminPageAccess();
  if (!ready) return <RouteFallback />;
  if (session && pageAccess.isPending) {
    return <RouteFallback />;
  }
  if (session && (pageAccess.isError || !pageAccess.data)) {
    return <PageAccessLoadError />;
  }
  const allowedPages = pageAccess.data?.allowedPages;
  const adminNavigationItems = session
    ? navigationForRole(session.user.role, allowedPages).filter(
        (item) => item.page !== null,
      )
    : [];
  return (
    <Navigate
      replace
      to={
        session?.user.role === "COURIER" && adminNavigationItems.length === 0
          ? allowedPages?.includes("COURIER_WORKSPACE")
            ? "/courier"
            : "/access-denied"
          : session
            ? defaultAdminPathForRole(session.user.role, allowedPages)
            : "/orders"
      }
    />
  );
}

function AdminRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/courier" element={<CourierRoute />} />
      <Route path="/access-denied" element={<NoPageAccess />} />
      <Route element={<AdminDashboard />}>
        {adminNavigation.map((navigationItem) => {
          const Component = adminRouteComponents[navigationItem.id];
          return (
            <Route
              key={navigationItem.id}
              path={navigationItem.path}
              element={
                <RoleProtectedView navigationItem={navigationItem}>
                  <Component />
                </RoleProtectedView>
              }
            />
          );
        })}
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <AdminRoutes />
        </Suspense>
      </BrowserRouter>
    </AppProviders>
  );
}
