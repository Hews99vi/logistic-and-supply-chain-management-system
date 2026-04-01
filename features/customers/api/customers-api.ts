import type {
  AuthSession,
  CustomerApiEnvelope,
  CustomerFilterState,
  CustomerFormValues,
  CustomerListItem,
  CustomerListResponse,
  CustomerRouteProgramContextItem,
  CustomerStatus
} from "@/features/customers/types";
import { readCustomerApiErrorMessage } from "@/features/customers/types";

type CustomerCreatePayload = {
  code: string;
  name: string;
  channel: CustomerFormValues["channel"];
  phone?: string | null;
  email?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  status: CustomerStatus;
};

type CustomerUpdatePayload = Partial<CustomerCreatePayload>;

function normalizeOptionalText(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toCustomerPayload(values: CustomerFormValues): CustomerCreatePayload {
  return {
    code: values.code.trim(),
    name: values.name.trim(),
    channel: values.channel,
    phone: normalizeOptionalText(values.phone),
    email: normalizeOptionalText(values.email),
    addressLine1: normalizeOptionalText(values.addressLine1),
    addressLine2: normalizeOptionalText(values.addressLine2),
    city: normalizeOptionalText(values.city),
    status: values.status
  };
}

async function readEnvelope<T>(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as CustomerApiEnvelope<T> | unknown;

  if (!response.ok) {
    throw new Error(readCustomerApiErrorMessage(payload, fallback));
  }

  if (!payload || typeof payload !== "object" || !("data" in payload)) {
    throw new Error("Invalid API response.");
  }

  return (payload as CustomerApiEnvelope<T>).data;
}

function buildCustomersQuery(filters: CustomerFilterState) {
  const params = new URLSearchParams();

  params.set("page", String(filters.page));
  params.set("pageSize", String(filters.pageSize));

  if (filters.search?.trim()) {
    params.set("search", filters.search.trim());
  }

  if (filters.territory?.trim()) {
    params.set("territory", filters.territory.trim());
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  return params.toString();
}

export async function fetchAuthSession() {
  const response = await fetch("/api/auth/me", {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  return readEnvelope<AuthSession>(response, "Failed to load current session.");
}

export async function fetchCustomers(filters: CustomerFilterState) {
  const query = buildCustomersQuery(filters);
  const response = await fetch(`/api/customers?${query}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  return readEnvelope<CustomerListResponse>(response, "Failed to load customers.");
}

export async function createCustomer(values: CustomerFormValues) {
  const payload = toCustomerPayload(values);
  const response = await fetch("/api/customers", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return readEnvelope<CustomerListItem>(response, "Failed to create customer.");
}

export async function updateCustomer(customerId: string, values: CustomerFormValues) {
  const payload = toCustomerPayload(values) as CustomerUpdatePayload;
  const response = await fetch(`/api/customers/${customerId}`, {
    method: "PATCH",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return readEnvelope<CustomerListItem>(response, "Failed to update customer.");
}

export async function setCustomerActiveState(customerId: string, status: CustomerStatus) {
  if (status === "INACTIVE") {
    const response = await fetch(`/api/customers/${customerId}`, {
      method: "DELETE",
      credentials: "include",
      cache: "no-store"
    });

    return readEnvelope<CustomerListItem>(response, "Failed to deactivate customer.");
  }

  const response = await fetch(`/api/customers/${customerId}`, {
    method: "PATCH",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ status: "ACTIVE" })
  });

  return readEnvelope<CustomerListItem>(response, "Failed to activate customer.");
}

export async function fetchCustomerRouteProgramContext(territory: string) {
  const normalizedTerritory = territory.trim();
  if (!normalizedTerritory) {
    return [] as CustomerRouteProgramContextItem[];
  }

  const params = new URLSearchParams();
  params.set("page", "1");
  params.set("pageSize", "5");
  params.set("territory", normalizedTerritory);
  params.set("isActive", "true");

  const response = await fetch(`/api/route-programs?${params.toString()}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  type RouteProgramsPayload = {
    items: CustomerRouteProgramContextItem[];
  };

  const data = await readEnvelope<RouteProgramsPayload>(response, "Failed to load related route program context.");
  return data.items;
}
