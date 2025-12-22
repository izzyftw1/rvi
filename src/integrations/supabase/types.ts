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
      ar_followups: {
        Row: {
          channel: Database["public"]["Enums"]["followup_channel"] | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          created_by: string | null
          followup_date: string | null
          id: string
          invoice_id: string
          next_followup_date: string | null
          notes: string | null
          outcome: string | null
        }
        Insert: {
          channel?: Database["public"]["Enums"]["followup_channel"] | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          created_by?: string | null
          followup_date?: string | null
          id?: string
          invoice_id: string
          next_followup_date?: string | null
          notes?: string | null
          outcome?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["followup_channel"] | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          created_by?: string | null
          followup_date?: string | null
          id?: string
          invoice_id?: string
          next_followup_date?: string | null
          notes?: string | null
          outcome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ar_followups_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
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
          {
            foreignKeyName: "cartons_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
            referencedColumns: ["id"]
          },
        ]
      }
      cnc_programmer_activity: {
        Row: {
          activity_date: string
          created_at: string
          created_by: string | null
          drawing_number: string | null
          first_piece_approval_time: string | null
          id: string
          item_code: string | null
          machine_counter_reading: number | null
          machine_id: string | null
          party_code: string | null
          programmer_id: string | null
          qc_approver_id: string | null
          setup_duration_minutes: number | null
          setup_end_time: string | null
          setup_start_time: string | null
          setup_type: string
          updated_at: string
          wo_id: string | null
        }
        Insert: {
          activity_date?: string
          created_at?: string
          created_by?: string | null
          drawing_number?: string | null
          first_piece_approval_time?: string | null
          id?: string
          item_code?: string | null
          machine_counter_reading?: number | null
          machine_id?: string | null
          party_code?: string | null
          programmer_id?: string | null
          qc_approver_id?: string | null
          setup_duration_minutes?: number | null
          setup_end_time?: string | null
          setup_start_time?: string | null
          setup_type?: string
          updated_at?: string
          wo_id?: string | null
        }
        Update: {
          activity_date?: string
          created_at?: string
          created_by?: string | null
          drawing_number?: string | null
          first_piece_approval_time?: string | null
          id?: string
          item_code?: string | null
          machine_counter_reading?: number | null
          machine_id?: string | null
          party_code?: string | null
          programmer_id?: string | null
          qc_approver_id?: string | null
          setup_duration_minutes?: number | null
          setup_end_time?: string | null
          setup_start_time?: string | null
          setup_type?: string
          updated_at?: string
          wo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cnc_programmer_activity_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machine_status_vw"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "cnc_programmer_activity_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cnc_programmer_activity_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "v_machine_daily"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "cnc_programmer_activity_programmer_id_fkey"
            columns: ["programmer_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cnc_programmer_activity_qc_approver_id_fkey"
            columns: ["qc_approver_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cnc_programmer_activity_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cnc_programmer_activity_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_master: {
        Row: {
          account_owner: string | null
          address_line_1: string | null
          city: string | null
          country: string | null
          created_at: string | null
          credit_limit_amount: number | null
          credit_limit_currency: string | null
          customer_name: string
          gst_number: string | null
          gst_type: Database["public"]["Enums"]["gst_type"] | null
          id: string
          last_used: string | null
          party_code: string | null
          payment_terms_days: number | null
          pincode: string | null
          primary_contact_email: string | null
          primary_contact_name: string | null
          primary_contact_phone: string | null
          state: string | null
          updated_at: string | null
        }
        Insert: {
          account_owner?: string | null
          address_line_1?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          credit_limit_amount?: number | null
          credit_limit_currency?: string | null
          customer_name: string
          gst_number?: string | null
          gst_type?: Database["public"]["Enums"]["gst_type"] | null
          id?: string
          last_used?: string | null
          party_code?: string | null
          payment_terms_days?: number | null
          pincode?: string | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          primary_contact_phone?: string | null
          state?: string | null
          updated_at?: string | null
        }
        Update: {
          account_owner?: string | null
          address_line_1?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          credit_limit_amount?: number | null
          credit_limit_currency?: string | null
          customer_name?: string
          gst_number?: string | null
          gst_type?: Database["public"]["Enums"]["gst_type"] | null
          id?: string
          last_used?: string | null
          party_code?: string | null
          payment_terms_days?: number | null
          pincode?: string | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          primary_contact_phone?: string | null
          state?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cutting_records: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          item_code: string
          operator_id: string | null
          qty_cut: number | null
          qty_required: number
          remarks: string | null
          start_date: string | null
          status: string
          updated_at: string
          work_order_id: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          item_code: string
          operator_id?: string | null
          qty_cut?: number | null
          qty_required: number
          remarks?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          work_order_id: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          item_code?: string
          operator_id?: string | null
          qty_cut?: number | null
          qty_required?: number
          remarks?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cutting_records_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cutting_records_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_production_logs: {
        Row: {
          actual_quantity: number
          actual_runtime_minutes: number
          created_at: string
          created_by: string | null
          cycle_time_seconds: number | null
          downtime_events: Json
          drawing_number: string | null
          efficiency_percentage: number | null
          id: string
          locked: boolean
          locked_at: string | null
          locked_by: string | null
          locked_reason: string | null
          log_date: string
          machine_id: string
          ok_quantity: number | null
          operator_id: string | null
          ordered_quantity: number | null
          party_code: string | null
          plant: string
          product_description: string | null
          programmer_id: string | null
          raw_material_grade: string | null
          rejection_dent: number | null
          rejection_dimension: number | null
          rejection_face_not_ok: number | null
          rejection_forging_mark: number | null
          rejection_lining: number | null
          rejection_material_not_ok: number | null
          rejection_previous_setup_fault: number | null
          rejection_scratch: number | null
          rejection_setting: number | null
          rejection_tool_mark: number | null
          rework_quantity: number
          setup_number: string
          shift: string
          shift_end_time: string
          shift_start_time: string
          target_override: number | null
          target_override_by: string | null
          target_override_reason: string | null
          target_quantity: number | null
          total_downtime_minutes: number
          total_rejection_quantity: number | null
          updated_at: string
          wo_id: string | null
        }
        Insert: {
          actual_quantity?: number
          actual_runtime_minutes?: number
          created_at?: string
          created_by?: string | null
          cycle_time_seconds?: number | null
          downtime_events?: Json
          drawing_number?: string | null
          efficiency_percentage?: number | null
          id?: string
          locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          locked_reason?: string | null
          log_date?: string
          machine_id: string
          ok_quantity?: number | null
          operator_id?: string | null
          ordered_quantity?: number | null
          party_code?: string | null
          plant: string
          product_description?: string | null
          programmer_id?: string | null
          raw_material_grade?: string | null
          rejection_dent?: number | null
          rejection_dimension?: number | null
          rejection_face_not_ok?: number | null
          rejection_forging_mark?: number | null
          rejection_lining?: number | null
          rejection_material_not_ok?: number | null
          rejection_previous_setup_fault?: number | null
          rejection_scratch?: number | null
          rejection_setting?: number | null
          rejection_tool_mark?: number | null
          rework_quantity?: number
          setup_number: string
          shift: string
          shift_end_time?: string
          shift_start_time?: string
          target_override?: number | null
          target_override_by?: string | null
          target_override_reason?: string | null
          target_quantity?: number | null
          total_downtime_minutes?: number
          total_rejection_quantity?: number | null
          updated_at?: string
          wo_id?: string | null
        }
        Update: {
          actual_quantity?: number
          actual_runtime_minutes?: number
          created_at?: string
          created_by?: string | null
          cycle_time_seconds?: number | null
          downtime_events?: Json
          drawing_number?: string | null
          efficiency_percentage?: number | null
          id?: string
          locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          locked_reason?: string | null
          log_date?: string
          machine_id?: string
          ok_quantity?: number | null
          operator_id?: string | null
          ordered_quantity?: number | null
          party_code?: string | null
          plant?: string
          product_description?: string | null
          programmer_id?: string | null
          raw_material_grade?: string | null
          rejection_dent?: number | null
          rejection_dimension?: number | null
          rejection_face_not_ok?: number | null
          rejection_forging_mark?: number | null
          rejection_lining?: number | null
          rejection_material_not_ok?: number | null
          rejection_previous_setup_fault?: number | null
          rejection_scratch?: number | null
          rejection_setting?: number | null
          rejection_tool_mark?: number | null
          rework_quantity?: number
          setup_number?: string
          shift?: string
          shift_end_time?: string
          shift_start_time?: string
          target_override?: number | null
          target_override_by?: string | null
          target_override_reason?: string | null
          target_quantity?: number | null
          total_downtime_minutes?: number
          total_rejection_quantity?: number | null
          updated_at?: string
          wo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_production_logs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machine_status_vw"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "daily_production_logs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_production_logs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "v_machine_daily"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "daily_production_logs_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_production_logs_programmer_id_fkey"
            columns: ["programmer_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_production_logs_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_production_logs_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          site_id: string | null
          type: Database["public"]["Enums"]["department_type"]
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          site_id?: string | null
          type: Database["public"]["Enums"]["department_type"]
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          site_id?: string | null
          type?: Database["public"]["Enums"]["department_type"]
        }
        Relationships: [
          {
            foreignKeyName: "departments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "design_files_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
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
      execution_records: {
        Row: {
          created_at: string
          created_by: string | null
          direction: Database["public"]["Enums"]["execution_direction"]
          id: string
          operation_type: Database["public"]["Enums"]["operation_type"]
          out_of_sequence: boolean | null
          process_name: string | null
          quantity: number
          related_challan_id: string | null
          related_partner_id: string | null
          route_step_id: string | null
          unit: string
          work_order_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          direction: Database["public"]["Enums"]["execution_direction"]
          id?: string
          operation_type: Database["public"]["Enums"]["operation_type"]
          out_of_sequence?: boolean | null
          process_name?: string | null
          quantity: number
          related_challan_id?: string | null
          related_partner_id?: string | null
          route_step_id?: string | null
          unit?: string
          work_order_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          direction?: Database["public"]["Enums"]["execution_direction"]
          id?: string
          operation_type?: Database["public"]["Enums"]["operation_type"]
          out_of_sequence?: boolean | null
          process_name?: string | null
          quantity?: number
          related_challan_id?: string | null
          related_partner_id?: string | null
          route_step_id?: string | null
          unit?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "execution_records_related_challan_id_fkey"
            columns: ["related_challan_id"]
            isOneToOne: false
            referencedRelation: "wo_external_moves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_records_related_partner_id_fkey"
            columns: ["related_partner_id"]
            isOneToOne: false
            referencedRelation: "external_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_records_related_partner_id_fkey"
            columns: ["related_partner_id"]
            isOneToOne: false
            referencedRelation: "wo_external_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_records_route_step_id_fkey"
            columns: ["route_step_id"]
            isOneToOne: false
            referencedRelation: "operation_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_records_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_records_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
            referencedColumns: ["id"]
          },
        ]
      }
      external_partners: {
        Row: {
          address: string | null
          contact_person: string | null
          created_at: string | null
          default_lead_time_days: number | null
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          phone: string | null
          process_type: string | null
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string | null
          default_lead_time_days?: number | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          phone?: string | null
          process_type?: string | null
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string | null
          default_lead_time_days?: number | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          phone?: string | null
          process_type?: string | null
        }
        Relationships: []
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
      forging_records: {
        Row: {
          created_at: string
          forging_end_date: string | null
          forging_start_date: string | null
          forging_vendor: string | null
          id: string
          qc_approved: boolean | null
          qc_record_id: string | null
          qty_forged: number | null
          qty_required: number
          remarks: string | null
          sample_sent: boolean | null
          status: string
          updated_at: string
          work_order_id: string
        }
        Insert: {
          created_at?: string
          forging_end_date?: string | null
          forging_start_date?: string | null
          forging_vendor?: string | null
          id?: string
          qc_approved?: boolean | null
          qc_record_id?: string | null
          qty_forged?: number | null
          qty_required: number
          remarks?: string | null
          sample_sent?: boolean | null
          status?: string
          updated_at?: string
          work_order_id: string
        }
        Update: {
          created_at?: string
          forging_end_date?: string | null
          forging_start_date?: string | null
          forging_vendor?: string | null
          id?: string
          qc_approved?: boolean | null
          qc_record_id?: string | null
          qty_forged?: number | null
          qty_required?: number
          remarks?: string | null
          sample_sent?: boolean | null
          status?: string
          updated_at?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forging_records_qc_record_id_fkey"
            columns: ["qc_record_id"]
            isOneToOne: false
            referencedRelation: "qc_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forging_records_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forging_records_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
            referencedColumns: ["id"]
          },
        ]
      }
      grn_receipts: {
        Row: {
          alloy: string
          created_at: string
          grn_no: string
          id: string
          lot_number: string
          material_grade: string
          po_id: string | null
          received_by: string | null
          received_date: string
          received_qty_kg: number
          remarks: string | null
          supplier_batch_ref: string | null
        }
        Insert: {
          alloy: string
          created_at?: string
          grn_no: string
          id?: string
          lot_number: string
          material_grade: string
          po_id?: string | null
          received_by?: string | null
          received_date?: string
          received_qty_kg: number
          remarks?: string | null
          supplier_batch_ref?: string | null
        }
        Update: {
          alloy?: string
          created_at?: string
          grn_no?: string
          id?: string
          lot_number?: string
          material_grade?: string
          po_id?: string | null
          received_by?: string | null
          received_date?: string
          received_qty_kg?: number
          remarks?: string | null
          supplier_batch_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grn_receipts_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "raw_material_po"
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
          instrument_id: string | null
          machine_id: string
          operation: Database["public"]["Enums"]["operation_letter"]
          operator_id: string | null
          out_of_tolerance_dimensions: string[] | null
          plating_applicable: boolean | null
          plating_status: string | null
          plating_thickness_applicable: boolean | null
          plating_thickness_status: string | null
          remarks: string | null
          status: string
          thread_applicable: boolean | null
          thread_status: string | null
          visual_applicable: boolean | null
          visual_status: string | null
          wo_id: string
        }
        Insert: {
          check_datetime?: string
          created_at?: string
          dimensions?: Json
          id?: string
          instrument_id?: string | null
          machine_id: string
          operation?: Database["public"]["Enums"]["operation_letter"]
          operator_id?: string | null
          out_of_tolerance_dimensions?: string[] | null
          plating_applicable?: boolean | null
          plating_status?: string | null
          plating_thickness_applicable?: boolean | null
          plating_thickness_status?: string | null
          remarks?: string | null
          status?: string
          thread_applicable?: boolean | null
          thread_status?: string | null
          visual_applicable?: boolean | null
          visual_status?: string | null
          wo_id: string
        }
        Update: {
          check_datetime?: string
          created_at?: string
          dimensions?: Json
          id?: string
          instrument_id?: string | null
          machine_id?: string
          operation?: Database["public"]["Enums"]["operation_letter"]
          operator_id?: string | null
          out_of_tolerance_dimensions?: string[] | null
          plating_applicable?: boolean | null
          plating_status?: string | null
          plating_thickness_applicable?: boolean | null
          plating_thickness_status?: string | null
          remarks?: string | null
          status?: string
          thread_applicable?: boolean | null
          thread_status?: string | null
          visual_applicable?: boolean | null
          visual_status?: string | null
          wo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hourly_qc_checks_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "measurement_instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hourly_qc_checks_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machine_status_vw"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "hourly_qc_checks_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hourly_qc_checks_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "v_machine_daily"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "hourly_qc_checks_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hourly_qc_checks_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
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
      invoice_items: {
        Row: {
          amount: number
          created_at: string | null
          description: string
          gst_amount: number | null
          gst_percent: number | null
          id: string
          invoice_id: string
          quantity: number
          rate: number
          so_item_id: string | null
          total_line: number
        }
        Insert: {
          amount: number
          created_at?: string | null
          description: string
          gst_amount?: number | null
          gst_percent?: number | null
          id?: string
          invoice_id: string
          quantity: number
          rate: number
          so_item_id?: string | null
          total_line: number
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string
          gst_amount?: number | null
          gst_percent?: number | null
          id?: string
          invoice_id?: string
          quantity?: number
          rate?: number
          so_item_id?: string | null
          total_line?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_so_item_id_fkey"
            columns: ["so_item_id"]
            isOneToOne: false
            referencedRelation: "sales_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          balance_amount: number
          created_at: string | null
          created_by: string | null
          currency: string | null
          customer_id: string
          due_date: string
          expected_payment_date: string | null
          gst_amount: number | null
          gst_percent: number | null
          id: string
          invoice_date: string
          invoice_no: string
          paid_amount: number | null
          payment_terms_days: number | null
          pdf_url: string | null
          recovery_stage: Database["public"]["Enums"]["recovery_stage"] | null
          so_id: string | null
          status: Database["public"]["Enums"]["invoice_status"] | null
          subtotal: number
          total_amount: number
          updated_at: string | null
          wo_id: string | null
        }
        Insert: {
          balance_amount?: number
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          customer_id: string
          due_date: string
          expected_payment_date?: string | null
          gst_amount?: number | null
          gst_percent?: number | null
          id?: string
          invoice_date?: string
          invoice_no: string
          paid_amount?: number | null
          payment_terms_days?: number | null
          pdf_url?: string | null
          recovery_stage?: Database["public"]["Enums"]["recovery_stage"] | null
          so_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          subtotal?: number
          total_amount?: number
          updated_at?: string | null
          wo_id?: string | null
        }
        Update: {
          balance_amount?: number
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          customer_id?: string
          due_date?: string
          expected_payment_date?: string | null
          gst_amount?: number | null
          gst_percent?: number | null
          id?: string
          invoice_date?: string
          invoice_no?: string
          paid_amount?: number | null
          payment_terms_days?: number | null
          pdf_url?: string | null
          recovery_stage?: Database["public"]["Enums"]["recovery_stage"] | null
          so_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          subtotal?: number
          total_amount?: number
          updated_at?: string | null
          wo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_last_order"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_so_id_fkey"
            columns: ["so_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
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
      machine_daily_metrics: {
        Row: {
          actual_run_minutes: number
          availability_pct: number | null
          created_at: string
          date: string
          downtime_minutes: number
          id: string
          machine_id: string
          oee_pct: number | null
          performance_pct: number | null
          planned_minutes: number
          qty_ok: number
          qty_scrap: number
          quality_pct: number | null
          site_id: string
          target_qty: number
          updated_at: string
        }
        Insert: {
          actual_run_minutes?: number
          availability_pct?: number | null
          created_at?: string
          date: string
          downtime_minutes?: number
          id?: string
          machine_id: string
          oee_pct?: number | null
          performance_pct?: number | null
          planned_minutes?: number
          qty_ok?: number
          qty_scrap?: number
          quality_pct?: number | null
          site_id: string
          target_qty?: number
          updated_at?: string
        }
        Update: {
          actual_run_minutes?: number
          availability_pct?: number | null
          created_at?: string
          date?: string
          downtime_minutes?: number
          id?: string
          machine_id?: string
          oee_pct?: number | null
          performance_pct?: number | null
          planned_minutes?: number
          qty_ok?: number
          qty_scrap?: number
          quality_pct?: number | null
          site_id?: string
          target_qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_daily_metrics_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machine_status_vw"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "machine_daily_metrics_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_daily_metrics_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "v_machine_daily"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "machine_daily_metrics_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_utilisation_reviews: {
        Row: {
          action_taken: string | null
          actual_runtime_minutes: number
          created_at: string
          expected_runtime_minutes: number
          id: string
          machine_id: string
          reason: string | null
          review_date: string
          reviewed_at: string | null
          reviewed_by: string | null
          updated_at: string
          utilisation_percentage: number
        }
        Insert: {
          action_taken?: string | null
          actual_runtime_minutes?: number
          created_at?: string
          expected_runtime_minutes?: number
          id?: string
          machine_id: string
          reason?: string | null
          review_date: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
          utilisation_percentage?: number
        }
        Update: {
          action_taken?: string | null
          actual_runtime_minutes?: number
          created_at?: string
          expected_runtime_minutes?: number
          id?: string
          machine_id?: string
          reason?: string | null
          review_date?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
          utilisation_percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "machine_utilisation_reviews_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machine_status_vw"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "machine_utilisation_reviews_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_utilisation_reviews_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "v_machine_daily"
            referencedColumns: ["machine_id"]
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
          last_qc_check_at: string | null
          location: string | null
          machine_id: string
          name: string
          next_qc_check_due: string | null
          operator_id: string | null
          qc_status: string | null
          site_id: string | null
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
          last_qc_check_at?: string | null
          location?: string | null
          machine_id: string
          name: string
          next_qc_check_due?: string | null
          operator_id?: string | null
          qc_status?: string | null
          site_id?: string | null
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
          last_qc_check_at?: string | null
          location?: string | null
          machine_id?: string
          name?: string
          next_qc_check_due?: string | null
          operator_id?: string | null
          qc_status?: string | null
          site_id?: string | null
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
            foreignKeyName: "machines_current_wo_id_fkey"
            columns: ["current_wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
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
          {
            foreignKeyName: "machines_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "v_operator_daily"
            referencedColumns: ["operator_id"]
          },
          {
            foreignKeyName: "machines_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
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
            referencedRelation: "machine_status_vw"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "maintenance_logs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_logs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "v_machine_daily"
            referencedColumns: ["machine_id"]
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
          {
            foreignKeyName: "material_issues_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
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
      material_master: {
        Row: {
          alloy: string
          conversion_factor: number | null
          created_at: string
          density: number
          id: string
          material_name: string
          shape_type: string
          size_mm: number
          updated_at: string
        }
        Insert: {
          alloy: string
          conversion_factor?: number | null
          created_at?: string
          density?: number
          id?: string
          material_name: string
          shape_type: string
          size_mm: number
          updated_at?: string
        }
        Update: {
          alloy?: string
          conversion_factor?: number | null
          created_at?: string
          density?: number
          id?: string
          material_name?: string
          shape_type?: string
          size_mm?: number
          updated_at?: string
        }
        Relationships: []
      }
      material_movements: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          movement_type: string
          partner_id: string | null
          process_type: string
          qty: number
          remarks: string | null
          timestamp: string
          weight: number | null
          work_order_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          movement_type: string
          partner_id?: string | null
          process_type: string
          qty: number
          remarks?: string | null
          timestamp?: string
          weight?: number | null
          work_order_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          movement_type?: string
          partner_id?: string | null
          process_type?: string
          qty?: number
          remarks?: string | null
          timestamp?: string
          weight?: number | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_movements_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "external_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_movements_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "wo_external_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_movements_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_movements_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
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
      material_requirements_v2: {
        Row: {
          alloy: string
          created_at: string
          customer: string
          customer_id: string | null
          due_date: string | null
          gross_wt_pc: number
          id: string
          material_grade: string
          material_size_mm: number
          net_wt_pc: number
          qty_pcs: number
          so_id: string | null
          status: string
          total_gross_kg: number | null
          total_net_kg: number | null
          updated_at: string
          wo_id: string | null
        }
        Insert: {
          alloy: string
          created_at?: string
          customer: string
          customer_id?: string | null
          due_date?: string | null
          gross_wt_pc: number
          id?: string
          material_grade: string
          material_size_mm: number
          net_wt_pc: number
          qty_pcs: number
          so_id?: string | null
          status?: string
          total_gross_kg?: number | null
          total_net_kg?: number | null
          updated_at?: string
          wo_id?: string | null
        }
        Update: {
          alloy?: string
          created_at?: string
          customer?: string
          customer_id?: string | null
          due_date?: string | null
          gross_wt_pc?: number
          id?: string
          material_grade?: string
          material_size_mm?: number
          net_wt_pc?: number
          qty_pcs?: number
          so_id?: string | null
          status?: string
          total_gross_kg?: number | null
          total_net_kg?: number | null
          updated_at?: string
          wo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_requirements_v2_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_last_order"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "material_requirements_v2_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requirements_v2_so_id_fkey"
            columns: ["so_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requirements_v2_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requirements_v2_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
            referencedColumns: ["id"]
          },
        ]
      }
      material_specs: {
        Row: {
          created_at: string
          grade_label: string
          id: string
          size_label: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          grade_label: string
          id?: string
          size_label: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          grade_label?: string
          id?: string
          size_label?: string
          updated_at?: string
        }
        Relationships: []
      }
      measurement_instruments: {
        Row: {
          calibration_interval_days: number
          created_at: string
          created_by: string | null
          id: string
          instrument_name: string
          instrument_type: string
          last_calibration_date: string
          location: string | null
          next_calibration_due_date: string
          serial_number: string
          status: string
          updated_at: string
        }
        Insert: {
          calibration_interval_days?: number
          created_at?: string
          created_by?: string | null
          id?: string
          instrument_name: string
          instrument_type: string
          last_calibration_date: string
          location?: string | null
          next_calibration_due_date: string
          serial_number: string
          status?: string
          updated_at?: string
        }
        Update: {
          calibration_interval_days?: number
          created_at?: string
          created_by?: string | null
          id?: string
          instrument_name?: string
          instrument_type?: string
          last_calibration_date?: string
          location?: string | null
          next_calibration_due_date?: string
          serial_number?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ncr_actions: {
        Row: {
          action_type: string
          assigned_at: string | null
          assigned_by: string | null
          assigned_to: string | null
          completed_at: string | null
          completed_by: string | null
          completion_notes: string | null
          created_at: string
          description: string
          due_date: string | null
          id: string
          ncr_id: string
          status: string
          updated_at: string
          verification_notes: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          action_type: string
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completion_notes?: string | null
          created_at?: string
          description: string
          due_date?: string | null
          id?: string
          ncr_id: string
          status?: string
          updated_at?: string
          verification_notes?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          action_type?: string
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completion_notes?: string | null
          created_at?: string
          description?: string
          due_date?: string | null
          id?: string
          ncr_id?: string
          status?: string
          updated_at?: string
          verification_notes?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ncr_actions_ncr_id_fkey"
            columns: ["ncr_id"]
            isOneToOne: false
            referencedRelation: "ncrs"
            referencedColumns: ["id"]
          },
        ]
      }
      ncrs: {
        Row: {
          action_completed_at: string | null
          action_completed_by: string | null
          action_due_date: string | null
          action_notes: string | null
          assigned_at: string | null
          assigned_by: string | null
          assigned_to: string | null
          closed_at: string | null
          closed_by: string | null
          closure_notes: string | null
          corrective_action: string | null
          created_at: string
          created_by: string | null
          disposition: Database["public"]["Enums"]["ncr_disposition"] | null
          due_date: string | null
          effectiveness_check: string | null
          effectiveness_verified: boolean | null
          id: string
          issue_description: string
          material_lot_id: string | null
          ncr_number: string
          ncr_type: Database["public"]["Enums"]["ncr_type"]
          operation_type: Database["public"]["Enums"]["operation_type"] | null
          preventive_action: string | null
          production_log_id: string | null
          qc_record_id: string | null
          quantity_affected: number
          raised_from: string | null
          responsible_person: string | null
          root_cause: string | null
          source_reference: string | null
          status: Database["public"]["Enums"]["ncr_status"]
          unit: string
          updated_at: string
          work_order_id: string | null
        }
        Insert: {
          action_completed_at?: string | null
          action_completed_by?: string | null
          action_due_date?: string | null
          action_notes?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closure_notes?: string | null
          corrective_action?: string | null
          created_at?: string
          created_by?: string | null
          disposition?: Database["public"]["Enums"]["ncr_disposition"] | null
          due_date?: string | null
          effectiveness_check?: string | null
          effectiveness_verified?: boolean | null
          id?: string
          issue_description: string
          material_lot_id?: string | null
          ncr_number: string
          ncr_type: Database["public"]["Enums"]["ncr_type"]
          operation_type?: Database["public"]["Enums"]["operation_type"] | null
          preventive_action?: string | null
          production_log_id?: string | null
          qc_record_id?: string | null
          quantity_affected: number
          raised_from?: string | null
          responsible_person?: string | null
          root_cause?: string | null
          source_reference?: string | null
          status?: Database["public"]["Enums"]["ncr_status"]
          unit?: string
          updated_at?: string
          work_order_id?: string | null
        }
        Update: {
          action_completed_at?: string | null
          action_completed_by?: string | null
          action_due_date?: string | null
          action_notes?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closure_notes?: string | null
          corrective_action?: string | null
          created_at?: string
          created_by?: string | null
          disposition?: Database["public"]["Enums"]["ncr_disposition"] | null
          due_date?: string | null
          effectiveness_check?: string | null
          effectiveness_verified?: boolean | null
          id?: string
          issue_description?: string
          material_lot_id?: string | null
          ncr_number?: string
          ncr_type?: Database["public"]["Enums"]["ncr_type"]
          operation_type?: Database["public"]["Enums"]["operation_type"] | null
          preventive_action?: string | null
          production_log_id?: string | null
          qc_record_id?: string | null
          quantity_affected?: number
          raised_from?: string | null
          responsible_person?: string | null
          root_cause?: string | null
          source_reference?: string | null
          status?: Database["public"]["Enums"]["ncr_status"]
          unit?: string
          updated_at?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ncrs_material_lot_id_fkey"
            columns: ["material_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ncrs_production_log_id_fkey"
            columns: ["production_log_id"]
            isOneToOne: false
            referencedRelation: "daily_production_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ncrs_qc_record_id_fkey"
            columns: ["qc_record_id"]
            isOneToOne: false
            referencedRelation: "qc_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ncrs_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ncrs_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "non_consumable_usage_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
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
      operation_routes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_external: boolean
          is_mandatory: boolean
          operation_type: Database["public"]["Enums"]["operation_type"]
          process_name: string | null
          sequence_number: number
          work_order_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_external?: boolean
          is_mandatory?: boolean
          operation_type: Database["public"]["Enums"]["operation_type"]
          process_name?: string | null
          sequence_number: number
          work_order_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_external?: boolean
          is_mandatory?: boolean
          operation_type?: Database["public"]["Enums"]["operation_type"]
          process_name?: string | null
          sequence_number?: number
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operation_routes_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_routes_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_daily_metrics: {
        Row: {
          created_at: string
          date: string
          efficiency_pct: number | null
          id: string
          operator_id: string
          qty_ok: number
          run_minutes: number
          scrap: number
          site_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          efficiency_pct?: number | null
          id?: string
          operator_id: string
          qty_ok?: number
          run_minutes?: number
          scrap?: number
          site_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          efficiency_pct?: number | null
          id?: string
          operator_id?: string
          qty_ok?: number
          run_minutes?: number
          scrap?: number
          site_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_daily_metrics_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operator_daily_metrics_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "v_operator_daily"
            referencedColumns: ["operator_id"]
          },
          {
            foreignKeyName: "operator_daily_metrics_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_shifts: {
        Row: {
          created_at: string
          date: string
          id: string
          operator_id: string
          remarks: string | null
          scheduled_minutes: number
          shift: Database["public"]["Enums"]["shift_type"]
          site_id: string
          updated_at: string
          worked_minutes: number
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          operator_id: string
          remarks?: string | null
          scheduled_minutes?: number
          shift: Database["public"]["Enums"]["shift_type"]
          site_id: string
          updated_at?: string
          worked_minutes?: number
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          operator_id?: string
          remarks?: string | null
          scheduled_minutes?: number
          shift?: Database["public"]["Enums"]["shift_type"]
          site_id?: string
          updated_at?: string
          worked_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "operator_shifts_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operator_shifts_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "v_operator_daily"
            referencedColumns: ["operator_id"]
          },
          {
            foreignKeyName: "operator_shifts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
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
      payments: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string | null
          id: string
          invoice_id: string
          method: Database["public"]["Enums"]["payment_method"] | null
          notes: string | null
          payment_date: string
          received_by: string | null
          reference: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          invoice_id: string
          method?: Database["public"]["Enums"]["payment_method"] | null
          notes?: string | null
          payment_date?: string
          received_by?: string | null
          reference?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          invoice_id?: string
          method?: Database["public"]["Enums"]["payment_method"] | null
          notes?: string | null
          payment_date?: string
          received_by?: string | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          created_at: string
          employment_type: Database["public"]["Enums"]["employment_type"]
          full_name: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["person_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          employment_type?: Database["public"]["Enums"]["employment_type"]
          full_name: string
          id?: string
          is_active?: boolean
          role: Database["public"]["Enums"]["person_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          employment_type?: Database["public"]["Enums"]["employment_type"]
          full_name?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["person_role"]
          updated_at?: string
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
      process_flow: {
        Row: {
          created_at: string | null
          id: string
          is_external: boolean | null
          next_process: string | null
          process_type: string
          sequence_no: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_external?: boolean | null
          next_process?: string | null
          process_type: string
          sequence_no: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_external?: boolean | null
          next_process?: string | null
          process_type?: string
          sequence_no?: number
          updated_at?: string | null
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
          {
            foreignKeyName: "processing_costs_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
            referencedColumns: ["id"]
          },
        ]
      }
      production_logs: {
        Row: {
          actions_taken: string | null
          created_at: string
          downtime_minutes: number
          id: string
          log_timestamp: string
          machine_id: string
          operation_code: string | null
          operator_id: string | null
          operator_type: Database["public"]["Enums"]["operator_type"]
          planned_minutes: number | null
          quantity_completed: number
          quantity_scrap: number
          remarks: string | null
          run_state: Database["public"]["Enums"]["run_state"]
          setup_no: string | null
          shift: string | null
          target_qty: number | null
          wo_id: string
        }
        Insert: {
          actions_taken?: string | null
          created_at?: string
          downtime_minutes?: number
          id?: string
          log_timestamp?: string
          machine_id: string
          operation_code?: string | null
          operator_id?: string | null
          operator_type?: Database["public"]["Enums"]["operator_type"]
          planned_minutes?: number | null
          quantity_completed?: number
          quantity_scrap?: number
          remarks?: string | null
          run_state?: Database["public"]["Enums"]["run_state"]
          setup_no?: string | null
          shift?: string | null
          target_qty?: number | null
          wo_id: string
        }
        Update: {
          actions_taken?: string | null
          created_at?: string
          downtime_minutes?: number
          id?: string
          log_timestamp?: string
          machine_id?: string
          operation_code?: string | null
          operator_id?: string | null
          operator_type?: Database["public"]["Enums"]["operator_type"]
          planned_minutes?: number | null
          quantity_completed?: number
          quantity_scrap?: number
          remarks?: string | null
          run_state?: Database["public"]["Enums"]["run_state"]
          setup_no?: string | null
          shift?: string | null
          target_qty?: number | null
          wo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_logs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machine_status_vw"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "production_logs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_logs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "v_machine_daily"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "production_logs_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_logs_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
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
      proforma_invoices: {
        Row: {
          created_at: string
          file_path: string
          file_url: string | null
          generated_at: string
          generated_by: string | null
          id: string
          proforma_no: string
          sales_order_id: string
          sent_at: string | null
          sent_to_email: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          file_path: string
          file_url?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          proforma_no: string
          sales_order_id: string
          sent_at?: string | null
          sent_to_email?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          file_path?: string
          file_url?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          proforma_no?: string
          sales_order_id?: string
          sent_at?: string | null
          sent_to_email?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proforma_invoices_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
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
      qc_final_reports: {
        Row: {
          created_at: string | null
          file_path: string
          file_url: string
          generated_at: string | null
          generated_by: string | null
          id: string
          remarks: string | null
          report_data: Json | null
          updated_at: string | null
          version_number: number
          work_order_id: string
        }
        Insert: {
          created_at?: string | null
          file_path: string
          file_url: string
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          remarks?: string | null
          report_data?: Json | null
          updated_at?: string | null
          version_number?: number
          work_order_id: string
        }
        Update: {
          created_at?: string | null
          file_path?: string
          file_url?: string
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          remarks?: string | null
          report_data?: Json | null
          updated_at?: string | null
          version_number?: number
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qc_final_reports_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_final_reports_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
            referencedColumns: ["id"]
          },
        ]
      }
      qc_measurements: {
        Row: {
          created_at: string
          created_by: string | null
          dimension_name: string
          id: string
          instrument_id: string | null
          is_within_tolerance: boolean | null
          lower_limit: number
          measured_value: number
          qc_record_id: string
          remarks: string | null
          sample_number: number
          unit: string
          upper_limit: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dimension_name: string
          id?: string
          instrument_id?: string | null
          is_within_tolerance?: boolean | null
          lower_limit: number
          measured_value: number
          qc_record_id: string
          remarks?: string | null
          sample_number: number
          unit: string
          upper_limit: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dimension_name?: string
          id?: string
          instrument_id?: string | null
          is_within_tolerance?: boolean | null
          lower_limit?: number
          measured_value?: number
          qc_record_id?: string
          remarks?: string | null
          sample_number?: number
          unit?: string
          upper_limit?: number
        }
        Relationships: [
          {
            foreignKeyName: "qc_measurements_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "measurement_instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_measurements_qc_record_id_fkey"
            columns: ["qc_record_id"]
            isOneToOne: false
            referencedRelation: "qc_records"
            referencedColumns: ["id"]
          },
        ]
      }
      qc_records: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          digital_signature: Json | null
          file_upload_url: string | null
          heat_no: string | null
          id: string
          instrument_id: string | null
          material_grade: string | null
          material_lot_id: string | null
          measurements: Json | null
          oes_xrf_file: string | null
          ppap_refs: string[] | null
          qc_date_time: string
          qc_id: string
          qc_type: Database["public"]["Enums"]["qc_type"]
          remarks: string | null
          result: Database["public"]["Enums"]["qc_result"]
          step_id: string | null
          supplier_coa_url: string | null
          tested_on: string | null
          waive_reason: string | null
          wo_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          digital_signature?: Json | null
          file_upload_url?: string | null
          heat_no?: string | null
          id?: string
          instrument_id?: string | null
          material_grade?: string | null
          material_lot_id?: string | null
          measurements?: Json | null
          oes_xrf_file?: string | null
          ppap_refs?: string[] | null
          qc_date_time?: string
          qc_id: string
          qc_type: Database["public"]["Enums"]["qc_type"]
          remarks?: string | null
          result: Database["public"]["Enums"]["qc_result"]
          step_id?: string | null
          supplier_coa_url?: string | null
          tested_on?: string | null
          waive_reason?: string | null
          wo_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          digital_signature?: Json | null
          file_upload_url?: string | null
          heat_no?: string | null
          id?: string
          instrument_id?: string | null
          material_grade?: string | null
          material_lot_id?: string | null
          measurements?: Json | null
          oes_xrf_file?: string | null
          ppap_refs?: string[] | null
          qc_date_time?: string
          qc_id?: string
          qc_type?: Database["public"]["Enums"]["qc_type"]
          remarks?: string | null
          result?: Database["public"]["Enums"]["qc_result"]
          step_id?: string | null
          supplier_coa_url?: string | null
          tested_on?: string | null
          waive_reason?: string | null
          wo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qc_records_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "measurement_instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_records_material_lot_id_fkey"
            columns: ["material_lot_id"]
            isOneToOne: false
            referencedRelation: "material_lots"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "qc_records_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
            referencedColumns: ["id"]
          },
        ]
      }
      qc_summary: {
        Row: {
          avg_value: number
          created_at: string
          dimension_name: string
          id: string
          last_updated: string
          lower_limit: number
          machine_id: string
          max_value: number
          min_value: number
          operation: Database["public"]["Enums"]["operation_letter"]
          sample_count: number
          unit: string
          upper_limit: number
          within_tolerance: boolean
          wo_id: string
        }
        Insert: {
          avg_value: number
          created_at?: string
          dimension_name: string
          id?: string
          last_updated?: string
          lower_limit: number
          machine_id: string
          max_value: number
          min_value: number
          operation: Database["public"]["Enums"]["operation_letter"]
          sample_count: number
          unit: string
          upper_limit: number
          within_tolerance: boolean
          wo_id: string
        }
        Update: {
          avg_value?: number
          created_at?: string
          dimension_name?: string
          id?: string
          last_updated?: string
          lower_limit?: number
          machine_id?: string
          max_value?: number
          min_value?: number
          operation?: Database["public"]["Enums"]["operation_letter"]
          sample_count?: number
          unit?: string
          upper_limit?: number
          within_tolerance?: boolean
          wo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qc_summary_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machine_status_vw"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "qc_summary_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_summary_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "v_machine_daily"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "qc_summary_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_summary_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_material_po: {
        Row: {
          alloy: string
          created_at: string
          created_by: string | null
          expected_date: string
          id: string
          linked_requirement_ids: Json
          linked_wo_ids: Json
          material_grade: string
          po_id: string
          qty_kg: number
          rate_per_kg: number
          remarks: string | null
          status: string
          supplier_id: string | null
          total_value: number | null
          updated_at: string
        }
        Insert: {
          alloy: string
          created_at?: string
          created_by?: string | null
          expected_date: string
          id?: string
          linked_requirement_ids?: Json
          linked_wo_ids?: Json
          material_grade: string
          po_id: string
          qty_kg: number
          rate_per_kg: number
          remarks?: string | null
          status?: string
          supplier_id?: string | null
          total_value?: number | null
          updated_at?: string
        }
        Update: {
          alloy?: string
          created_at?: string
          created_by?: string | null
          expected_date?: string
          id?: string
          linked_requirement_ids?: Json
          linked_wo_ids?: Json
          material_grade?: string
          po_id?: string
          qty_kg?: number
          rate_per_kg?: number
          remarks?: string | null
          status?: string
          supplier_id?: string | null
          total_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_material_po_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
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
            foreignKeyName: "raw_po_reconciliations_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "v_operator_daily"
            referencedColumns: ["operator_id"]
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
            foreignKeyName: "raw_purchase_orders_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_operator_daily"
            referencedColumns: ["operator_id"]
          },
          {
            foreignKeyName: "raw_purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_operator_daily"
            referencedColumns: ["operator_id"]
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
          {
            foreignKeyName: "raw_purchase_orders_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
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
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          role_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          role_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          role_name?: string
          updated_at?: string
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
          {
            foreignKeyName: "routing_steps_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_bookings: {
        Row: {
          booking_date: string
          created_at: string
          currency: string
          customer_id: string | null
          expected_delivery_date: string | null
          id: string
          incoterm: string | null
          payment_terms_days: number | null
          po_number: string
          so_id: string
          status: string
          total_value: number
          updated_at: string
        }
        Insert: {
          booking_date?: string
          created_at?: string
          currency?: string
          customer_id?: string | null
          expected_delivery_date?: string | null
          id?: string
          incoterm?: string | null
          payment_terms_days?: number | null
          po_number: string
          so_id: string
          status?: string
          total_value?: number
          updated_at?: string
        }
        Update: {
          booking_date?: string
          created_at?: string
          currency?: string
          customer_id?: string | null
          expected_delivery_date?: string | null
          id?: string
          incoterm?: string | null
          payment_terms_days?: number | null
          po_number?: string
          so_id?: string
          status?: string
          total_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_last_order"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_bookings_so_id_fkey"
            columns: ["so_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_items: {
        Row: {
          alloy: string | null
          created_at: string | null
          drawing_number: string | null
          due_date: string | null
          gross_weight_per_pc_g: number | null
          id: string
          item_code: string
          line_amount: number | null
          line_number: number
          material_size: string | null
          net_weight_per_pc_g: number | null
          price_per_pc: number | null
          quantity: number
          sales_order_id: string
          updated_at: string | null
          work_order_id: string | null
        }
        Insert: {
          alloy?: string | null
          created_at?: string | null
          drawing_number?: string | null
          due_date?: string | null
          gross_weight_per_pc_g?: number | null
          id?: string
          item_code: string
          line_amount?: number | null
          line_number: number
          material_size?: string | null
          net_weight_per_pc_g?: number | null
          price_per_pc?: number | null
          quantity: number
          sales_order_id: string
          updated_at?: string | null
          work_order_id?: string | null
        }
        Update: {
          alloy?: string | null
          created_at?: string | null
          drawing_number?: string | null
          due_date?: string | null
          gross_weight_per_pc_g?: number | null
          id?: string
          item_code?: string
          line_amount?: number | null
          line_number?: number
          material_size?: string | null
          net_weight_per_pc_g?: number | null
          price_per_pc?: number | null
          quantity?: number
          sales_order_id?: string
          updated_at?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_items_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
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
          item_id: string | null
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
          item_id?: string | null
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
          item_id?: string | null
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
            foreignKeyName: "sales_order_line_items_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_operator_daily"
            referencedColumns: ["operator_id"]
          },
          {
            foreignKeyName: "sales_order_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_master"
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
            foreignKeyName: "sales_order_line_items_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "v_operator_daily"
            referencedColumns: ["operator_id"]
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
          {
            foreignKeyName: "sales_order_line_items_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          advance_payment: Json | null
          advance_payment_received: boolean | null
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          customer: string
          customer_id: string | null
          cycle_time_seconds: number | null
          drawing_number: string | null
          expected_delivery_date: string | null
          gross_weight_per_pc_grams: number | null
          id: string
          incoterm: string | null
          items: Json
          line_level_pricing: boolean | null
          material_rod_forging_size_mm: string | null
          net_weight_per_pc_grams: number | null
          party_code: string | null
          payment_terms_days: number | null
          po_date: string
          po_number: string
          price_per_pc: number | null
          so_id: string
          status: string
          tax_profile_id: string | null
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          advance_payment?: Json | null
          advance_payment_received?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          customer: string
          customer_id?: string | null
          cycle_time_seconds?: number | null
          drawing_number?: string | null
          expected_delivery_date?: string | null
          gross_weight_per_pc_grams?: number | null
          id?: string
          incoterm?: string | null
          items: Json
          line_level_pricing?: boolean | null
          material_rod_forging_size_mm?: string | null
          net_weight_per_pc_grams?: number | null
          party_code?: string | null
          payment_terms_days?: number | null
          po_date: string
          po_number: string
          price_per_pc?: number | null
          so_id: string
          status?: string
          tax_profile_id?: string | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          advance_payment?: Json | null
          advance_payment_received?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          customer?: string
          customer_id?: string | null
          cycle_time_seconds?: number | null
          drawing_number?: string | null
          expected_delivery_date?: string | null
          gross_weight_per_pc_grams?: number | null
          id?: string
          incoterm?: string | null
          items?: Json
          line_level_pricing?: boolean | null
          material_rod_forging_size_mm?: string | null
          net_weight_per_pc_grams?: number | null
          party_code?: string | null
          payment_terms_days?: number | null
          po_date?: string
          po_number?: string
          price_per_pc?: number | null
          so_id?: string
          status?: string
          tax_profile_id?: string | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_last_order"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_master"
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
      shipment_events: {
        Row: {
          created_at: string | null
          details: Json | null
          event_time: string | null
          event_type: Database["public"]["Enums"]["shipment_event_type"]
          id: string
          shipment_id: string
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          event_time?: string | null
          event_type: Database["public"]["Enums"]["shipment_event_type"]
          id?: string
          shipment_id: string
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          event_time?: string | null
          event_type?: Database["public"]["Enums"]["shipment_event_type"]
          id?: string
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_events_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
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
          boxes: number | null
          carrier: string | null
          coo_file: string | null
          created_at: string
          customer: string
          delivered_date: string | null
          documents: Json | null
          gross_weight_kg: number | null
          id: string
          incoterm: string | null
          invoice_file: string | null
          lr_no: string | null
          net_weight_kg: number | null
          packing_list_file: string | null
          ship_date: string
          ship_id: string
          ship_to_address: Json | null
          so_id: string | null
          transporter_name: string | null
          wo_id: string | null
        }
        Insert: {
          boxes?: number | null
          carrier?: string | null
          coo_file?: string | null
          created_at?: string
          customer: string
          delivered_date?: string | null
          documents?: Json | null
          gross_weight_kg?: number | null
          id?: string
          incoterm?: string | null
          invoice_file?: string | null
          lr_no?: string | null
          net_weight_kg?: number | null
          packing_list_file?: string | null
          ship_date?: string
          ship_id: string
          ship_to_address?: Json | null
          so_id?: string | null
          transporter_name?: string | null
          wo_id?: string | null
        }
        Update: {
          boxes?: number | null
          carrier?: string | null
          coo_file?: string | null
          created_at?: string
          customer?: string
          delivered_date?: string | null
          documents?: Json | null
          gross_weight_kg?: number | null
          id?: string
          incoterm?: string | null
          invoice_file?: string | null
          lr_no?: string | null
          net_weight_kg?: number | null
          packing_list_file?: string | null
          ship_date?: string
          ship_id?: string
          ship_to_address?: Json | null
          so_id?: string | null
          transporter_name?: string | null
          wo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_so_id_fkey"
            columns: ["so_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
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
          {
            foreignKeyName: "wo_actions_log_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
            referencedColumns: ["id"]
          },
        ]
      }
      wo_external_moves: {
        Row: {
          challan_no: string | null
          created_at: string | null
          created_by: string | null
          dispatch_date: string | null
          expected_return_date: string | null
          id: string
          operation_tag: string | null
          partner_id: string | null
          process: string
          quantity_returned: number | null
          quantity_sent: number
          remarks: string | null
          returned_date: string | null
          status: string | null
          updated_at: string | null
          work_order_id: string
        }
        Insert: {
          challan_no?: string | null
          created_at?: string | null
          created_by?: string | null
          dispatch_date?: string | null
          expected_return_date?: string | null
          id?: string
          operation_tag?: string | null
          partner_id?: string | null
          process: string
          quantity_returned?: number | null
          quantity_sent: number
          remarks?: string | null
          returned_date?: string | null
          status?: string | null
          updated_at?: string | null
          work_order_id: string
        }
        Update: {
          challan_no?: string | null
          created_at?: string | null
          created_by?: string | null
          dispatch_date?: string | null
          expected_return_date?: string | null
          id?: string
          operation_tag?: string | null
          partner_id?: string | null
          process?: string
          quantity_returned?: number | null
          quantity_sent?: number
          remarks?: string | null
          returned_date?: string | null
          status?: string | null
          updated_at?: string | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wo_external_moves_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "external_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_external_moves_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "wo_external_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_external_moves_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_external_moves_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
            referencedColumns: ["id"]
          },
        ]
      }
      wo_external_receipts: {
        Row: {
          created_at: string | null
          grn_no: string | null
          id: string
          move_id: string
          quantity_received: number
          received_at: string | null
          received_by: string | null
          remarks: string | null
        }
        Insert: {
          created_at?: string | null
          grn_no?: string | null
          id?: string
          move_id: string
          quantity_received: number
          received_at?: string | null
          received_by?: string | null
          remarks?: string | null
        }
        Update: {
          created_at?: string | null
          grn_no?: string | null
          id?: string
          move_id?: string
          quantity_received?: number
          received_at?: string | null
          received_by?: string | null
          remarks?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wo_external_receipts_move_id_fkey"
            columns: ["move_id"]
            isOneToOne: false
            referencedRelation: "wo_external_moves"
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
            referencedRelation: "machine_status_vw"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "wo_machine_assignments_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_machine_assignments_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "v_machine_daily"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "wo_machine_assignments_override_applied_by_fkey"
            columns: ["override_applied_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_machine_assignments_override_applied_by_fkey"
            columns: ["override_applied_by"]
            isOneToOne: false
            referencedRelation: "v_operator_daily"
            referencedColumns: ["operator_id"]
          },
          {
            foreignKeyName: "wo_machine_assignments_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_machine_assignments_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
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
          {
            foreignKeyName: "wo_material_issues_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
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
          {
            foreignKeyName: "wo_stage_history_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          actual_cycle_time_hours: number | null
          bom: Json | null
          created_at: string
          current_stage: Database["public"]["Enums"]["wo_stage"] | null
          customer: string
          customer_id: string | null
          customer_po: string | null
          cutting_required: boolean | null
          cycle_time_seconds: number | null
          dispatch_allowed: boolean | null
          display_id: string | null
          due_date: string
          external_process_type: string | null
          external_status: string | null
          final_qc_result: string | null
          financial_snapshot: Json | null
          forging_required: boolean | null
          forging_vendor: string | null
          gross_weight_per_pc: number | null
          hidden_financial: boolean | null
          id: string
          item_code: string
          material_location: string | null
          material_size_mm: string | null
          net_weight_per_pc: number | null
          priority: number | null
          production_allowed: boolean | null
          production_end: string | null
          production_locked: boolean | null
          production_release_date: string | null
          production_release_notes: string | null
          production_release_status: Database["public"]["Enums"]["production_release_status"]
          production_released_by: string | null
          production_start: string | null
          qc_final_approved_at: string | null
          qc_final_approved_by: string | null
          qc_final_remarks: string | null
          qc_final_status: string | null
          qc_first_piece_approved_at: string | null
          qc_first_piece_approved_by: string | null
          qc_first_piece_passed: boolean
          qc_first_piece_remarks: string | null
          qc_first_piece_status: string | null
          qc_material_approved_at: string | null
          qc_material_approved_by: string | null
          qc_material_passed: boolean
          qc_material_remarks: string | null
          qc_material_status: string | null
          qc_raw_material_approved_at: string | null
          qc_raw_material_approved_by: string | null
          qc_raw_material_remarks: string | null
          qc_raw_material_status: string | null
          qc_status: string | null
          qty_external_wip: number | null
          quality_released: boolean
          quality_released_at: string | null
          quality_released_by: string | null
          quantity: number
          ready_for_dispatch: boolean | null
          revision: string | null
          sales_order: string | null
          sampling_plan_reference: string | null
          site_id: string | null
          so_id: string | null
          status: Database["public"]["Enums"]["wo_status"]
          traceability_frozen: boolean
          updated_at: string
          wo_id: string | null
          wo_number: string | null
        }
        Insert: {
          actual_cycle_time_hours?: number | null
          bom?: Json | null
          created_at?: string
          current_stage?: Database["public"]["Enums"]["wo_stage"] | null
          customer: string
          customer_id?: string | null
          customer_po?: string | null
          cutting_required?: boolean | null
          cycle_time_seconds?: number | null
          dispatch_allowed?: boolean | null
          display_id?: string | null
          due_date: string
          external_process_type?: string | null
          external_status?: string | null
          final_qc_result?: string | null
          financial_snapshot?: Json | null
          forging_required?: boolean | null
          forging_vendor?: string | null
          gross_weight_per_pc?: number | null
          hidden_financial?: boolean | null
          id?: string
          item_code: string
          material_location?: string | null
          material_size_mm?: string | null
          net_weight_per_pc?: number | null
          priority?: number | null
          production_allowed?: boolean | null
          production_end?: string | null
          production_locked?: boolean | null
          production_release_date?: string | null
          production_release_notes?: string | null
          production_release_status?: Database["public"]["Enums"]["production_release_status"]
          production_released_by?: string | null
          production_start?: string | null
          qc_final_approved_at?: string | null
          qc_final_approved_by?: string | null
          qc_final_remarks?: string | null
          qc_final_status?: string | null
          qc_first_piece_approved_at?: string | null
          qc_first_piece_approved_by?: string | null
          qc_first_piece_passed?: boolean
          qc_first_piece_remarks?: string | null
          qc_first_piece_status?: string | null
          qc_material_approved_at?: string | null
          qc_material_approved_by?: string | null
          qc_material_passed?: boolean
          qc_material_remarks?: string | null
          qc_material_status?: string | null
          qc_raw_material_approved_at?: string | null
          qc_raw_material_approved_by?: string | null
          qc_raw_material_remarks?: string | null
          qc_raw_material_status?: string | null
          qc_status?: string | null
          qty_external_wip?: number | null
          quality_released?: boolean
          quality_released_at?: string | null
          quality_released_by?: string | null
          quantity: number
          ready_for_dispatch?: boolean | null
          revision?: string | null
          sales_order?: string | null
          sampling_plan_reference?: string | null
          site_id?: string | null
          so_id?: string | null
          status?: Database["public"]["Enums"]["wo_status"]
          traceability_frozen?: boolean
          updated_at?: string
          wo_id?: string | null
          wo_number?: string | null
        }
        Update: {
          actual_cycle_time_hours?: number | null
          bom?: Json | null
          created_at?: string
          current_stage?: Database["public"]["Enums"]["wo_stage"] | null
          customer?: string
          customer_id?: string | null
          customer_po?: string | null
          cutting_required?: boolean | null
          cycle_time_seconds?: number | null
          dispatch_allowed?: boolean | null
          display_id?: string | null
          due_date?: string
          external_process_type?: string | null
          external_status?: string | null
          final_qc_result?: string | null
          financial_snapshot?: Json | null
          forging_required?: boolean | null
          forging_vendor?: string | null
          gross_weight_per_pc?: number | null
          hidden_financial?: boolean | null
          id?: string
          item_code?: string
          material_location?: string | null
          material_size_mm?: string | null
          net_weight_per_pc?: number | null
          priority?: number | null
          production_allowed?: boolean | null
          production_end?: string | null
          production_locked?: boolean | null
          production_release_date?: string | null
          production_release_notes?: string | null
          production_release_status?: Database["public"]["Enums"]["production_release_status"]
          production_released_by?: string | null
          production_start?: string | null
          qc_final_approved_at?: string | null
          qc_final_approved_by?: string | null
          qc_final_remarks?: string | null
          qc_final_status?: string | null
          qc_first_piece_approved_at?: string | null
          qc_first_piece_approved_by?: string | null
          qc_first_piece_passed?: boolean
          qc_first_piece_remarks?: string | null
          qc_first_piece_status?: string | null
          qc_material_approved_at?: string | null
          qc_material_approved_by?: string | null
          qc_material_passed?: boolean
          qc_material_remarks?: string | null
          qc_material_status?: string | null
          qc_raw_material_approved_at?: string | null
          qc_raw_material_approved_by?: string | null
          qc_raw_material_remarks?: string | null
          qc_raw_material_status?: string | null
          qc_status?: string | null
          qty_external_wip?: number | null
          quality_released?: boolean
          quality_released_at?: string | null
          quality_released_by?: string | null
          quantity?: number
          ready_for_dispatch?: boolean | null
          revision?: string | null
          sales_order?: string | null
          sampling_plan_reference?: string | null
          site_id?: string | null
          so_id?: string | null
          status?: Database["public"]["Enums"]["wo_status"]
          traceability_frozen?: boolean
          updated_at?: string
          wo_id?: string | null
          wo_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_last_order"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "work_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      customer_last_order: {
        Row: {
          customer_id: string | null
          last_order_date: string | null
        }
        Relationships: []
      }
      dashboard_summary_vw: {
        Row: {
          due_today: number | null
          external_wip_pcs: number | null
          late_deliveries: number | null
          maintenance_overdue: number | null
          material_waiting_qc: number | null
          on_time_rate_7d: number | null
          orders_in_pipeline: number | null
          orders_in_production: number | null
          qc_pending_approval: number | null
          work_orders_delayed: number | null
        }
        Relationships: []
      }
      external_processing_summary_vw: {
        Row: {
          active_moves: number | null
          kg_total: number | null
          overdue: number | null
          pcs_total: number | null
          process_name: string | null
        }
        Relationships: []
      }
      internal_flow_summary_vw: {
        Row: {
          active_jobs: number | null
          avg_wait_hours: number | null
          kg_remaining: number | null
          pcs_remaining: number | null
          stage_name: string | null
        }
        Relationships: []
      }
      inventory_procurement_status: {
        Row: {
          alloy: string | null
          available_kg: number | null
          committed_kg: number | null
          deficit_kg: number | null
          density: number | null
          id: string | null
          last_grn_date: string | null
          material_name: string | null
          open_po_count: number | null
          open_po_value: number | null
          overdue_po_count: number | null
          pending_qc_count: number | null
          recent_grn_count: number | null
          shape_type: string | null
          size_mm: number | null
          status: string | null
          total_inventory_kg: number | null
          total_on_order_kg: number | null
          total_received_kg: number | null
          total_required_kg: number | null
        }
        Relationships: []
      }
      machine_status_vw: {
        Row: {
          active_maintenance_id: string | null
          base_status: string | null
          created_at: string | null
          current_operator_id: string | null
          current_state: string | null
          current_wo_id: string | null
          department_id: string | null
          downtime_hours: number | null
          downtime_hours_30d: number | null
          downtime_reason: string | null
          last_maintenance_date: string | null
          location: string | null
          machine_code: string | null
          machine_id: string | null
          machine_name: string | null
          maintenance_count_30d: number | null
          maintenance_end: string | null
          maintenance_start: string | null
          operator_id: string | null
          running_item: string | null
          running_wo: string | null
          running_wo_display: string | null
          site_id: string | null
          updated_at: string | null
          uptime_7d: number | null
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
            foreignKeyName: "machines_current_wo_id_fkey"
            columns: ["current_wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders_restricted"
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
          {
            foreignKeyName: "machines_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "v_operator_daily"
            referencedColumns: ["operator_id"]
          },
          {
            foreignKeyName: "machines_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      v_machine_daily: {
        Row: {
          date: string | null
          log_count: number | null
          machine_id: string | null
          machine_name: string | null
          site_id: string | null
          site_name: string | null
          total_downtime: number | null
          total_planned_minutes: number | null
          total_qty_ok: number | null
          total_run_minutes: number | null
          total_scrap: number | null
          total_target_qty: number | null
        }
        Relationships: [
          {
            foreignKeyName: "machines_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      v_operator_daily: {
        Row: {
          date: string | null
          operator_id: string | null
          operator_name: string | null
          site_id: string | null
          site_name: string | null
          total_qty_ok: number | null
          total_run_minutes: number | null
          total_scrap: number | null
        }
        Relationships: [
          {
            foreignKeyName: "machines_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      wo_external_partners: {
        Row: {
          address: string | null
          contact_person: string | null
          created_at: string | null
          default_lead_time_days: number | null
          email: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          phone: string | null
          process_type: string | null
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string | null
          default_lead_time_days?: number | null
          email?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          phone?: string | null
          process_type?: string | null
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string | null
          default_lead_time_days?: number | null
          email?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          phone?: string | null
          process_type?: string | null
        }
        Relationships: []
      }
      work_orders_restricted: {
        Row: {
          bom: Json | null
          created_at: string | null
          current_stage: Database["public"]["Enums"]["wo_stage"] | null
          customer: string | null
          customer_po: string | null
          cycle_time_seconds: number | null
          dispatch_allowed: boolean | null
          display_id: string | null
          due_date: string | null
          financial_snapshot: Json | null
          gross_weight_per_pc: number | null
          hidden_financial: boolean | null
          id: string | null
          item_code: string | null
          material_size_mm: string | null
          net_weight_per_pc: number | null
          production_allowed: boolean | null
          qc_first_piece_approved_at: string | null
          qc_first_piece_approved_by: string | null
          qc_first_piece_passed: boolean | null
          qc_material_approved_at: string | null
          qc_material_approved_by: string | null
          qc_material_passed: boolean | null
          quantity: number | null
          revision: string | null
          sales_order: string | null
          so_id: string | null
          status: Database["public"]["Enums"]["wo_status"] | null
          updated_at: string | null
          wo_id: string | null
        }
        Insert: {
          bom?: Json | null
          created_at?: string | null
          current_stage?: Database["public"]["Enums"]["wo_stage"] | null
          customer?: string | null
          customer_po?: string | null
          cycle_time_seconds?: number | null
          dispatch_allowed?: boolean | null
          display_id?: string | null
          due_date?: string | null
          financial_snapshot?: never
          gross_weight_per_pc?: never
          hidden_financial?: boolean | null
          id?: string | null
          item_code?: string | null
          material_size_mm?: string | null
          net_weight_per_pc?: never
          production_allowed?: boolean | null
          qc_first_piece_approved_at?: string | null
          qc_first_piece_approved_by?: string | null
          qc_first_piece_passed?: boolean | null
          qc_material_approved_at?: string | null
          qc_material_approved_by?: string | null
          qc_material_passed?: boolean | null
          quantity?: number | null
          revision?: string | null
          sales_order?: string | null
          so_id?: string | null
          status?: Database["public"]["Enums"]["wo_status"] | null
          updated_at?: string | null
          wo_id?: string | null
        }
        Update: {
          bom?: Json | null
          created_at?: string | null
          current_stage?: Database["public"]["Enums"]["wo_stage"] | null
          customer?: string | null
          customer_po?: string | null
          cycle_time_seconds?: number | null
          dispatch_allowed?: boolean | null
          display_id?: string | null
          due_date?: string | null
          financial_snapshot?: never
          gross_weight_per_pc?: never
          hidden_financial?: boolean | null
          id?: string | null
          item_code?: string | null
          material_size_mm?: string | null
          net_weight_per_pc?: never
          production_allowed?: boolean | null
          qc_first_piece_approved_at?: string | null
          qc_first_piece_approved_by?: string | null
          qc_first_piece_passed?: boolean | null
          qc_material_approved_at?: string | null
          qc_material_approved_by?: string | null
          qc_material_passed?: boolean | null
          quantity?: number | null
          revision?: string | null
          sales_order?: string | null
          so_id?: string | null
          status?: Database["public"]["Enums"]["wo_status"] | null
          updated_at?: string | null
          wo_id?: string | null
        }
        Relationships: []
      }
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
      generate_grn_number: { Args: never; Returns: string }
      generate_ncr_number: { Args: never; Returns: string }
      generate_raw_po_number: { Args: never; Returns: string }
      generate_rpo_number: { Args: never; Returns: string }
      get_material_links: {
        Args: { _alloy: string; _material_grade: string }
        Returns: {
          linked_grn_ids: string[]
          linked_po_ids: string[]
          linked_wo_ids: string[]
        }[]
      }
      get_user_site_id: { Args: { _user_id: string }; Returns: string }
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
      is_finance_role: { Args: { _user_id: string }; Returns: boolean }
      manage_user_role: {
        Args: {
          _action: string
          _role: Database["public"]["Enums"]["app_role"]
          _target_user_id: string
        }
        Returns: undefined
      }
      mark_overdue_invoices: { Args: never; Returns: undefined }
      mark_overdue_qc_checks: { Args: never; Returns: undefined }
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
        | "super_admin"
        | "finance_admin"
        | "finance_user"
        | "ops_manager"
        | "logistics"
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
      employment_type: "internal" | "agency"
      execution_direction: "IN" | "OUT" | "COMPLETE"
      first_piece_qc_status: "not_required" | "pending" | "approved" | "failed"
      followup_channel: "phone" | "email" | "whatsapp" | "in_person"
      gst_type: "domestic" | "export" | "not_applicable"
      invoice_status:
        | "draft"
        | "issued"
        | "part_paid"
        | "paid"
        | "overdue"
        | "void"
      material_qc_status: "not_required" | "pending" | "passed" | "failed"
      material_status: "received" | "issued" | "in_use" | "consumed"
      ncr_disposition: "REWORK" | "SCRAP" | "USE_AS_IS" | "RETURN_TO_SUPPLIER"
      ncr_status:
        | "OPEN"
        | "ACTION_IN_PROGRESS"
        | "EFFECTIVENESS_PENDING"
        | "CLOSED"
      ncr_type: "INTERNAL" | "CUSTOMER" | "SUPPLIER"
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
      operation_type:
        | "RAW_MATERIAL"
        | "CNC"
        | "QC"
        | "EXTERNAL_PROCESS"
        | "PACKING"
        | "DISPATCH"
      operator_type: "RVI" | "CONTRACTOR"
      payment_method:
        | "bank_transfer"
        | "cheque"
        | "cash"
        | "upi"
        | "card"
        | "other"
      person_role: "operator" | "programmer" | "qc_inspector"
      production_release_status: "NOT_RELEASED" | "RELEASED"
      qc_result: "pass" | "fail" | "rework" | "pending"
      qc_type: "first_piece" | "in_process" | "final" | "incoming"
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
      recovery_stage:
        | "none"
        | "friendly"
        | "firm"
        | "final_notice"
        | "hold_shipments"
        | "legal"
      rpo_status:
        | "draft"
        | "pending_approval"
        | "approved"
        | "part_received"
        | "closed"
        | "cancelled"
      run_state:
        | "running"
        | "stopped"
        | "material_wait"
        | "maintenance"
        | "setup"
      sales_order_status:
        | "draft"
        | "pending_approval"
        | "approved"
        | "invoiced"
        | "closed"
        | "cancelled"
      shift_type: "DAY" | "NIGHT"
      shipment_event_type:
        | "label_created"
        | "picked"
        | "in_transit"
        | "out_for_delivery"
        | "delivered"
        | "exception"
      wo_stage:
        | "goods_in"
        | "production"
        | "qc"
        | "packing"
        | "dispatch"
        | "cutting_queue"
        | "cutting_in_progress"
        | "cutting_complete"
        | "forging_queue"
        | "forging_in_progress"
        | "forging_complete"
        | "production_planning"
        | "proforma_sent"
        | "raw_material_check"
        | "raw_material_order"
        | "raw_material_inwards"
        | "raw_material_qc"
        | "cutting"
        | "forging"
        | "cnc_production"
        | "first_piece_qc"
        | "mass_production"
        | "buffing"
        | "plating"
        | "blasting"
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
        "super_admin",
        "finance_admin",
        "finance_user",
        "ops_manager",
        "logistics",
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
      employment_type: ["internal", "agency"],
      execution_direction: ["IN", "OUT", "COMPLETE"],
      first_piece_qc_status: ["not_required", "pending", "approved", "failed"],
      followup_channel: ["phone", "email", "whatsapp", "in_person"],
      gst_type: ["domestic", "export", "not_applicable"],
      invoice_status: [
        "draft",
        "issued",
        "part_paid",
        "paid",
        "overdue",
        "void",
      ],
      material_qc_status: ["not_required", "pending", "passed", "failed"],
      material_status: ["received", "issued", "in_use", "consumed"],
      ncr_disposition: ["REWORK", "SCRAP", "USE_AS_IS", "RETURN_TO_SUPPLIER"],
      ncr_status: [
        "OPEN",
        "ACTION_IN_PROGRESS",
        "EFFECTIVENESS_PENDING",
        "CLOSED",
      ],
      ncr_type: ["INTERNAL", "CUSTOMER", "SUPPLIER"],
      operation_letter: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"],
      operation_type: [
        "RAW_MATERIAL",
        "CNC",
        "QC",
        "EXTERNAL_PROCESS",
        "PACKING",
        "DISPATCH",
      ],
      operator_type: ["RVI", "CONTRACTOR"],
      payment_method: [
        "bank_transfer",
        "cheque",
        "cash",
        "upi",
        "card",
        "other",
      ],
      person_role: ["operator", "programmer", "qc_inspector"],
      production_release_status: ["NOT_RELEASED", "RELEASED"],
      qc_result: ["pass", "fail", "rework", "pending"],
      qc_type: ["first_piece", "in_process", "final", "incoming"],
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
      recovery_stage: [
        "none",
        "friendly",
        "firm",
        "final_notice",
        "hold_shipments",
        "legal",
      ],
      rpo_status: [
        "draft",
        "pending_approval",
        "approved",
        "part_received",
        "closed",
        "cancelled",
      ],
      run_state: [
        "running",
        "stopped",
        "material_wait",
        "maintenance",
        "setup",
      ],
      sales_order_status: [
        "draft",
        "pending_approval",
        "approved",
        "invoiced",
        "closed",
        "cancelled",
      ],
      shift_type: ["DAY", "NIGHT"],
      shipment_event_type: [
        "label_created",
        "picked",
        "in_transit",
        "out_for_delivery",
        "delivered",
        "exception",
      ],
      wo_stage: [
        "goods_in",
        "production",
        "qc",
        "packing",
        "dispatch",
        "cutting_queue",
        "cutting_in_progress",
        "cutting_complete",
        "forging_queue",
        "forging_in_progress",
        "forging_complete",
        "production_planning",
        "proforma_sent",
        "raw_material_check",
        "raw_material_order",
        "raw_material_inwards",
        "raw_material_qc",
        "cutting",
        "forging",
        "cnc_production",
        "first_piece_qc",
        "mass_production",
        "buffing",
        "plating",
        "blasting",
      ],
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
