import type { ProductRecord } from "@/types/domain/product";

export type ProductCategory = "MILK" | "YOGURT" | "CHEESE" | "BUTTER" | "ICE_CREAM" | "OTHER";
export type ProductUnitMeasure = "ml" | "l" | "g" | "kg";
export type ProductSellingUnit = "pack" | "crate" | "tray" | "carton" | "unit";
export type ProductQuantityEntryMode = "pack" | "unit";

export type ProductListItem = Pick<
  ProductRecord,
  | "id"
  | "product_code"
  | "product_name"
  | "display_name"
  | "brand"
  | "product_family"
  | "variant"
  | "unit_size"
  | "unit_measure"
  | "pack_size"
  | "selling_unit"
  | "quantity_entry_mode"
  | "category"
  | "unit_price"
  | "sku"
  | "is_active"
  | "updated_at"
>;

export type ProductListResponse = {
  items: ProductListItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type ProductFilterState = {
  page: number;
  pageSize: number;
  search?: string;
  category?: ProductCategory;
  isActive?: boolean;
};

export type ProductFormValues = {
  productCode: string;
  brand: string;
  productFamily: string;
  variant: string;
  unitSize: string;
  unitMeasure: ProductUnitMeasure | "";
  packSize: string;
  sellingUnit: ProductSellingUnit | "";
  quantityEntryMode: ProductQuantityEntryMode;
  category: ProductCategory | "";
  unitPrice: string;
  isActive: boolean;
};

export type ProductFormMode = "create" | "edit";

export type ProductFormState = {
  mode: ProductFormMode;
  productId?: string;
  legacyProductName?: string;
  values: ProductFormValues;
};

export type AuthSession = {
  user: {
    id: string;
    email?: string;
    profileRole: "admin" | "supervisor" | "driver" | "cashier";
    isActive: boolean;
  };
};

export const PRODUCT_CATEGORY_OPTIONS: Array<{ value: ProductCategory; label: string }> = [
  { value: "MILK", label: "Milk" },
  { value: "YOGURT", label: "Yogurt" },
  { value: "CHEESE", label: "Cheese" },
  { value: "BUTTER", label: "Butter" },
  { value: "ICE_CREAM", label: "Ice Cream" },
  { value: "OTHER", label: "Other" }
];

export const PRODUCT_UNIT_MEASURE_OPTIONS: Array<{ value: ProductUnitMeasure; label: string }> = [
  { value: "ml", label: "ml" },
  { value: "l", label: "l" },
  { value: "g", label: "g" },
  { value: "kg", label: "kg" }
];

export const PRODUCT_SELLING_UNIT_OPTIONS: Array<{ value: ProductSellingUnit; label: string }> = [
  { value: "pack", label: "Pack" },
  { value: "crate", label: "Crate" },
  { value: "tray", label: "Tray" },
  { value: "carton", label: "Carton" },
  { value: "unit", label: "Unit" }
];

export const PRODUCT_QUANTITY_ENTRY_MODE_OPTIONS: Array<{ value: ProductQuantityEntryMode; label: string; description: string }> = [
  { value: "pack", label: "Pack / Case Qty", description: "Operators enter outer packs or cases." },
  { value: "unit", label: "Unit Qty", description: "Operators enter loose inner units or pieces." }
];

function normalizeText(value: string) {
  return value.trim();
}

function parsePositiveNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parsePositiveInteger(value: string) {
  const parsed = parsePositiveNumber(value);
  if (parsed === null || !Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
}

function formatNumberForDisplay(value: number) {
  return Number.isInteger(value) ? String(value) : String(value);
}

export function buildProductDisplayNamePreview(values: Pick<
  ProductFormValues,
  "brand" | "productFamily" | "variant" | "unitSize" | "unitMeasure" | "packSize" | "sellingUnit"
>) {
  const identity = [values.brand, values.productFamily, values.variant]
    .map(normalizeText)
    .filter(Boolean)
    .join(" ")
    .trim();

  const descriptors: string[] = [];
  const unitSize = parsePositiveNumber(values.unitSize);
  const packSize = parsePositiveInteger(values.packSize);
  const unitMeasure = values.unitMeasure.trim();
  const sellingUnit = values.sellingUnit.trim();

  if (unitSize !== null) {
    descriptors.push([formatNumberForDisplay(unitSize), unitMeasure].filter(Boolean).join(" ").trim());
  } else if (unitMeasure) {
    descriptors.push(unitMeasure);
  }

  if (packSize !== null) {
    descriptors.push(`x ${packSize}`);
  }

  if (sellingUnit) {
    descriptors.push(sellingUnit);
  }

  return [identity, descriptors.join(" ").trim()].filter(Boolean).join(" ").trim();
}

export function buildProductStructuredSummary(product: ProductListItem) {
  const pieces: string[] = [];

  if (product.brand) pieces.push(product.brand);
  if (product.product_family) pieces.push(product.product_family);
  if (product.variant) pieces.push(product.variant);

  const sizePart = [
    product.unit_size !== null && product.unit_size !== undefined ? formatNumberForDisplay(product.unit_size) : "",
    product.unit_measure ?? ""
  ].filter(Boolean).join(" ").trim();

  if (sizePart) pieces.push(sizePart);
  if (product.pack_size !== null && product.pack_size !== undefined) pieces.push(`x ${product.pack_size}`);
  if (product.selling_unit) pieces.push(product.selling_unit);
  pieces.push(product.quantity_entry_mode === "unit" ? "entered as units" : "entered as packs/cases");

  return pieces.join(" | ");
}
