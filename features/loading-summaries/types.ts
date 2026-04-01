import type { DailyReportStatus, ProductSnapshotDto } from "@/types/domain/report";

export type LoadingSummaryListItem = {
  id: string;
  dateReportId: string;
  reportDate: string;
  routeProgramId: string;
  preparedBy: string;
  staffName: string;
  territoryNameSnapshot: string;
  routeNameSnapshot: string;
  status: DailyReportStatus;
  remarks: string | null;
  loadingCompletedAt: string | null;
  loadingCompletedBy: string | null;
  loadingNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LoadingSummaryListResponse = {
  items: LoadingSummaryListItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type LoadingSummaryFilterState = {
  page: number;
  pageSize: number;
  dateFrom?: string;
  dateTo?: string;
  routeProgramId?: string;
  status?: DailyReportStatus;
  search?: string;
};

export type LoadingSummaryFormValues = {
  reportDate: string;
  routeProgramId: string;
  staffName: string;
  remarks: string;
  loadingNotes: string;
};

export type LoadingSummaryFormState = {
  values: LoadingSummaryFormValues;
};

export type LoadingSummaryItem = ProductSnapshotDto & {
  id: string;
  dailyReportId: string;
  productId: string;
  productCodeSnapshot: string;
  productNameSnapshot: string;
  unitPriceSnapshot: number;
  loadingQty: number;
  salesQty: number;
  balanceQty: number;
  lorryQty: number;
  varianceQty: number;
  createdAt: string;
  updatedAt: string;
};

export type LoadingSummaryItemBatchSaveInput = {
  id?: string;
  productId: string;
  loadingQty: number;
  salesQty: number;
  lorryQty: number;
};

export type ProductOption = {
  id: string;
  productCode: string;
  productName: string;
  unitPrice: number;
  unitSize: number | null;
  unitMeasure: string | null;
  packSize: number | null;
  sellingUnit: string | null;
  quantityEntryMode: "pack" | "unit";
  isActive: boolean;
};

export type RouteProgramFilterOption = {
  id: string;
  routeName: string;
  territoryName: string;
};

export type AuthSession = {
  user: {
    id: string;
    email?: string;
    profileRole: "admin" | "supervisor" | "driver" | "cashier";
    isActive: boolean;
  };
};
