type ApiEnvelope<T> = {
  data: T;
};

type ApiErrorEnvelope = {
  error?: {
    message?: string;
  };
};

const SESSION_CACHE_TTL_MS = 2 * 60 * 1000;

let cachedSession: {
  expiresAt: number;
  value?: unknown;
  promise?: Promise<unknown>;
} | null = null;

function readErrorMessage(payload: unknown, fallback: string) {
  return (payload as ApiErrorEnvelope | null)?.error?.message ?? fallback;
}

async function readEnvelope<T>(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | ApiErrorEnvelope | null;

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, fallback));
  }

  if (!payload || !("data" in payload)) {
    throw new Error("Invalid API response.");
  }

  return payload.data;
}

export function clearCachedAuthSession() {
  cachedSession = null;
}

export function redirectToLogin(redirectTo = typeof window !== "undefined" ? window.location.pathname : "/dashboard") {
  clearCachedAuthSession();

  if (typeof window === "undefined") {
    return;
  }

  const loginUrl = new URL("/login", window.location.origin);
  loginUrl.searchParams.set("redirectTo", redirectTo || "/dashboard");
  window.location.assign(loginUrl.toString());
}

export function redirectToLoginOnUnauthorized(response: Response) {
  if (response.status === 401) {
    redirectToLogin();
    return true;
  }

  return false;
}

export async function fetchCachedAuthSession<T>() {
  const now = Date.now();

  if (cachedSession?.value && cachedSession.expiresAt > now) {
    return cachedSession.value as T;
  }

  if (cachedSession?.promise && cachedSession.expiresAt > now) {
    return cachedSession.promise as Promise<T>;
  }

  const promise = fetch("/api/auth/me", {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  }).then((response) => {
    redirectToLoginOnUnauthorized(response);

    return readEnvelope<T>(response, "Failed to load current session.");
  });

  cachedSession = {
    expiresAt: now + SESSION_CACHE_TTL_MS,
    promise
  };

  try {
    const value = await promise;
    cachedSession = {
      expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
      value
    };
    return value;
  } catch (error) {
    cachedSession = null;
    throw error;
  }
}
