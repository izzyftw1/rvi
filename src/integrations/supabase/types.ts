export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      cartons: {
        Row: {
          built_at: string
          built_by: string | null
          carton_id: string
          gross_weight: number
          heat_nos: string[]
          id: string
          labels: Json | null
          net_weight: number
          quantity: number
          wo_id: string
        }
        Insert: {
          built_at?: string
          built_by?: string | null
          carton_id: string
          gross_weight: number
          heat_nos: string[]
          id?: string
          labels?: Json | null
          net_weight: number
          quantity: number
          wo_id: string
        }
        Update: {
          built_at?: string
          built_by?: string | null
          carton_id?: string
          gross_weight?: number
          heat_nos?: string[]
          id?: string
          labels?: Json | null
          net_weight?: number
          quantity?: number
          wo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cartons_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          id: string
          name: string
          type: Database["public"]["Enums"]["department_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          type: Database["public"]["Enums"]["department_type"]
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          type?: Database["public"]["Enums"]["department_type"]
        }
        Relationships: []
      }
      material_lots: {
        Row: {
          alloy: string
          bin_location: string | null
          created_at: string
          gross_weight: number
          heat_no: string
          id: string
          lot_id: string
          mtc_file: string | null
          net_weight: number
          received_by: string | null
          received_date_time: string
          status: Database["public"]["Enums"]["material_status"]
          supplier: string
          updated_at: string
        }
        Insert: {
          alloy: string
          bin_location?: string | null
          created_at?: string
          gross_weight: number
          heat_no: string
          id?: string
          lot_id: string
          mtc_file?: string | null
          net_weight: number
          received_by?: string | null
          received_date_time?: string
          status?: Database["public"]["Enums"]["material_status"]
          supplier: string
          updated_at?: string
        }
        Update: {
          alloy?: string
          bin_location?: string | null
          created_at?: string
          gross_weight?: number
          heat_no?: string
          id?: string
          lot_id?: string
          mtc_file?: string | null
          net_weight?: number
          received_by?: string | null
          received_date_time?: string
          status?: Database["public"]["Enums"]["material_status"]
          supplier?: string
          updated_at?: string
        }
        Relationships: []
      }
      pallet_cartons: {
        Row: {
          carton_id: string
          pallet_id: string
        }
        Insert: {
          carton_id: string
          pallet_id: string
        }
        Update: {
          carton_id?: string
          pallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pallet_cartons_carton_id_fkey"
            columns: ["carton_id"]
            isOneToOne: false
            referencedRelation: "cartons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pallet_cartons_pallet_id_fkey"
            columns: ["pallet_id"]
            isOneToOne: false
            referencedRelation: "pallets"
            referencedColumns: ["id"]
          },
        ]
      }
      pallets: {
        Row: {
          built_at: string
          built_by: string | null
          id: string
          pallet_id: string
        }
        Insert: {
          built_at?: string
          built_by?: string | null
          id?: string
          pallet_id: string
        }
        Update: {
          built_at?: string
          built_by?: string | null
          id?: string
          pallet_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          department_id: string | null
          full_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          full_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      qc_records: {
        Row: {
          approved_by: string | null
          created_at: string
          id: string
          measurements: Json | null
          oes_xrf_file: string | null
          ppap_refs: string[] | null
          qc_date_time: string
          qc_id: string
          qc_type: Database["public"]["Enums"]["qc_type"]
          remarks: string | null
          result: Database["public"]["Enums"]["qc_result"]
          step_id: string | null
          wo_id: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          id?: string
          measurements?: Json | null
          oes_xrf_file?: string | null
          ppap_refs?: string[] | null
          qc_date_time?: string
          qc_id: string
          qc_type: Database["public"]["Enums"]["qc_type"]
          remarks?: string | null
          result: Database["public"]["Enums"]["qc_result"]
          step_id?: string | null
          wo_id: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          id?: string
          measurements?: Json | null
          oes_xrf_file?: string | null
          ppap_refs?: string[] | null
          qc_date_time?: string
          qc_id?: string
          qc_type?: Database["public"]["Enums"]["qc_type"]
          remarks?: string | null
          result?: Database["public"]["Enums"]["qc_result"]
          step_id?: string | null
          wo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qc_records_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "routing_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_records_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      routing_steps: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          created_at: string
          department_id: string | null
          id: string
          name: string
          owner_id: string | null
          planned_end: string | null
          planned_start: string | null
          status: string | null
          step_number: number
          wo_id: string
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          name: string
          owner_id?: string | null
          planned_end?: string | null
          planned_start?: string | null
          status?: string | null
          step_number: number
          wo_id: string
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          planned_end?: string | null
          planned_start?: string | null
          status?: string | null
          step_number?: number
          wo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routing_steps_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routing_steps_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_events: {
        Row: {
          department_id: string | null
          entity_id: string
          entity_type: string
          from_stage: string | null
          id: string
          owner_id: string | null
          photos: string[] | null
          quantity: number | null
          remarks: string | null
          scan_date_time: string
          station: string | null
          to_stage: string
        }
        Insert: {
          department_id?: string | null
          entity_id: string
          entity_type: string
          from_stage?: string | null
          id?: string
          owner_id?: string | null
          photos?: string[] | null
          quantity?: number | null
          remarks?: string | null
          scan_date_time?: string
          station?: string | null
          to_stage: string
        }
        Update: {
          department_id?: string | null
          entity_id?: string
          entity_type?: string
          from_stage?: string | null
          id?: string
          owner_id?: string | null
          photos?: string[] | null
          quantity?: number | null
          remarks?: string | null
          scan_date_time?: string
          station?: string | null
          to_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_events_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_pallets: {
        Row: {
          pallet_id: string
          shipment_id: string
        }
        Insert: {
          pallet_id: string
          shipment_id: string
        }
        Update: {
          pallet_id?: string
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_pallets_pallet_id_fkey"
            columns: ["pallet_id"]
            isOneToOne: false
            referencedRelation: "pallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_pallets_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          coo_file: string | null
          created_at: string
          customer: string
          id: string
          incoterm: string | null
          invoice_file: string | null
          packing_list_file: string | null
          ship_date: string
          ship_id: string
        }
        Insert: {
          coo_file?: string | null
          created_at?: string
          customer: string
          id?: string
          incoterm?: string | null
          invoice_file?: string | null
          packing_list_file?: string | null
          ship_date?: string
          ship_id: string
        }
        Update: {
          coo_file?: string | null
          created_at?: string
          customer?: string
          id?: string
          incoterm?: string | null
          invoice_file?: string | null
          packing_list_file?: string | null
          ship_date?: string
          ship_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wo_material_issues: {
        Row: {
          id: string
          issued_at: string
          issued_by: string | null
          lot_id: string
          quantity_kg: number | null
          quantity_pcs: number | null
          uom: string
          wo_id: string
        }
        Insert: {
          id?: string
          issued_at?: string
          issued_by?: string | null
          lot_id: string
          quantity_kg?: number | null
          quantity_pcs?: number | null
          uom: string
          wo_id: string
        }
        Update: {
          id?: string
          issued_at?: string
          issued_by?: string | null
          lot_id?: string
          quantity_kg?: number | null
          quantity_pcs?: number | null
          uom?: string
          wo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wo_material_issues_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "material_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_material_issues_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          bom: Json | null
          created_at: string
          customer: string
          due_date: string
          id: string
          item_code: string
          priority: number | null
          quantity: number
          revision: string | null
          sales_order: string | null
          status: Database["public"]["Enums"]["wo_status"]
          updated_at: string
          wo_id: string
        }
        Insert: {
          bom?: Json | null
          created_at?: string
          customer: string
          due_date: string
          id?: string
          item_code: string
          priority?: number | null
          quantity: number
          revision?: string | null
          sales_order?: string | null
          status?: Database["public"]["Enums"]["wo_status"]
          updated_at?: string
          wo_id: string
        }
        Update: {
          bom?: Json | null
          created_at?: string
          customer?: string
          due_date?: string
          id?: string
          item_code?: string
          priority?: number | null
          quantity?: number
          revision?: string | null
          sales_order?: string | null
          status?: Database["public"]["Enums"]["wo_status"]
          updated_at?: string
          wo_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "cfo"
        | "director"
        | "stores"
        | "purchase"
        | "production"
        | "quality"
        | "packing"
        | "accounts"
        | "sales"
      department_type:
        | "hr"
        | "stores"
        | "she"
        | "transport"
        | "sales"
        | "purchase"
        | "production"
        | "accounts"
        | "inventory"
        | "quality"
        | "quality_systems"
        | "maintenance"
        | "design"
        | "packing"
      material_status: "received" | "issued" | "in_use" | "consumed"
      qc_result: "pass" | "fail" | "rework"
      qc_type: "first_piece" | "in_process" | "final"
      wo_status:
        | "pending"
        | "in_progress"
        | "qc"
        | "packing"
        | "completed"
        | "shipped"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "cfo",
        "director",
        "stores",
        "purchase",
        "production",
        "quality",
        "packing",
        "accounts",
        "sales",
      ],
      department_type: [
        "hr",
        "stores",
        "she",
        "transport",
        "sales",
        "purchase",
        "production",
        "accounts",
        "inventory",
        "quality",
        "quality_systems",
        "maintenance",
        "design",
        "packing",
      ],
      material_status: ["received", "issued", "in_use", "consumed"],
      qc_result: ["pass", "fail", "rework"],
      qc_type: ["first_piece", "in_process", "final"],
      wo_status: [
        "pending",
        "in_progress",
        "qc",
        "packing",
        "completed",
        "shipped",
      ],
    },
  },
} as const
