import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { components } from "@alowalow/api-contract";
import { ApiError, apiRequest } from "@/src/shared/api/api-client";
import { canAccessWebSession } from "./admin-portal-access";

type SessionResponse = components["schemas"]["AuthSessionResponseDto"];
type SessionUser = components["schemas"]["AuthSessionUserDto"];
type RequestOtpResponse = components["schemas"]["RequestOtpResponseDto"];

type StoredSession = SessionResponse & {
  accessExpiresAt: number;
};

type SessionContextValue = {
  session: StoredSession | null;
  ready: boolean;
  requestOtp: (phone: string) => Promise<RequestOtpResponse>;
  verifyOtp: (phone: string, code: string) => Promise<SessionUser>;
  authorizedRequest: <T>(
    path: string,
    init?: RequestInit,
  ) => Promise<T>;
  logout: () => Promise<void>;
};

const STORAGE_KEY = "alowalow.session.v1";
const SessionContext = createContext<SessionContextValue | null>(null);

function withExpiry(session: SessionResponse): StoredSession {
  return {
    ...session,
    accessExpiresAt: Date.now() + session.expiresInSeconds * 1_000,
  };
}

function readStoredSession(): StoredSession | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (
      typeof parsed.accessToken !== "string" ||
      typeof parsed.refreshToken !== "string" ||
      typeof parsed.accessExpiresAt !== "number" ||
      !parsed.user
    ) {
      return null;
    }
    if (!canAccessWebSession(parsed.user.role)) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed as StoredSession;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [ready, setReady] = useState(false);
  const refreshInFlight = useRef<Promise<StoredSession | null> | null>(null);

  const persist = useCallback((next: StoredSession | null) => {
    setSession(next);
    if (next) {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const refresh = useCallback(
    async (refreshToken: string) => {
      if (refreshInFlight.current) return refreshInFlight.current;
      refreshInFlight.current = apiRequest<SessionResponse>("/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      })
        .then(async (response) => {
          if (!canAccessWebSession(response.user.role)) {
            persist(null);
            await apiRequest("/auth/logout", {
              method: "POST",
              body: JSON.stringify({ refreshToken: response.refreshToken }),
            }).catch(() => undefined);
            return null;
          }
          const next = withExpiry(response);
          persist(next);
          return next;
        })
        .catch(() => {
          persist(null);
          return null;
        })
        .finally(() => {
          refreshInFlight.current = null;
        });
      return refreshInFlight.current;
    },
    [persist],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const stored = readStoredSession();
      setReady(true);
      if (!stored) return;
      if (stored.accessExpiresAt > Date.now() + 30_000) {
        setSession(stored);
        return;
      }
      void refresh(stored.refreshToken);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [refresh]);

  useEffect(() => {
    if (!session) return;
    const delay = Math.max(1_000, session.accessExpiresAt - Date.now() - 60_000);
    const timeout = window.setTimeout(() => {
      void refresh(session.refreshToken);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [refresh, session]);

  const requestOtp = useCallback((phone: string) => {
    return apiRequest<RequestOtpResponse>("/auth/otp/request", {
      method: "POST",
      body: JSON.stringify({ phone }),
    });
  }, []);

  const verifyOtp = useCallback(
    async (phone: string, code: string) => {
      const response = await apiRequest<SessionResponse>("/auth/otp/verify", {
        method: "POST",
        body: JSON.stringify({ phone, code }),
      });
      if (!canAccessWebSession(response.user.role)) {
        await apiRequest("/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refreshToken: response.refreshToken }),
        }).catch(() => undefined);
        throw new ApiError(
          "Веб-доступ разрешён только сотрудникам A7-tagam.",
          403,
        );
      }
      const next = withExpiry(response);
      persist(next);
      return next.user;
    },
    [persist],
  );

  const logout = useCallback(async () => {
    const refreshToken = session?.refreshToken;
    persist(null);
    if (!refreshToken) return;
    await apiRequest("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }, [persist, session?.refreshToken]);

  const authorizedRequest = useCallback(
    async function authorizedRequest<T>(
      path: string,
      init: RequestInit = {},
    ): Promise<T> {
      if (!session) throw new ApiError("Требуется вход", 401);
      const active =
        session.accessExpiresAt > Date.now() + 15_000
          ? session
          : await refresh(session.refreshToken);
      if (!active) throw new ApiError("Сессия истекла. Войдите снова.", 401);
      try {
        return await apiRequest<T>(path, {
          ...init,
          accessToken: active.accessToken,
        });
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
        const renewed = await refresh(active.refreshToken);
        if (!renewed) {
          throw new ApiError("Сессия истекла. Войдите снова.", 401);
        }
        return apiRequest<T>(path, {
          ...init,
          accessToken: renewed.accessToken,
        });
      }
    },
    [refresh, session],
  );

  const value = useMemo(
    () => ({
      session,
      ready,
      requestOtp,
      verifyOtp,
      authorizedRequest,
      logout,
    }),
    [authorizedRequest, logout, ready, requestOtp, session, verifyOtp],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession must be used inside SessionProvider");
  }
  return value;
}
