export type CustomerChannel = "RETAIL" | "WHOLESALE" | "INSTITUTIONAL";
export type CustomerStatus = "ACTIVE" | "INACTIVE";

export type CustomerListItem = {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  channel: CustomerChannel;
  phone: string | null;
  email: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  status: CustomerStatus;
  created_at: string;
  updated_at: string;
};

export type CustomerListResponse = {
  items: CustomerListItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type CustomerFilterState = {
  page: number;
  pageSize: number;
  search?: string;
  territory?: string;
  status?: CustomerStatus;
};

export type CustomerFormValues = {
  code: string;
  name: string;
  channel: CustomerChannel;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  status: CustomerStatus;
};

export type CustomerFormMode = "create" | "edit";

export type CustomerFormState = {
  mode: CustomerFormMode;
  customerId?: string;
  values: CustomerFormValues;
};

export type AuthSession = {
  user: {
    id: string;
    email?: string;
    profileRole: "admin" | "supervisor" | "driver" | "cashier";
    isActive: boolean;
  };
};

export const CUSTOMER_CHANNEL_OPTIONS: Array<{ value: CustomerChannel; label: string }> = [
  { value: "RETAIL", label: "Retail" },
  { value: "WHOLESALE", label: "Wholesale" },
  { value: "INSTITUTIONAL", label: "Institutional" }
];

export type CustomerApiEnvelope<T> = {
  data: T;
};

type CustomerApiErrorEnvelope = {
  error?: {
    message?: string;
  };
};

export function readCustomerApiErrorMessage(payload: unknown, fallback: string) {
  const maybePayload = payload as CustomerApiErrorEnvelope | null;
  return maybePayload?.error?.message ?? fallback;
}

export type CustomerRouteProgramContextItem = {
  id: string;
  route_name: string;
  territory_name: string;
  day_of_week: number;
  frequency_label: string;
  is_active: boolean;
  updated_at: string;
};
