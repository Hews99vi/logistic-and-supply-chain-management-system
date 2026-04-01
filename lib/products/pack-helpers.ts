export type QuantityEntryMode = "pack" | "unit";

export type StructuredPackProduct = {
  unitSize?: number | null;
  unitMeasure?: string | null;
  packSize?: number | null;
  sellingUnit?: string | null;
  quantityEntryMode?: QuantityEntryMode | string | null;
};

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(value);
}

function normalizeText(value?: string | null) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function resolveQuantityEntryMode(product: StructuredPackProduct): QuantityEntryMode {
  const explicitMode = normalizeText(typeof product.quantityEntryMode === "string" ? product.quantityEntryMode : null)?.toLowerCase();
  if (explicitMode === "unit") {
    return "unit";
  }

  if (explicitMode === "pack") {
    return "pack";
  }

  const sellingUnit = normalizeText(product.sellingUnit)?.toLowerCase();
  return sellingUnit === "unit" ? "unit" : "pack";
}

export function buildQuantityModeLabel(product: StructuredPackProduct, options?: { plural?: boolean }) {
  const mode = resolveQuantityEntryMode(product);

  if (mode === "unit") {
    return options?.plural === false ? "Unit" : "Units";
  }

  return options?.plural === false ? "Pack / Case" : "Packs / Cases";
}

export function buildPackInfoLabel(product: StructuredPackProduct) {
  const pieces: string[] = [];

  if (product.unitSize !== null && product.unitSize !== undefined) {
    const measure = normalizeText(product.unitMeasure) ?? "";
    pieces.push([formatNumber(product.unitSize), measure].filter(Boolean).join(" ").trim());
  }

  if (product.packSize !== null && product.packSize !== undefined) {
    pieces.push(`x ${product.packSize}`);
  }

  const sellingUnit = normalizeText(product.sellingUnit);
  if (sellingUnit) {
    pieces.push(titleCase(sellingUnit));
  }

  return pieces.join(" ").trim() || null;
}

export function buildUnitEquivalentLabel(quantity: number, product: StructuredPackProduct) {
  if (!Number.isFinite(quantity) || quantity < 0) {
    return null;
  }

  if (product.packSize === null || product.packSize === undefined || product.packSize <= 0) {
    return null;
  }

  const mode = resolveQuantityEntryMode(product);

  if (mode === "unit") {
    const fullPacks = Math.floor(quantity / product.packSize);
    const remainder = quantity % product.packSize;

    if (fullPacks <= 0) {
      return `${quantity} units entered`;
    }

    return remainder > 0
      ? `${quantity} units ~ ${fullPacks} full packs + ${remainder} units`
      : `${quantity} units = ${fullPacks} full packs`;
  }

  const equivalent = quantity * product.packSize;
  return `${quantity} x ${product.packSize} = ${equivalent} units equivalent`;
}

