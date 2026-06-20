import Papa from "papaparse";
import type { ProductOption, ReportInvoiceBatchSaveItemInput, ReportInventoryBatchSaveItemInput, ReportReturnDamageBatchSaveItemInput } from "@/features/reports/types";

// ---------------------------------------------------------------------------
// Raw CSV row shape for the Ambewela system-generated Flat Data columns.
// ---------------------------------------------------------------------------
export type FlatDataRawRow = {
  Date: string;
  DataTime: string;
  InvoiceId: string;
  Supervisor: string;
  RSM: string;
  Type: string; // "Invoice" | "Return"
  OutletId: string;
  OutletName: string;
  RouteId: string;
  RouteName: string;
  Channel: string;
  PaymentTerm: string; // "Cash" | "Cheque" | "Credit" | ""
  RepId: string;
  RepName: string;
  PlaceHolerCode: string;
  PlaceHoler: string;
  DistributorID: string;
  DistributorName: string;
  Category1: string;
  Category2: string;
  Category3: string;
  Category4: string;
  Category5: string;
  IncentiveCategory: string;
  Brand: string;
  ProductID: string;
  ProductName: string;
  Qty: string;
  dispct: string;
  Discount: string;
  valueBeforDiscount: string;
  valueafterDiscount: string;
  Retunresoan: string; // Return reason (typo in original system)
};

// ---------------------------------------------------------------------------
// Validation result types
// ---------------------------------------------------------------------------
export type FlatDataValidationError = {
  type: "missing_products" | "parse_error" | "empty_file" | "no_data_rows";
  message: string;
  missingProductCodes?: string[];
};

export type FlatDataParseResult = {
  success: true;
  invoiceEntries: ReportInvoiceBatchSaveItemInput[];
  inventorySalesMap: Map<string, { salesQty: number; salesRevenue: number; costedSalesQty: number }>; // productId → stock movement qty, actual revenue, and distributor-costed qty
  returnDamageEntries: ReportReturnDamageBatchSaveItemInput[];
  deliveredBillCount: number;
  summary: {
    totalInvoiceRows: number;
    totalReturnRows: number;
    uniqueInvoices: number;
    uniqueProducts: number;
    totalSalesQty: number;
    totalDamageQty: number;
  };
} | {
  success: false;
  error: FlatDataValidationError;
};

// ---------------------------------------------------------------------------
// Build a lookup map: product_code → ProductOption
// ---------------------------------------------------------------------------
function normalizeProductCode(code: string) {
  const trimmed = code.trim();
  const withoutLeadingZeroes = trimmed.replace(/^0+(?=\d)/, "");
  return withoutLeadingZeroes || trimmed;
}

function buildProductCodeMap(products: ProductOption[]): Map<string, ProductOption> {
  const map = new Map<string, ProductOption>();
  for (const product of products) {
    map.set(normalizeProductCode(product.productCode), product);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Parse the CSV text into structured rows
// ---------------------------------------------------------------------------
function parseCSV(csvText: string): { rows: FlatDataRawRow[]; error?: string } {
  const result = Papa.parse<FlatDataRawRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim(),
  });

  if (result.errors.length > 0) {
    const critical = result.errors.find(
      (e) => e.type === "Delimiter" || e.type === "FieldMismatch"
    );
    if (critical) {
      return { rows: [], error: `CSV parse error: ${critical.message} (row ${critical.row})` };
    }
  }

  return { rows: result.data };
}

// ---------------------------------------------------------------------------
// Validate that all product codes in the CSV exist in the product catalog
// ---------------------------------------------------------------------------
function validateProductCodes(
  rows: FlatDataRawRow[],
  productCodeMap: Map<string, ProductOption>
): string[] {
  const uniqueCodes = new Set<string>();
  for (const row of rows) {
    const code = row.ProductID?.trim();
    if (code) {
      uniqueCodes.add(normalizeProductCode(code));
    }
  }

  const missing: string[] = [];
  for (const code of uniqueCodes) {
    if (!productCodeMap.has(code)) {
      missing.push(code);
    }
  }

  return missing;
}

// ---------------------------------------------------------------------------
// Aggregate invoice rows: group line items by InvoiceId,
// then allocate the sum of valueafterDiscount by PaymentTerm
// ---------------------------------------------------------------------------
function aggregateInvoices(
  rows: FlatDataRawRow[]
): ReportInvoiceBatchSaveItemInput[] {
  // Only process "Invoice" type rows (not "Return")
  const invoiceRows = rows.filter((r) => r.Type?.trim().toLowerCase() === "invoice");

  // Group by InvoiceId
  const invoiceMap = new Map<
    string,
    { cashAmount: number; chequeAmount: number; creditAmount: number; outletName?: string }
  >();

  for (const row of invoiceRows) {
    const invoiceId = row.InvoiceId?.trim();
    if (!invoiceId) continue;

    const value = Math.abs(parseFloat(row.valueafterDiscount) || 0);
    const paymentTerm = row.PaymentTerm?.trim().toLowerCase() || "cash";

    if (!invoiceMap.has(invoiceId)) {
      invoiceMap.set(invoiceId, { cashAmount: 0, chequeAmount: 0, creditAmount: 0, outletName: row.OutletName?.trim() || undefined });
    }

    const entry = invoiceMap.get(invoiceId)!;
    if (!entry.outletName && row.OutletName?.trim()) {
      entry.outletName = row.OutletName.trim();
    }

    if (paymentTerm === "cheque") {
      entry.chequeAmount += value;
    } else if (paymentTerm === "credit") {
      entry.creditAmount += value;
    } else {
      // Default to cash
      entry.cashAmount += value;
    }
  }

  // Convert map to batch save input array
  const result: ReportInvoiceBatchSaveItemInput[] = [];
  for (const [invoiceNo, amounts] of invoiceMap) {
    result.push({
      invoiceNo,
      cashAmount: round2(amounts.cashAmount),
      chequeAmount: round2(amounts.chequeAmount),
      creditAmount: round2(amounts.creditAmount),
      notes: amounts.outletName,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Aggregate inventory sales: sum Qty and valueafterDiscount by ProductID for Invoice rows only
// Returns a Map of productId (UUID) → total sales quantity and actual sales revenue
// ---------------------------------------------------------------------------
function aggregateInventorySales(
  rows: FlatDataRawRow[],
  productCodeMap: Map<string, ProductOption>
): Map<string, { salesQty: number; salesRevenue: number; costedSalesQty: number }> {
  const salesMap = new Map<string, { salesQty: number; salesRevenue: number; costedSalesQty: number }>();

  // Only process "Invoice" type rows
  const invoiceRows = rows.filter((r) => r.Type?.trim().toLowerCase() === "invoice");

  for (const row of invoiceRows) {
    const code = normalizeProductCode(row.ProductID ?? "");
    if (!code) continue;

    const product = productCodeMap.get(code);
    if (!product) continue;

    const qty = parseInt(row.Qty, 10) || 0;
    if (qty <= 0) continue; // Skip zero or negative quantities

    const revenue = Math.abs(parseFloat(row.valueafterDiscount) || 0);
    const costedQty = revenue > 0 ? qty : 0;
    const currentTotal = salesMap.get(product.id) ?? { salesQty: 0, salesRevenue: 0, costedSalesQty: 0 };
    salesMap.set(product.id, {
      salesQty: currentTotal.salesQty + qty,
      salesRevenue: round2(currentTotal.salesRevenue + revenue),
      costedSalesQty: currentTotal.costedSalesQty + costedQty
    });
  }

  return salesMap;
}

// ---------------------------------------------------------------------------
// Extract return/damage entries: filter Return rows, map to damage_qty
// ---------------------------------------------------------------------------
function extractReturnDamageEntries(
  rows: FlatDataRawRow[],
  productCodeMap: Map<string, ProductOption>
): ReportReturnDamageBatchSaveItemInput[] {
  const returnRows = rows.filter((r) => r.Type?.trim().toLowerCase() === "return");

  const result: ReportReturnDamageBatchSaveItemInput[] = [];

  for (const row of returnRows) {
    const code = normalizeProductCode(row.ProductID ?? "");
    if (!code) continue;

    const product = productCodeMap.get(code);
    if (!product) continue;

    // Qty is negative in the CSV for returns; use absolute value
    const qty = Math.abs(parseInt(row.Qty, 10) || 0);
    if (qty <= 0) continue;

    result.push({
      productId: product.id,
      invoiceNo: row.InvoiceId?.trim() || undefined,
      shopName: row.OutletName?.trim() || undefined,
      damageQty: qty, // Per business rule: all returns → damage_qty
      returnQty: 0,
      freeIssueQty: 0,
      notes: row.Retunresoan?.trim() || undefined,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Round to 2 decimal places
// ---------------------------------------------------------------------------
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Main entry point: parse CSV text + validate + aggregate
// ---------------------------------------------------------------------------
export function parseFlatDataCSV(
  csvText: string,
  products: ProductOption[]
): FlatDataParseResult {
  // Step 1: Parse CSV
  const { rows, error } = parseCSV(csvText);

  if (error) {
    return {
      success: false,
      error: { type: "parse_error", message: error },
    };
  }

  if (rows.length === 0) {
    return {
      success: false,
      error: { type: "empty_file", message: "The CSV file contains no data rows." },
    };
  }

  // Step 2: Build product lookup
  const productCodeMap = buildProductCodeMap(products);

  // Step 3: Validate all product codes exist
  const missingCodes = validateProductCodes(rows, productCodeMap);
  if (missingCodes.length > 0) {
    return {
      success: false,
      error: {
        type: "missing_products",
        message: `The following product codes from the CSV do not exist in the system: ${missingCodes.join(", ")}. Please add these products first before importing.`,
        missingProductCodes: missingCodes,
      },
    };
  }

  // Step 4: Aggregate invoices
  const invoiceEntries = aggregateInvoices(rows);

  // Step 5: Aggregate inventory sales
  const inventorySalesMap = aggregateInventorySales(rows, productCodeMap);

  // Step 6: Extract return/damage entries
  const returnDamageEntries = extractReturnDamageEntries(rows, productCodeMap);

  // Step 7: Count delivered bills (distinct invoice IDs where Type = "Invoice")
  const invoiceOnlyRows = rows.filter((r) => r.Type?.trim().toLowerCase() === "invoice");
  const uniqueInvoiceIds = new Set(invoiceOnlyRows.map((r) => r.InvoiceId?.trim()).filter(Boolean));
  const deliveredBillCount = uniqueInvoiceIds.size;

  // Summary stats
  const totalSalesQty = Array.from(inventorySalesMap.values()).reduce((sum, item) => sum + item.salesQty, 0);
  const totalDamageQty = returnDamageEntries.reduce((sum, entry) => sum + entry.damageQty, 0);

  return {
    success: true,
    invoiceEntries,
    inventorySalesMap,
    returnDamageEntries,
    deliveredBillCount,
    summary: {
      totalInvoiceRows: invoiceOnlyRows.length,
      totalReturnRows: rows.filter((r) => r.Type?.trim().toLowerCase() === "return").length,
      uniqueInvoices: uniqueInvoiceIds.size,
      uniqueProducts: inventorySalesMap.size,
      totalSalesQty,
      totalDamageQty,
    },
  };
}

// ---------------------------------------------------------------------------
// Check whether the form already has meaningful data entered
// ---------------------------------------------------------------------------
export function hasExistingFormData(
  invoiceRows: Array<{ id?: string; invoiceNo?: string; cashAmount?: number; chequeAmount?: number; creditAmount?: number }>,
  inventoryRows: Array<{ id?: string; salesQty?: number; salesRevenueSnapshot?: number; costedSalesQtySnapshot?: number }>,
  returnDamageRows: Array<{ id?: string; damageQty?: number; returnQty?: number; freeIssueQty?: number }>
): boolean {
  const hasSavedOrEditedInvoices = invoiceRows.some((r) =>
    Boolean(r.id) ||
    Boolean(r.invoiceNo?.trim()) ||
    (r.cashAmount ?? 0) > 0 ||
    (r.chequeAmount ?? 0) > 0 ||
    (r.creditAmount ?? 0) > 0
  );
  const hasSavedOrEditedInventory = inventoryRows.some((r) =>
    (r.salesQty ?? 0) > 0 ||
    (r.salesRevenueSnapshot ?? 0) > 0 ||
    (r.costedSalesQtySnapshot ?? 0) > 0
  );
  const hasSavedOrEditedReturnDamage = returnDamageRows.some((r) =>
    Boolean(r.id) ||
    (r.damageQty ?? 0) > 0 ||
    (r.returnQty ?? 0) > 0 ||
    (r.freeIssueQty ?? 0) > 0
  );

  return hasSavedOrEditedInvoices || hasSavedOrEditedInventory || hasSavedOrEditedReturnDamage;
}
