import type { Database } from "@/types/database";

export type ProductRecord = Database["public"]["Tables"]["products"]["Row"];
export type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
export type ProductUpdate = Database["public"]["Tables"]["products"]["Update"];

export type ProductCategory = ProductRecord["category"];
export type ProductUnitMeasure = ProductRecord["unit_measure"];
export type ProductSellingUnit = ProductRecord["selling_unit"];
export type ProductQuantityEntryMode = ProductRecord["quantity_entry_mode"];
