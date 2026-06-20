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
  credit_days?: number;
  credit_limit?: number;
  credit_status?: "active" | "hold" | "blocked";
  outstanding_credit?: number;
  overdue_credit?: number;
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
  creditDays: number;
  creditLimit: number;
  creditStatus: "active" | "hold" | "blocked";
};

export type CustomerStatementDto = {
  customer: CustomerListItem;
  totals: {
    creditAmount: number;
    collectedAmount: number;
    outstandingAmount: number;
    overdueAmount: number;
  };
  creditInvoices: Array<{
    id: string;
    invoiceNo: string;
    invoiceDate: string;
    dueDate: string | null;
    amount: number;
    collectedAmount: number;
    outstandingAmount: number;
    status: string;
    agingBucket: string;
  }>;
  collections: Array<{
    id: string;
    creditInvoiceId: string;
    invoiceNo: string;
    collectedAt: string;
    amount: number;
    paymentMethod: string;
    referenceNo: string | null;
  }>;
  cheques: Array<{
    id: string;
    invoiceNo: string | null;
    chequeNo: string;
    bankName: string;
    amount: number;
    status: string;
    receivedDate: string;
  }>;
  bills: Array<{
    id: string;
    invoiceNo: string;
    amountSnapshot: number;
    status: string;
    createdAt: string;
  }>;
  events: Array<{
    id: string;
    eventType: string;
    entityType: string;
    amount: number | null;
    statusFrom: string | null;
    statusTo: string | null;
    createdAt: string;
  }>;
};

export type UnmatchedCustomerOutletDto = {
  id: string;
  outletName: string;
  routeName: string | null;
  status: "pending" | "linked" | "created" | "ignored";
  firstSeenReportId: string | null;
  lastSeenReportId: string | null;
  suggestedCustomerId: string | null;
  resolvedCustomerId: string | null;
  updatedAt: string;
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
    organizationId?: string | null;
    permissions?: Record<string, Record<string, boolean | undefined> | undefined> | null;
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
