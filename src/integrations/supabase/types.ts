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
      capa: {
        Row: {
          action_type: string
          assigned_to: string | null
          capa_id: string
          completion_date: string | null
          created_at: string
          due_date: string
          effectiveness_verified: boolean | null
          id: string
          incident_id: string | null
          issue_description: string
          status: string
        }
        Insert: {
          action_type: string
          assigned_to?: string | null
          capa_id: string
          completion_date?: string | null
          created_at?: string
          due_date: string
          effectiveness_verified?: boolean | null
          id?: string
          incident_id?: string | null
          issue_description: string
          status?: string
        }
        Update: {
          action_type?: string
          assigned_to?: string | null
          capa_id?: string
          completion_date?: string | null
          created_at?: string
          due_date?: string
          effectiveness_verified?: boolean | null
          id?: string
          incident_id?: string | null
          issue_description?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "capa_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "she_incidents"
            referencedColumns: ["id"]
          },
        ]
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
      customer_master: {
        Row: {
          created_at: string | null
          customer_name: string
          id: string
          last_used: string | null
          party_code: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customer_name: string
          id?: string
          last_used?: string | null
          party_code?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customer_name?: string
          id?: string
          last_used?: string | null
          party_code?: string | null
          updated_at?: string | null
        }
        Relationships: []
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
      design_files: {
        Row: {
          change_notes: string | null
          created_at: string | null
          file_name: string
          file_path: string
          file_type: string
          id: string
          is_latest: boolean | null
          uploaded_at: string | null
          uploaded_by: string | null
          version: number
          wo_id: string
        }
        Insert: {
          change_notes?: string | null
          created_at?: string | null
          file_name: string
          file_path: string
          file_type: string
          id?: string
          is_latest?: boolean | null
          uploaded_at?: string | null
          uploaded_by?: string | null
          version?: number
          wo_id: string
        }
        Update: {
          change_notes?: string | null
          created_at?: string | null
          file_name?: string
          file_path?: string
          file_type?: string
          id?: string
          is_latest?: boolean | null
          uploaded_at?: string | null
          uploaded_by?: string | null
          version?: number
          wo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "design_files_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      dimension_tolerances: {
        Row: {
          created_at: string
          created_by: string | null
          dimensions: Json
          id: string
          item_code: string
          operation: Database["public"]["Enums"]["operation_letter"]
          revision: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dimensions?: Json
          id?: string
          item_code: string
          operation?: Database["public"]["Enums"]["operation_letter"]
          revision?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dimensions?: Json
          id?: string
          item_code?: string
          operation?: Database["public"]["Enums"]["operation_letter"]
          revision?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      environmental_metrics: {
        Row: {
          created_at: string
          department_id: string | null
          emissions_co2_kg: number | null
          energy_kwh: number | null
          id: string
          metric_date: string
          recycled_waste_kg: number | null
          waste_kg: number | null
          water_liters: number | null
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          emissions_co2_kg?: number | null
          energy_kwh?: number | null
          id?: string
          metric_date: string
          recycled_waste_kg?: number | null
          waste_kg?: number | null
          water_liters?: number | null
        }
        Update: {
          created_at?: string
          department_id?: string | null
          emissions_co2_kg?: number | null
          energy_kwh?: number | null
          id?: string
          metric_date?: string
          recycled_waste_kg?: number | null
          waste_kg?: number | null
          water_liters?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "environmental_metrics_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      factory_calendar_exceptions: {
        Row: {
          created_at: string | null
          created_by: string | null
          exception_date: string
          id: string
          is_working: boolean
          override_shift_end: string | null
          override_shift_start: string | null
          reason: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          exception_date: string
          id?: string
          is_working?: boolean
          override_shift_end?: string | null
          override_shift_start?: string | null
          reason?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          exception_date?: string
          id?: string
          is_working?: boolean
          override_shift_end?: string | null
          override_shift_start?: string | null
          reason?: string | null
        }
        Relationships: []
      }
      factory_calendar_settings: {
        Row: {
          break_1_end: string | null
          break_1_start: string | null
          break_2_end: string | null
          break_2_start: string | null
          created_at: string | null
          day_name: string
          day_shift_end: string | null
          day_shift_start: string | null
          id: string
          night_shift_end: string | null
          night_shift_start: string | null
          overtime_allowed: boolean | null
          updated_at: string | null
          working: boolean | null
        }
        Insert: {
          break_1_end?: string | null
          break_1_start?: string | null
          break_2_end?: string | null
          break_2_start?: string | null
          created_at?: string | null
          day_name: string
          day_shift_end?: string | null
          day_shift_start?: string | null
          id?: string
          night_shift_end?: string | null
          night_shift_start?: string | null
          overtime_allowed?: boolean | null
          updated_at?: string | null
          working?: boolean | null
        }
        Update: {
          break_1_end?: string | null
          break_1_start?: string | null
          break_2_end?: string | null
          break_2_start?: string | null
          created_at?: string | null
          day_name?: string
          day_shift_end?: string | null
          day_shift_start?: string | null
          id?: string
          night_shift_end?: string | null
          night_shift_start?: string | null
          overtime_allowed?: boolean | null
          updated_at?: string | null
          working?: boolean | null
        }
        Relationships: []
      }
      hourly_qc_checks: {
        Row: {
          check_datetime: string
          created_at: string
          dimensions: Json
          id: string
          machine_id: string
          operation: Database["public"]["Enums"]["operation_letter"]
          operator_id: string | null
          out_of_tolerance_dimensions: string[] | null
          plating_status: string | null
          plating_thickness_status: string | null
          remarks: string | null
          status: string
          thread_status: string | null
          visual_status: string | null
          wo_id: string
        }
        Insert: {
          check_datetime?: string
          created_at?: string
          dimensions?: Json
          id?: string
          machine_id: string
          operation?: Database["public"]["Enums"]["operation_letter"]
          operator_id?: string | null
          out_of_tolerance_dimensions?: string[] | null
          plating_status?: string | null
          plating_thickness_status?: string | null
          remarks?: string | null
          status?: string
          thread_status?: string | null
          visual_status?: string | null
          wo_id: string
        }
        Update: {
          check_datetime?: string
          created_at?: string
          dimensions?: Json
          id?: string
          machine_id?: string
          operation?: Database["public"]["Enums"]["operation_letter"]
          operator_id?: string | null
          out_of_tolerance_dimensions?: string[] | null
          plating_status?: string | null
          plating_thickness_status?: string | null
          remarks?: string | null
          status?: string
          thread_status?: string | null
          visual_status?: string | null
          wo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hourly_qc_checks_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hourly_qc_checks_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_lots: {
        Row: {
          alloy: string
          cost_rate: number | null
          created_at: string
          heat_no: string | null
          id: string
          lot_id: string
          material_size_mm: string
          qty_kg: number
          received_date: string
          rpo_id: string | null
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          alloy: string
          cost_rate?: number | null
          created_at?: string
          heat_no?: string | null
          id?: string
          lot_id: string
          material_size_mm: string
          qty_kg: number
          received_date?: string
          rpo_id?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          alloy?: string
          cost_rate?: number | null
          created_at?: string
          heat_no?: string | null
          id?: string
          lot_id?: string
          material_size_mm?: string
          qty_kg?: number
          received_date?: string
          rpo_id?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lots_rpo_id_fkey"
            columns: ["rpo_id"]
            isOneToOne: false
            referencedRelation: "raw_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      item_master: {
        Row: {
          alloy: string | null
          created_at: string | null
          cycle_time_seconds: number | null
          gross_weight_grams: number | null
          id: string
          item_code: string
          last_used: string | null
          material_size_mm: string | null
          net_weight_grams: number | null
          updated_at: string | null
        }
        Insert: {
          alloy?: string | null
          created_at?: string | null
          cycle_time_seconds?: number | null
          gross_weight_grams?: number | null
          id?: string
          item_code: string
          last_used?: string | null
          material_size_mm?: string | null
          net_weight_grams?: number | null
          updated_at?: string | null
        }
        Update: {
          alloy?: string | null
          created_at?: string | null
          cycle_time_seconds?: number | null
          gross_weight_grams?: number | null
          id?: string
          item_code?: string
          last_used?: string | null
          material_size_mm?: string | null
          net_weight_grams?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      laser_marking: {
        Row: {
          carton_id: string | null
          id: string
          marked_at: string | null
          marked_by: string | null
          marking_details: Json
          station: string | null
        }
        Insert: {
          carton_id?: string | null
          id?: string
          marked_at?: string | null
          marked_by?: string | null
          marking_details: Json
          station?: string | null
        }
        Update: {
          carton_id?: string | null
          id?: string
          marked_at?: string | null
          marked_by?: string | null
          marking_details?: Json
          station?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "laser_marking_carton_id_fkey"
            columns: ["carton_id"]
            isOneToOne: false
            referencedRelation: "cartons"
            referencedColumns: ["id"]
          },
        ]
      }
      logistics_costs: {
        Row: {
          cost_amount: number
          cost_per_kg: number | null
          created_at: string
          currency: string | null
          id: string
          lane: string
          mode: string
          shipment_id: string
        }
        Insert: {
          cost_amount: number
          cost_per_kg?: number | null
          created_at?: string
          currency?: string | null
          id?: string
          lane: string
          mode: string
          shipment_id: string
        }
        Update: {
          cost_amount?: number
          cost_per_kg?: number | null
          created_at?: string
          currency?: string | null
          id?: string
          lane?: string
          mode?: string
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "logistics_costs_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      machines: {
        Row: {
          created_at: string
          current_job_start: string | null
          current_operator_id: string | null
          current_wo_id: string | null
          department_id: string | null
          estimated_completion: string | null
          id: string
          location: string | null
          machine_id: string
          name: string
          operator_id: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_job_start?: string | null
          current_operator_id?: string | null
          current_wo_id?: string | null
          department_id?: string | null
          estimated_completion?: string | null
          id?: string
          location?: string | null
          machine_id: string
          name: string
          operator_id?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_job_start?: string | null
          current_operator_id?: string | null
          current_wo_id?: string | null
          department_id?: string | null
          estimated_completion?: string | null
          id?: string
          location?: string | null
          machine_id?: string
          name?: string
          operator_id?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "machines_current_wo_id_fkey"
            columns: ["current_wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machines_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machines_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_logs: {
        Row: {
          created_at: string | null
          downtime_reason: string
          end_time: string | null
          id: string
          logged_by: string | null
          machine_id: string
          start_time: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          downtime_reason: string
          end_time?: string | null
          id?: string
          logged_by?: string | null
          machine_id: string
          start_time: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          downtime_reason?: string
          end_time?: string | null
          id?: string
          logged_by?: string | null
          machine_id?: string
          start_time?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_logs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
        ]
      }
      material_costs: {
        Row: {
          cost_per_kg: number
          created_at: string
          currency: string | null
          id: string
          lme_copper_price: number | null
          lot_id: string
          total_cost: number
        }
        Insert: {
          cost_per_kg: number
          created_at?: string
          currency?: string | null
          id?: string
          lme_copper_price?: number | null
          lot_id: string
          total_cost: number
        }
        Update: {
          cost_per_kg?: number
          created_at?: string
          currency?: string | null
          id?: string
          lme_copper_price?: number | null
          lot_id?: string
          total_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "material_costs_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "material_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      material_issues: {
        Row: {
          created_at: string
          id: string
          issued_at: string
          issued_by: string | null
          lot_id: string
          quantity_kg: number
          quantity_pcs: number | null
          uom: string
          wo_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          lot_id: string
          quantity_kg: number
          quantity_pcs?: number | null
          uom?: string
          wo_id: string
        }
        Update: {
          created_at?: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          lot_id?: string
          quantity_kg?: number
          quantity_pcs?: number | null
          uom?: string
          wo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_issues_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "material_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_issues_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
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
          material_size_mm: string | null
          mtc_file: string | null
          net_weight: number
          po_id: string | null
          qc_status: string | null
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
          material_size_mm?: string | null
          mtc_file?: string | null
          net_weight: number
          po_id?: string | null
          qc_status?: string | null
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
          material_size_mm?: string | null
          mtc_file?: string | null
          net_weight?: number
          po_id?: string | null
          qc_status?: string | null
          received_by?: string | null
          received_date_time?: string
          status?: Database["public"]["Enums"]["material_status"]
          supplier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_lots_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      material_requirements: {
        Row: {
          created_at: string | null
          id: string
          material_size_mm: number
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          material_size_mm: number
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          material_size_mm?: number
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      non_consumable_usage: {
        Row: {
          created_at: string
          department_id: string | null
          id: string
          item_id: string
          quantity_used: number
          usage_date: string
          used_by: string | null
          wo_id: string | null
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          id?: string
          item_id: string
          quantity_used: number
          usage_date?: string
          used_by?: string | null
          wo_id?: string | null
        }
        Update: {
          created_at?: string
          department_id?: string | null
          id?: string
          item_id?: string
          quantity_used?: number
          usage_date?: string
          used_by?: string | null
          wo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "non_consumable_usage_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "non_consumable_usage_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "non_consumables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "non_consumable_usage_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      non_consumables: {
        Row: {
          category: string
          created_at: string
          department_id: string | null
          id: string
          item_id: string
          item_name: string
          last_purchased: string | null
          max_stock_level: number | null
          quantity: number
          reorder_level: number | null
          supplier: string | null
          unit: string
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          department_id?: string | null
          id?: string
          item_id: string
          item_name: string
          last_purchased?: string | null
          max_stock_level?: number | null
          quantity?: number
          reorder_level?: number | null
          supplier?: string | null
          unit: string
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          department_id?: string | null
          id?: string
          item_id?: string
          item_name?: string
          last_purchased?: string | null
          max_stock_level?: number | null
          quantity?: number
          reorder_level?: number | null
          supplier?: string | null
          unit?: string
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "non_consumables_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          message: string
          read: boolean | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message: string
          read?: boolean | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message?: string
          read?: boolean | null
          title?: string
          type?: string
          user_id?: string | null
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
      ppe_inventory: {
        Row: {
          category: string
          created_at: string
          expiry_date: string | null
          id: string
          issue_date: string | null
          issued_to: string | null
          item_name: string
          ppe_id: string
          quantity: number | null
          status: string
        }
        Insert: {
          category: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          issue_date?: string | null
          issued_to?: string | null
          item_name: string
          ppe_id: string
          quantity?: number | null
          status?: string
        }
        Update: {
          category?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          issue_date?: string | null
          issued_to?: string | null
          item_name?: string
          ppe_id?: string
          quantity?: number | null
          status?: string
        }
        Relationships: []
      }
      processing_costs: {
        Row: {
          cost_amount: number
          cost_type: string
          created_at: string
          currency: string | null
          department_id: string | null
          description: string | null
          id: string
          wo_id: string | null
        }
        Insert: {
          cost_amount: number
          cost_type: string
          created_at?: string
          currency?: string | null
          department_id?: string | null
          description?: string | null
          id?: string
          wo_id?: string | null
        }
        Update: {
          cost_amount?: number
          cost_type?: string
          created_at?: string
          currency?: string | null
          department_id?: string | null
          description?: string | null
          id?: string
          wo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "processing_costs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processing_costs_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      production_logs: {
        Row: {
          created_at: string
          id: string
          log_timestamp: string
          machine_id: string
          operator_id: string | null
          quantity_completed: number
          quantity_scrap: number
          remarks: string | null
          shift: string | null
          wo_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          log_timestamp?: string
          machine_id: string
          operator_id?: string | null
          quantity_completed?: number
          quantity_scrap?: number
          remarks?: string | null
          shift?: string | null
          wo_id: string
        }
        Update: {
          created_at?: string
          id?: string
          log_timestamp?: string
          machine_id?: string
          operator_id?: string | null
          quantity_completed?: number
          quantity_scrap?: number
          remarks?: string | null
          shift?: string | null
          wo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_logs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_logs_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          department_id: string | null
          full_name: string
          id: string
          is_active: boolean | null
          last_login: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          full_name: string
          id: string
          is_active?: boolean | null
          last_login?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          last_login?: string | null
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
      purchase_orders: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          created_by: string | null
          expected_delivery: string | null
          id: string
          last_received_at: string | null
          linked_sales_orders: Json | null
          material_size_mm: string | null
          material_spec: Json
          po_id: string
          quantity_kg: number
          quantity_received_kg: number | null
          so_id: string | null
          status: string
          supplier: string | null
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          expected_delivery?: string | null
          id?: string
          last_received_at?: string | null
          linked_sales_orders?: Json | null
          material_size_mm?: string | null
          material_spec: Json
          po_id: string
          quantity_kg: number
          quantity_received_kg?: number | null
          so_id?: string | null
          status?: string
          supplier?: string | null
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          expected_delivery?: string | null
          id?: string
          last_received_at?: string | null
          linked_sales_orders?: Json | null
          material_size_mm?: string | null
          material_spec?: Json
          po_id?: string
          quantity_kg?: number
          quantity_received_kg?: number | null
          so_id?: string | null
          status?: string
          supplier?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_so_id_fkey"
            columns: ["so_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_settings: {
        Row: {
          created_at: string
          id: string
          rate_variance_tolerance_percent: number
          require_reason_on_override: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          rate_variance_tolerance_percent?: number
          require_reason_on_override?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          rate_variance_tolerance_percent?: number
          require_reason_on_override?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
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
      raw_po_receipts: {
        Row: {
          amount_on_invoice: number | null
          created_at: string
          gi_ref: string | null
          id: string
          lr_no: string | null
          notes: string | null
          qty_received_kg: number
          rate_on_invoice: number | null
          received_date: string
          rpo_id: string
          supplier_invoice_date: string | null
          supplier_invoice_no: string | null
          transporter: string | null
        }
        Insert: {
          amount_on_invoice?: number | null
          created_at?: string
          gi_ref?: string | null
          id?: string
          lr_no?: string | null
          notes?: string | null
          qty_received_kg: number
          rate_on_invoice?: number | null
          received_date?: string
          rpo_id: string
          supplier_invoice_date?: string | null
          supplier_invoice_no?: string | null
          transporter?: string | null
        }
        Update: {
          amount_on_invoice?: number | null
          created_at?: string
          gi_ref?: string | null
          id?: string
          lr_no?: string | null
          notes?: string | null
          qty_received_kg?: number
          rate_on_invoice?: number | null
          received_date?: string
          rpo_id?: string
          supplier_invoice_date?: string | null
          supplier_invoice_no?: string | null
          transporter?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_po_receipts_gi_ref_fkey"
            columns: ["gi_ref"]
            isOneToOne: false
            referencedRelation: "material_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_po_receipts_rpo_id_fkey"
            columns: ["rpo_id"]
            isOneToOne: false
            referencedRelation: "raw_purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_po_reconciliations: {
        Row: {
          amount_delta: number | null
          created_at: string
          id: string
          notes: string | null
          qty_delta_kg: number | null
          rate_delta: number | null
          reason: Database["public"]["Enums"]["reconciliation_reason"]
          resolution: Database["public"]["Enums"]["reconciliation_resolution"]
          resolution_ref: string | null
          resolved_at: string | null
          resolved_by: string | null
          rpo_id: string
        }
        Insert: {
          amount_delta?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          qty_delta_kg?: number | null
          rate_delta?: number | null
          reason: Database["public"]["Enums"]["reconciliation_reason"]
          resolution?: Database["public"]["Enums"]["reconciliation_resolution"]
          resolution_ref?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rpo_id: string
        }
        Update: {
          amount_delta?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          qty_delta_kg?: number | null
          rate_delta?: number | null
          reason?: Database["public"]["Enums"]["reconciliation_reason"]
          resolution?: Database["public"]["Enums"]["reconciliation_resolution"]
          resolution_ref?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rpo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_po_reconciliations_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_po_reconciliations_rpo_id_fkey"
            columns: ["rpo_id"]
            isOneToOne: false
            referencedRelation: "raw_purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_purchase_orders: {
        Row: {
          alloy: string | null
          amount_ordered: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          expected_delivery_date: string | null
          id: string
          item_code: string | null
          material_size_mm: string | null
          qty_ordered_kg: number
          rate_per_kg: number
          remarks: string | null
          rpo_no: string
          so_id: string | null
          status: Database["public"]["Enums"]["rpo_status"]
          supplier_id: string | null
          updated_at: string
          wo_id: string | null
        }
        Insert: {
          alloy?: string | null
          amount_ordered: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          expected_delivery_date?: string | null
          id?: string
          item_code?: string | null
          material_size_mm?: string | null
          qty_ordered_kg: number
          rate_per_kg: number
          remarks?: string | null
          rpo_no: string
          so_id?: string | null
          status?: Database["public"]["Enums"]["rpo_status"]
          supplier_id?: string | null
          updated_at?: string
          wo_id?: string | null
        }
        Update: {
          alloy?: string | null
          amount_ordered?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          expected_delivery_date?: string | null
          id?: string
          item_code?: string | null
          material_size_mm?: string | null
          qty_ordered_kg?: number
          rate_per_kg?: number
          remarks?: string | null
          rpo_no?: string
          so_id?: string | null
          status?: Database["public"]["Enums"]["rpo_status"]
          supplier_id?: string | null
          updated_at?: string
          wo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_purchase_orders_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_purchase_orders_so_id_fkey"
            columns: ["so_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_purchase_orders_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          can_approve: boolean | null
          can_create: boolean | null
          can_delete: boolean | null
          can_edit: boolean | null
          can_export: boolean | null
          can_view: boolean | null
          created_at: string | null
          id: string
          module: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          can_approve?: boolean | null
          can_create?: boolean | null
          can_delete?: boolean | null
          can_edit?: boolean | null
          can_export?: boolean | null
          can_view?: boolean | null
          created_at?: string | null
          id?: string
          module: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          can_approve?: boolean | null
          can_create?: boolean | null
          can_delete?: boolean | null
          can_edit?: boolean | null
          can_export?: boolean | null
          can_view?: boolean | null
          created_at?: string | null
          id?: string
          module?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      routing_steps: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          consumed_qty: number | null
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
          consumed_qty?: number | null
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
          consumed_qty?: number | null
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
      sales_order_line_items: {
        Row: {
          alloy: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          cycle_time_seconds: number | null
          due_date: string
          gross_weight_per_pc_grams: number | null
          id: string
          item_code: string
          line_number: number
          material_size_mm: string | null
          net_weight_per_pc_grams: number | null
          notes: string | null
          quantity: number
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          sales_order_id: string
          status: string
          updated_at: string
          work_order_id: string | null
        }
        Insert: {
          alloy: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          cycle_time_seconds?: number | null
          due_date: string
          gross_weight_per_pc_grams?: number | null
          id?: string
          item_code: string
          line_number: number
          material_size_mm?: string | null
          net_weight_per_pc_grams?: number | null
          notes?: string | null
          quantity: number
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          sales_order_id: string
          status?: string
          updated_at?: string
          work_order_id?: string | null
        }
        Update: {
          alloy?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          cycle_time_seconds?: number | null
          due_date?: string
          gross_weight_per_pc_grams?: number | null
          id?: string
          item_code?: string
          line_number?: number
          material_size_mm?: string | null
          net_weight_per_pc_grams?: number | null
          notes?: string | null
          quantity?: number
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          sales_order_id?: string
          status?: string
          updated_at?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_line_items_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_line_items_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_line_items_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_line_items_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          created_by: string | null
          customer: string
          cycle_time_seconds: number | null
          gross_weight_per_pc_grams: number | null
          id: string
          items: Json
          material_rod_forging_size_mm: string | null
          net_weight_per_pc_grams: number | null
          party_code: string | null
          po_date: string
          po_number: string
          so_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          customer: string
          cycle_time_seconds?: number | null
          gross_weight_per_pc_grams?: number | null
          id?: string
          items: Json
          material_rod_forging_size_mm?: string | null
          net_weight_per_pc_grams?: number | null
          party_code?: string | null
          po_date: string
          po_number: string
          so_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          customer?: string
          cycle_time_seconds?: number | null
          gross_weight_per_pc_grams?: number | null
          id?: string
          items?: Json
          material_rod_forging_size_mm?: string | null
          net_weight_per_pc_grams?: number | null
          party_code?: string | null
          po_date?: string
          po_number?: string
          so_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: []
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
      she_incidents: {
        Row: {
          closed_at: string | null
          corrective_actions: string | null
          created_at: string
          department_id: string | null
          description: string
          id: string
          incident_date: string
          incident_id: string
          incident_type: string
          injured_person: string | null
          lost_time_hours: number | null
          reported_by: string | null
          root_cause: string | null
          severity: string
          status: string
        }
        Insert: {
          closed_at?: string | null
          corrective_actions?: string | null
          created_at?: string
          department_id?: string | null
          description: string
          id?: string
          incident_date?: string
          incident_id: string
          incident_type: string
          injured_person?: string | null
          lost_time_hours?: number | null
          reported_by?: string | null
          root_cause?: string | null
          severity: string
          status?: string
        }
        Update: {
          closed_at?: string | null
          corrective_actions?: string | null
          created_at?: string
          department_id?: string | null
          description?: string
          id?: string
          incident_date?: string
          incident_id?: string
          incident_type?: string
          injured_person?: string | null
          lost_time_hours?: number | null
          reported_by?: string | null
          root_cause?: string | null
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "she_incidents_department_id_fkey"
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
      suppliers: {
        Row: {
          contact_name: string | null
          created_at: string
          currency: string | null
          email: string | null
          gst_number: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          currency?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          currency?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      training_records: {
        Row: {
          created_at: string
          expiry_date: string | null
          id: string
          status: string
          trainer: string | null
          training_date: string
          training_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expiry_date?: string | null
          id?: string
          status?: string
          trainer?: string | null
          training_date: string
          training_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          expiry_date?: string | null
          id?: string
          status?: string
          trainer?: string | null
          training_date?: string
          training_type?: string
          user_id?: string
        }
        Relationships: []
      }
      user_audit_log: {
        Row: {
          action_details: Json | null
          action_type: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          module: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action_details?: Json | null
          action_type: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          module: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action_details?: Json | null
          action_type?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          module?: string
          user_agent?: string | null
          user_id?: string | null
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
      wo_actions_log: {
        Row: {
          action_details: Json
          action_type: string
          created_at: string
          department: string
          entity_reference: string | null
          id: string
          performed_by: string | null
          reference_type: string | null
          wo_id: string
        }
        Insert: {
          action_details?: Json
          action_type: string
          created_at?: string
          department: string
          entity_reference?: string | null
          id?: string
          performed_by?: string | null
          reference_type?: string | null
          wo_id: string
        }
        Update: {
          action_details?: Json
          action_type?: string
          created_at?: string
          department?: string
          entity_reference?: string | null
          id?: string
          performed_by?: string | null
          reference_type?: string | null
          wo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wo_actions_log_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      wo_machine_assignments: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          assigned_at: string
          assigned_by: string | null
          created_at: string
          id: string
          machine_id: string
          notes: string | null
          original_cycle_time_seconds: number | null
          override_applied_at: string | null
          override_applied_by: string | null
          override_cycle_time_seconds: number | null
          priority: number | null
          quantity_allocated: number
          scheduled_end: string
          scheduled_start: string
          status: string
          updated_at: string
          wo_id: string
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          id?: string
          machine_id: string
          notes?: string | null
          original_cycle_time_seconds?: number | null
          override_applied_at?: string | null
          override_applied_by?: string | null
          override_cycle_time_seconds?: number | null
          priority?: number | null
          quantity_allocated: number
          scheduled_end: string
          scheduled_start: string
          status?: string
          updated_at?: string
          wo_id: string
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          id?: string
          machine_id?: string
          notes?: string | null
          original_cycle_time_seconds?: number | null
          override_applied_at?: string | null
          override_applied_by?: string | null
          override_cycle_time_seconds?: number | null
          priority?: number | null
          quantity_allocated?: number
          scheduled_end?: string
          scheduled_start?: string
          status?: string
          updated_at?: string
          wo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wo_machine_assignments_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_machine_assignments_override_applied_by_fkey"
            columns: ["override_applied_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_machine_assignments_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
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
      wo_stage_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          created_at: string
          from_stage: Database["public"]["Enums"]["wo_stage"] | null
          id: string
          is_override: boolean | null
          reason: string | null
          to_stage: Database["public"]["Enums"]["wo_stage"]
          wo_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          created_at?: string
          from_stage?: Database["public"]["Enums"]["wo_stage"] | null
          id?: string
          is_override?: boolean | null
          reason?: string | null
          to_stage: Database["public"]["Enums"]["wo_stage"]
          wo_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          created_at?: string
          from_stage?: Database["public"]["Enums"]["wo_stage"] | null
          id?: string
          is_override?: boolean | null
          reason?: string | null
          to_stage?: Database["public"]["Enums"]["wo_stage"]
          wo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wo_stage_history_wo_id_fkey"
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
          current_stage: Database["public"]["Enums"]["wo_stage"] | null
          customer: string
          customer_po: string | null
          cycle_time_seconds: number | null
          dispatch_allowed: boolean | null
          display_id: string | null
          due_date: string
          gross_weight_per_pc: number | null
          id: string
          item_code: string
          material_size_mm: string | null
          net_weight_per_pc: number | null
          production_allowed: boolean | null
          qc_first_piece_approved_at: string | null
          qc_first_piece_approved_by: string | null
          qc_first_piece_passed: boolean
          qc_material_approved_at: string | null
          qc_material_approved_by: string | null
          qc_material_passed: boolean
          quantity: number
          revision: string | null
          sales_order: string | null
          so_id: string | null
          status: Database["public"]["Enums"]["wo_status"]
          updated_at: string
          wo_id: string | null
        }
        Insert: {
          bom?: Json | null
          created_at?: string
          current_stage?: Database["public"]["Enums"]["wo_stage"] | null
          customer: string
          customer_po?: string | null
          cycle_time_seconds?: number | null
          dispatch_allowed?: boolean | null
          display_id?: string | null
          due_date: string
          gross_weight_per_pc?: number | null
          id?: string
          item_code: string
          material_size_mm?: string | null
          net_weight_per_pc?: number | null
          production_allowed?: boolean | null
          qc_first_piece_approved_at?: string | null
          qc_first_piece_approved_by?: string | null
          qc_first_piece_passed?: boolean
          qc_material_approved_at?: string | null
          qc_material_approved_by?: string | null
          qc_material_passed?: boolean
          quantity: number
          revision?: string | null
          sales_order?: string | null
          so_id?: string | null
          status?: Database["public"]["Enums"]["wo_status"]
          updated_at?: string
          wo_id?: string | null
        }
        Update: {
          bom?: Json | null
          created_at?: string
          current_stage?: Database["public"]["Enums"]["wo_stage"] | null
          customer?: string
          customer_po?: string | null
          cycle_time_seconds?: number | null
          dispatch_allowed?: boolean | null
          display_id?: string | null
          due_date?: string
          gross_weight_per_pc?: number | null
          id?: string
          item_code?: string
          material_size_mm?: string | null
          net_weight_per_pc?: number | null
          production_allowed?: boolean | null
          qc_first_piece_approved_at?: string | null
          qc_first_piece_approved_by?: string | null
          qc_first_piece_passed?: boolean
          qc_material_approved_at?: string | null
          qc_material_approved_by?: string | null
          qc_material_passed?: boolean
          quantity?: number
          revision?: string | null
          sales_order?: string | null
          so_id?: string | null
          status?: Database["public"]["Enums"]["wo_status"]
          updated_at?: string
          wo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_so_id_fkey"
            columns: ["so_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_initial_role: {
        Args: { _requested_role: string; _user_id: string }
        Returns: undefined
      }
      calculate_end_time: {
        Args: { _hours_needed: number; _start_time: string }
        Returns: string
      }
      calculate_required_machine_time: {
        Args: {
          _cycle_time_seconds: number
          _num_machines?: number
          _quantity: number
        }
        Returns: unknown
      }
      check_machine_availability: {
        Args: { _end_time: string; _machine_id: string; _start_time: string }
        Returns: boolean
      }
      generate_rpo_number: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_wo_progress: {
        Args: { _wo_id: string }
        Returns: {
          net_completed: number
          progress_percentage: number
          remaining_quantity: number
          target_quantity: number
          total_completed: number
          total_scrap: number
        }[]
      }
      has_permission: {
        Args: { _action: string; _module: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      manage_user_role: {
        Args: {
          _action: string
          _role: Database["public"]["Enums"]["app_role"]
          _target_user_id: string
        }
        Returns: undefined
      }
      notify_users: {
        Args: {
          _entity_id?: string
          _entity_type?: string
          _message: string
          _title: string
          _type: string
          _user_ids: string[]
        }
        Returns: undefined
      }
      update_wo_stage: {
        Args: {
          _new_stage: Database["public"]["Enums"]["wo_stage"]
          _wo_id: string
        }
        Returns: undefined
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
        | "admin"
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
      first_piece_qc_status: "not_required" | "pending" | "approved" | "failed"
      material_qc_status: "not_required" | "pending" | "passed" | "failed"
      material_status: "received" | "issued" | "in_use" | "consumed"
      operation_letter:
        | "A"
        | "B"
        | "C"
        | "D"
        | "E"
        | "F"
        | "G"
        | "H"
        | "I"
        | "J"
      qc_result: "pass" | "fail" | "rework"
      qc_type: "first_piece" | "in_process" | "final"
      reconciliation_reason:
        | "short_supply"
        | "excess_supply"
        | "rate_variance"
        | "other"
      reconciliation_resolution:
        | "credit_note"
        | "debit_note"
        | "price_adjustment"
        | "pending"
      rpo_status:
        | "draft"
        | "pending_approval"
        | "approved"
        | "part_received"
        | "closed"
        | "cancelled"
      wo_stage: "goods_in" | "production" | "qc" | "packing" | "dispatch"
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
        "admin",
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
      first_piece_qc_status: ["not_required", "pending", "approved", "failed"],
      material_qc_status: ["not_required", "pending", "passed", "failed"],
      material_status: ["received", "issued", "in_use", "consumed"],
      operation_letter: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"],
      qc_result: ["pass", "fail", "rework"],
      qc_type: ["first_piece", "in_process", "final"],
      reconciliation_reason: [
        "short_supply",
        "excess_supply",
        "rate_variance",
        "other",
      ],
      reconciliation_resolution: [
        "credit_note",
        "debit_note",
        "price_adjustment",
        "pending",
      ],
      rpo_status: [
        "draft",
        "pending_approval",
        "approved",
        "part_received",
        "closed",
        "cancelled",
      ],
      wo_stage: ["goods_in", "production", "qc", "packing", "dispatch"],
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
