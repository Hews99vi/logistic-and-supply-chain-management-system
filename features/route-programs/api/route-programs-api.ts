import type {
  AuthSession,
  RouteProgramFilterState,
  RouteProgramFormValues,
  RouteProgramListItem,
  RouteProgramListResponse
} from "@/features/route-programs/types";

type ApiEnvelope<T> = {
  data: T;
};

type ApiErrorEnvelope = {
  error: {
    message?: string;
  };
};

function toErrorMessage(payload: unknown, fallback: string) {
  const maybePayload = payload as ApiErrorEnvelope | null;
  return maybePayload?.error?.message ?? fallback;
}

async function readEnvelope<T>(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | ApiErrorEnvelope | null;

  if (!response.ok) {
    throw new Error(toErrorMessage(payload, fallback));
  }

  if (!payload || !("data" in payload)) {
    throw new Error("Invalid API response.");
  }

  return payload.data;
}

function buildRouteProgramsQuery(filters: RouteProgramFilterState) {
  const params = new URLSearchParams();

  params.set("page", String(filters.page));
  params.set("pageSize", String(filters.pageSize));

  const searchTerm = filters.search?.trim();
  if (searchTerm) {
    params.set("search", searchTerm);
  }

  const territoryTerm = filters.territory?.trim();
  if (territoryTerm) {
    params.set("territory", territoryTerm);
  }

  if (typeof filters.dayOfWeek === "number") {
    params.set("dayOfWeek", String(filters.dayOfWeek));
  }

  if (typeof filters.isActive === "boolean") {
    params.set("isActive", String(filters.isActive));
  }

  return params.toString();
}

type RouteProgramCreatePayload = {
  territoryName: string;
  dayOfWeek: number;
  frequencyLabel: string;
  routeName: string;
  routeDescription?: string;
  isActive: boolean;
};

type RouteProgramUpdatePayload = Partial<RouteProgramCreatePayload>;

function toPayload(values: RouteProgramFormValues): RouteProgramCreatePayload {
  return {
    territoryName: values.territoryName.trim(),
    dayOfWeek: values.dayOfWeek,
    frequencyLabel: values.frequencyLabel.trim(),
    routeName: values.routeName.trim(),
    routeDescription: values.routeDescription.trim() || undefined,
    isActive: values.isActive
  };
}

export async function fetchAuthSession() {
  const response = await fetch("/api/auth/me", {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  return readEnvelope<AuthSession>(response, "Failed to load current session.");
}

export async function fetchRoutePrograms(filters: RouteProgramFilterState) {
  const query = buildRouteProgramsQuery(filters);
  const response = await fetch(`/api/route-programs?${query}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  return readEnvelope<RouteProgramListResponse>(response, "Failed to load route programs.");
}

export async function createRouteProgram(values: RouteProgramFormValues) {
  const payload = toPayload(values);
  const response = await fetch("/api/route-programs", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return readEnvelope<RouteProgramListItem>(response, "Failed to create route program.");
}

export async function updateRouteProgram(routeProgramId: string, values: RouteProgramFormValues) {
  const payload = toPayload(values) as RouteProgramUpdatePayload;
  const response = await fetch(`/api/route-programs/${routeProgramId}`, {
    method: "PATCH",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return readEnvelope<RouteProgramListItem>(response, "Failed to update route program.");
}

export async function setRouteProgramActiveState(routeProgramId: string, isActive: boolean) {
  if (!isActive) {
    const response = await fetch(`/api/route-programs/${routeProgramId}`, {
      method: "DELETE",
      credentials: "include",
      cache: "no-store"
    });

    return readEnvelope<RouteProgramListItem>(response, "Failed to deactivate route program.");
  }

  const response = await fetch(`/api/route-programs/${routeProgramId}`, {
    method: "PATCH",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ isActive: true })
  });

  return readEnvelope<RouteProgramListItem>(response, "Failed to activate route program.");
}
