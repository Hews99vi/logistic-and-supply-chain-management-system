import type { RouteProgramListQuery } from "@/lib/validation/route-program";

export type RouteProgramListItem = {
  id: string;
  territory_name: string;
  day_of_week: number;
  frequency_label: string;
  route_name: string;
  route_description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type RouteProgramListResponse = {
  items: RouteProgramListItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type RouteProgramFilterState = {
  page: number;
  pageSize: number;
  search?: string;
  territory?: string;
  dayOfWeek?: RouteProgramListQuery["dayOfWeek"];
  isActive?: boolean;
};

export type RouteProgramFormValues = {
  territoryName: string;
  dayOfWeek: number;
  frequencyLabel: string;
  routeName: string;
  routeDescription: string;
  isActive: boolean;
};

export type RouteProgramFormMode = "create" | "edit";

export type RouteProgramFormState = {
  mode: RouteProgramFormMode;
  routeProgramId?: string;
  values: RouteProgramFormValues;
};

export type AuthSession = {
  user: {
    id: string;
    email?: string;
    profileRole: "admin" | "supervisor" | "driver" | "cashier";
    isActive: boolean;
  };
};

export const ROUTE_DAY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" }
];

export function getDayLabel(dayOfWeek: number) {
  return ROUTE_DAY_OPTIONS.find((item) => item.value === dayOfWeek)?.label ?? `Day ${dayOfWeek}`;
}
