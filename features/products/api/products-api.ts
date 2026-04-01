import type {
  AuthSession,
  ProductCategory,
  ProductFilterState,
  ProductFormValues,
  ProductListItem,
  ProductListResponse
} from "@/features/products/types";
import { buildProductDisplayNamePreview } from "@/features/products/types";

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

function buildProductsQuery(filters: ProductFilterState) {
  const params = new URLSearchParams();

  params.set("page", String(filters.page));
  params.set("pageSize", String(filters.pageSize));

  if (filters.search?.trim()) {
    params.set("search", filters.search.trim());
  }

  if (filters.category) {
    params.set("category", filters.category);
  }

  if (typeof filters.isActive === "boolean") {
    params.set("isActive", String(filters.isActive));
  }

  return params.toString();
}

type ProductCreatePayload = {
  productCode: string;
  productName: string;
  category?: ProductCategory;
  unitPrice: number;
  brand?: string;
  productFamily: string;
  variant?: string;
  unitSize?: number;
  unitMeasure?: string;
  packSize?: number;
  sellingUnit?: string;
  quantityEntryMode?: "pack" | "unit";
  displayName?: string;
  isActive: boolean;
};

type ProductUpdatePayload = Partial<ProductCreatePayload>;

function toOptionalTrimmedText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toOptionalInteger(value: string) {
  const parsed = toOptionalNumber(value);
  return parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined;
}

function toProductPayload(values: ProductFormValues): ProductCreatePayload {
  const productFamily = values.productFamily.trim();
  const displayName = buildProductDisplayNamePreview(values) || productFamily;

  return {
    productCode: values.productCode.trim(),
    productName: displayName,
    category: values.category || undefined,
    unitPrice: Number(values.unitPrice),
    brand: toOptionalTrimmedText(values.brand),
    productFamily,
    variant: toOptionalTrimmedText(values.variant),
    unitSize: toOptionalNumber(values.unitSize),
    unitMeasure: values.unitMeasure || undefined,
    packSize: toOptionalInteger(values.packSize),
    sellingUnit: values.sellingUnit || undefined,
    quantityEntryMode: values.quantityEntryMode,
    displayName,
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

export async function fetchProducts(filters: ProductFilterState) {
  const query = buildProductsQuery(filters);
  const response = await fetch(`/api/products?${query}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  return readEnvelope<ProductListResponse>(response, "Failed to load products.");
}

export async function createProduct(values: ProductFormValues) {
  const payload = toProductPayload(values);
  const response = await fetch("/api/products", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return readEnvelope<ProductListItem>(response, "Failed to create product.");
}

export async function updateProduct(productId: string, values: ProductFormValues) {
  const payload = toProductPayload(values) as ProductUpdatePayload;
  const response = await fetch(`/api/products/${productId}`, {
    method: "PATCH",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return readEnvelope<ProductListItem>(response, "Failed to update product.");
}

export async function setProductActiveState(productId: string, isActive: boolean) {
  if (!isActive) {
    const response = await fetch(`/api/products/${productId}`, {
      method: "DELETE",
      credentials: "include",
      cache: "no-store"
    });

    return readEnvelope<ProductListItem>(response, "Failed to deactivate product.");
  }

  const response = await fetch(`/api/products/${productId}`, {
    method: "PATCH",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ isActive: true })
  });

  return readEnvelope<ProductListItem>(response, "Failed to activate product.");
}
