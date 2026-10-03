export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const DEFAULT_API_BASE_URL = import.meta.env.DEV
  ? "http://localhost:4000/api/v1"
  : "/api/v1";

export const API_BASE_URL = (
  import.meta.env.VITE_API_URL ?? DEFAULT_API_BASE_URL
).replace(/\/+$/, "");

export function resolveApiUrl(path: string) {
  if (/^https?:\/\//.test(path)) return path;
  if (path.startsWith("/api/v1/")) {
    return `${API_BASE_URL.replace(/\/api\/v1$/, "")}${path}`;
  }
  return `${API_BASE_URL}${path}`;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit & { accessToken?: string } = {},
): Promise<T> {
  const { accessToken, headers, ...requestInit } = init;
  const hasBody = requestInit.body !== undefined;
  const isFormData =
    typeof FormData !== "undefined" && requestInit.body instanceof FormData;
  const response = await fetch(resolveApiUrl(path), {
    ...requestInit,
    headers: {
      ...(hasBody && !isFormData ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { message?: string | string[] }
      | null;
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : body?.message;
    throw new ApiError(
      message ?? `API request failed with ${response.status}`,
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function openApiEventStream(
  path: string,
  accessToken: string,
  signal: AbortSignal,
) {
  const response = await fetch(resolveApiUrl(path), {
    signal,
    cache: "no-store",
    headers: {
      Accept: "text/event-stream",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok || !response.body) {
    throw new ApiError(
      `Live API stream failed with ${response.status}`,
      response.status,
    );
  }
  return response.body;
}
