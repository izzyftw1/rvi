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
          department_id: string | null
          id: string
          location: string | null
          machine_id: string
          name: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          id?: string
          location?: string | null
          machine_id: string
          name: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          id?: string
          location?: string | null
          machine_id?: string
          name?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "machines_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
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
      material_lots: {
        Row: {
          alloy: string
          bin_location: string | null
          created_at: string
          gross_weight: number
          heat_no: string
          id: string
          lot_id: string
          material_size_mm: number | null
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
          material_size_mm?: number | null
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
          material_size_mm?: number | null
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
      purchase_orders: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          created_by: string | null
          expected_delivery: string | null
          id: string
          material_spec: Json
          po_id: string
          quantity_kg: number
          so_id: string | null
          status: string
          supplier: string
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          expected_delivery?: string | null
          id?: string
          material_spec: Json
          po_id: string
          quantity_kg: number
          so_id?: string | null
          status?: string
          supplier: string
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          expected_delivery?: string | null
          id?: string
          material_spec?: Json
          po_id?: string
          quantity_kg?: number
          so_id?: string | null
          status?: string
          supplier?: string
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
      sales_orders: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          created_by: string | null
          customer: string
          gross_weight_per_pc_grams: number | null
          id: string
          items: Json
          material_rod_forging_size_mm: number | null
          net_weight_per_pc_grams: number | null
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
          gross_weight_per_pc_grams?: number | null
          id?: string
          items: Json
          material_rod_forging_size_mm?: number | null
          net_weight_per_pc_grams?: number | null
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
          gross_weight_per_pc_grams?: number | null
          id?: string
          items?: Json
          material_rod_forging_size_mm?: number | null
          net_weight_per_pc_grams?: number | null
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
          dispatch_allowed: boolean | null
          due_date: string
          id: string
          item_code: string
          priority: number | null
          production_allowed: boolean | null
          quantity: number
          revision: string | null
          sales_order: string | null
          so_id: string | null
          status: Database["public"]["Enums"]["wo_status"]
          updated_at: string
          wo_id: string
        }
        Insert: {
          bom?: Json | null
          created_at?: string
          customer: string
          dispatch_allowed?: boolean | null
          due_date: string
          id?: string
          item_code: string
          priority?: number | null
          production_allowed?: boolean | null
          quantity: number
          revision?: string | null
          sales_order?: string | null
          so_id?: string | null
          status?: Database["public"]["Enums"]["wo_status"]
          updated_at?: string
          wo_id: string
        }
        Update: {
          bom?: Json | null
          created_at?: string
          customer?: string
          dispatch_allowed?: boolean | null
          due_date?: string
          id?: string
          item_code?: string
          priority?: number | null
          production_allowed?: boolean | null
          quantity?: number
          revision?: string | null
          sales_order?: string | null
          so_id?: string | null
          status?: Database["public"]["Enums"]["wo_status"]
          updated_at?: string
          wo_id?: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
      material_status: ["received", "issued", "in_use", "consumed"],
      operation_letter: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"],
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
