export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      customers: {
        Row: {
          id: string;
          organization_id: string;
          code: string;
          name: string;
          channel: "RETAIL" | "WHOLESALE" | "INSTITUTIONAL";
          phone: string | null;
          email: string | null;
          address_line_1: string | null;
          address_line_2: string | null;
          city: string | null;
          status: "ACTIVE" | "INACTIVE";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          code: string;
          name: string;
          channel?: "RETAIL" | "WHOLESALE" | "INSTITUTIONAL";
          phone?: string | null;
          email?: string | null;
          address_line_1?: string | null;
          address_line_2?: string | null;
          city?: string | null;
          status?: "ACTIVE" | "INACTIVE";
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["customers"]["Insert"]>;
        Relationships: [];
      };
      depots: {
        Row: {
          id: string;
          organization_id: string;
          code: string;
          name: string;
          address: string | null;
          cold_storage_capacity_liters: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          code: string;
          name: string;
          address?: string | null;
          cold_storage_capacity_liters?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["depots"]["Insert"]>;
        Relationships: [];
      };
      organization_memberships: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: "OWNER" | "ADMIN" | "OPERATIONS_MANAGER" | "DISPATCHER" | "SALES_COORDINATOR";
          status: "ACTIVE" | "INVITED" | "DISABLED";
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          role?: "OWNER" | "ADMIN" | "OPERATIONS_MANAGER" | "DISPATCHER" | "SALES_COORDINATOR";
          status?: "ACTIVE" | "INVITED" | "DISABLED";
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["organization_memberships"]["Insert"]>;
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          code: string;
          legal_name: string;
          display_name: string;
          timezone: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          legal_name: string;
          display_name: string;
          timezone?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["organizations"]["Insert"]>;
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          organization_id: string;
          sku: string | null;
          name: string;
          category: "MILK" | "YOGURT" | "CHEESE" | "BUTTER" | "ICE_CREAM" | "OTHER" | null;
          unit_of_measure: "LITER" | "MILLILITER" | "KILOGRAM" | "GRAM" | "UNIT" | "CRATE";
          base_price: number;
          cold_chain_required: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          product_code: string;
          product_name: string;
          unit_price: number;
          brand: string | null;
          product_family: string;
          variant: string | null;
          unit_size: number | null;
          unit_measure: string | null;
          pack_size: number | null;
          selling_unit: string | null;
          quantity_entry_mode: "pack" | "unit";
          display_name: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          sku?: string | null;
          name: string;
          category?: "MILK" | "YOGURT" | "CHEESE" | "BUTTER" | "ICE_CREAM" | "OTHER" | null;
          unit_of_measure: "LITER" | "MILLILITER" | "KILOGRAM" | "GRAM" | "UNIT" | "CRATE";
          base_price: number;
          cold_chain_required?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          product_code: string;
          product_name: string;
          unit_price: number;
          brand?: string | null;
          product_family: string;
          variant?: string | null;
          unit_size?: number | null;
          unit_measure?: string | null;
          pack_size?: number | null;
          selling_unit?: string | null;
          quantity_entry_mode?: "pack" | "unit";
          display_name?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["products"]["Insert"]>;
        Relationships: [];
      };
      route_programs: {
        Row: {
          id: string;
          organization_id: string;
          territory_name: string;
          day_of_week: number;
          frequency_label: string;
          route_name: string;
          route_description: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          territory_name: string;
          day_of_week: number;
          frequency_label: string;
          route_name: string;
          route_description?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["route_programs"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          phone: string | null;
          avatar_path: string | null;
          role: "admin" | "supervisor" | "driver" | "cashier";
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          phone?: string | null;
          avatar_path?: string | null;
          role?: "admin" | "supervisor" | "driver" | "cashier";
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      daily_reports: {
        Row: {
          id: string;
          report_date: string;
          route_program_id: string;
          prepared_by: string;
          staff_name: string;
          territory_name_snapshot: string;
          route_name_snapshot: string;
          loading_completed_at: string | null;
          loading_completed_by: string | null;
          loading_notes: string | null;
          status: "draft" | "submitted" | "approved" | "rejected";
          remarks: string | null;
          total_cash: number;
          total_cheques: number;
          total_credit: number;
          total_expenses: number;
          day_sale_total: number;
          total_sale: number;
          db_margin_percent: number;
          db_margin_value: number;
          net_profit: number;
          cash_in_hand: number;
          cash_in_bank: number;
          cash_book_total: number;
          cash_physical_total: number;
          cash_difference: number;
          total_bill_count: number;
          delivered_bill_count: number;
          cancelled_bill_count: number;
          rejection_reason: string | null;
          submitted_at: string | null;
          submitted_by: string | null;
          approved_at: string | null;
          approved_by: string | null;
          rejected_at: string | null;
          rejected_by: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          report_date: string;
          route_program_id: string;
          prepared_by: string;
          staff_name: string;
          territory_name_snapshot: string;
          route_name_snapshot: string;
          loading_completed_at?: string | null;
          loading_completed_by?: string | null;
          loading_notes?: string | null;
          status?: "draft" | "submitted" | "approved" | "rejected";
          remarks?: string | null;
          total_cash?: number;
          total_cheques?: number;
          total_credit?: number;
          total_expenses?: number;
          day_sale_total?: number;
          total_sale?: number;
          db_margin_percent?: number;
          db_margin_value?: number;
          net_profit?: number;
          cash_in_hand?: number;
          cash_in_bank?: number;
          cash_book_total?: number;
          cash_physical_total?: number;
          cash_difference?: number;
          total_bill_count?: number;
          delivered_bill_count?: number;
          cancelled_bill_count?: number;
          rejection_reason?: string | null;
          submitted_at?: string | null;
          submitted_by?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          rejected_at?: string | null;
          rejected_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["daily_reports"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      product_structuring_backfill_review: {
        Row: {
          id: string;
          organization_id: string;
          product_code: string;
          product_name: string;
          display_name: string | null;
          product_family: string;
          variant: string | null;
          unit_size: number | null;
          unit_measure: string | null;
          pack_size: number | null;
          selling_unit: string | null;
          migration_status: string;
        };
      };
    };
    Functions: {
      current_user_organization_ids: {
        Args: Record<string, never>;
        Returns: string[];
      };
      current_user_role: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_supervisor: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_driver: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      submit_daily_report: {
        Args: { target_report_id: string };
        Returns: Database["public"]["Tables"]["daily_reports"]["Row"];
      };
      approve_daily_report: {
        Args: { target_report_id: string };
        Returns: Database["public"]["Tables"]["daily_reports"]["Row"];
      };
      reject_daily_report: {
        Args: { target_report_id: string; reason: string };
        Returns: Database["public"]["Tables"]["daily_reports"]["Row"];
      };
      reopen_daily_report: {
        Args: { target_report_id: string };
        Returns: Database["public"]["Tables"]["daily_reports"]["Row"];
      };
      parse_legacy_product_pack_pattern: {
        Args: { raw_name: string };
        Returns: {
          parsed_family: string | null;
          parsed_unit_size: number | null;
          parsed_unit_measure: string | null;
          parsed_pack_size: number | null;
          confidence: string | null;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type TableRow<TableName extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][TableName]["Row"];

export type TableInsert<TableName extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][TableName]["Insert"];

export type TableUpdate<TableName extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][TableName]["Update"];










