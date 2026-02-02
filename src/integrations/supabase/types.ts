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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      calcom_webhook_audit: {
        Row: {
          attendee_email: string | null
          booking_uid: string | null
          created_at: string | null
          error_message: string | null
          event_type: string
          event_type_title: string | null
          full_payload: Json | null
          id: string
          meeting_ended_at: string | null
          meeting_started_at: string | null
          no_show_guest: boolean | null
          no_show_host: boolean | null
          organization_id: string | null
          organizer_email: string | null
          processing_result: string | null
          recording_url: string | null
          request_headers: Json | null
          request_ip: string | null
          reschedule_reason: string | null
          reschedule_uid: string | null
          scheduled_at: string | null
        }
        Insert: {
          attendee_email?: string | null
          booking_uid?: string | null
          created_at?: string | null
          error_message?: string | null
          event_type: string
          event_type_title?: string | null
          full_payload?: Json | null
          id?: string
          meeting_ended_at?: string | null
          meeting_started_at?: string | null
          no_show_guest?: boolean | null
          no_show_host?: boolean | null
          organization_id?: string | null
          organizer_email?: string | null
          processing_result?: string | null
          recording_url?: string | null
          request_headers?: Json | null
          request_ip?: string | null
          reschedule_reason?: string | null
          reschedule_uid?: string | null
          scheduled_at?: string | null
        }
        Update: {
          attendee_email?: string | null
          booking_uid?: string | null
          created_at?: string | null
          error_message?: string | null
          event_type?: string
          event_type_title?: string | null
          full_payload?: Json | null
          id?: string
          meeting_ended_at?: string | null
          meeting_started_at?: string | null
          no_show_guest?: boolean | null
          no_show_host?: boolean | null
          organization_id?: string | null
          organizer_email?: string | null
          processing_result?: string | null
          recording_url?: string | null
          request_headers?: Json | null
          request_ip?: string | null
          reschedule_reason?: string | null
          reschedule_uid?: string | null
          scheduled_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calcom_webhook_audit_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendly_webhook_audit: {
        Row: {
          booked_at: string | null
          calendly_request_id: string | null
          cancel_reason: string | null
          canceled_at: string | null
          canceled_at_ms: number | null
          canceled_by: string | null
          canceler_type: string | null
          closer_email: string | null
          created_at: string
          created_at_ms: number | null
          event_memberships: Json | null
          event_name: string | null
          event_type: string
          event_uuid: string | null
          full_payload: Json
          id: string
          invitee_email: string | null
          invitee_scheduled_by: string | null
          invitee_uuid: string | null
          is_instant_cancel: boolean | null
          new_invitee_uri: string | null
          no_show: Json | null
          old_invitee_uri: string | null
          organization_id: string | null
          payment: Json | null
          questions_and_answers: Json | null
          request_headers: Json | null
          request_ip: string | null
          rescheduled: boolean | null
          routing_form_submission: Json | null
          scheduled_at: string | null
          scheduling_method: string | null
          seconds_to_cancel: number | null
          status: string | null
          tracking_params: Json | null
          uri: string | null
          user_agent: string | null
        }
        Insert: {
          booked_at?: string | null
          calendly_request_id?: string | null
          cancel_reason?: string | null
          canceled_at?: string | null
          canceled_at_ms?: number | null
          canceled_by?: string | null
          canceler_type?: string | null
          closer_email?: string | null
          created_at?: string
          created_at_ms?: number | null
          event_memberships?: Json | null
          event_name?: string | null
          event_type: string
          event_uuid?: string | null
          full_payload: Json
          id?: string
          invitee_email?: string | null
          invitee_scheduled_by?: string | null
          invitee_uuid?: string | null
          is_instant_cancel?: boolean | null
          new_invitee_uri?: string | null
          no_show?: Json | null
          old_invitee_uri?: string | null
          organization_id?: string | null
          payment?: Json | null
          questions_and_answers?: Json | null
          request_headers?: Json | null
          request_ip?: string | null
          rescheduled?: boolean | null
          routing_form_submission?: Json | null
          scheduled_at?: string | null
          scheduling_method?: string | null
          seconds_to_cancel?: number | null
          status?: string | null
          tracking_params?: Json | null
          uri?: string | null
          user_agent?: string | null
        }
        Update: {
          booked_at?: string | null
          calendly_request_id?: string | null
          cancel_reason?: string | null
          canceled_at?: string | null
          canceled_at_ms?: number | null
          canceled_by?: string | null
          canceler_type?: string | null
          closer_email?: string | null
          created_at?: string
          created_at_ms?: number | null
          event_memberships?: Json | null
          event_name?: string | null
          event_type?: string
          event_uuid?: string | null
          full_payload?: Json
          id?: string
          invitee_email?: string | null
          invitee_scheduled_by?: string | null
          invitee_uuid?: string | null
          is_instant_cancel?: boolean | null
          new_invitee_uri?: string | null
          no_show?: Json | null
          old_invitee_uri?: string | null
          organization_id?: string | null
          payment?: Json | null
          questions_and_answers?: Json | null
          request_headers?: Json | null
          request_ip?: string | null
          rescheduled?: boolean | null
          routing_form_submission?: Json | null
          scheduled_at?: string | null
          scheduling_method?: string | null
          seconds_to_cancel?: number | null
          status?: string | null
          tracking_params?: Json | null
          uri?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendly_webhook_audit_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      call_outcomes: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string | null
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id?: string | null
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "call_outcomes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      call_types: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      close_field_mappings: {
        Row: {
          close_field_choices: Json | null
          close_field_id: string
          close_field_name: string
          close_field_type: string
          created_at: string
          id: string
          is_synced: boolean
          local_field_slug: string
          organization_id: string
          show_in_dashboard: boolean
          show_in_filters: boolean
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          close_field_choices?: Json | null
          close_field_id: string
          close_field_name: string
          close_field_type?: string
          created_at?: string
          id?: string
          is_synced?: boolean
          local_field_slug: string
          organization_id: string
          show_in_dashboard?: boolean
          show_in_filters?: boolean
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          close_field_choices?: Json | null
          close_field_id?: string
          close_field_name?: string
          close_field_type?: string
          created_at?: string
          id?: string
          is_synced?: boolean
          local_field_slug?: string
          organization_id?: string
          show_in_dashboard?: boolean
          show_in_filters?: boolean
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "close_field_mappings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      closer_access_tokens: {
        Row: {
          closer_name: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          last_used_at: string | null
          organization_id: string | null
          token: string
        }
        Insert: {
          closer_name: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          organization_id?: string | null
          token?: string
        }
        Update: {
          closer_name?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          organization_id?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "closer_access_tokens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      closers: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string | null
          profile_id: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id?: string | null
          profile_id?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string | null
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "closers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_definitions: {
        Row: {
          applies_to: string[]
          created_at: string
          field_name: string
          field_slug: string
          field_type: string
          icon: string | null
          id: string
          is_active: boolean
          is_required: boolean
          organization_id: string
          show_in_dashboard: boolean
          show_in_exports: boolean
          show_in_filters: boolean
          show_in_forms: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          applies_to?: string[]
          created_at?: string
          field_name: string
          field_slug: string
          field_type?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          organization_id: string
          show_in_dashboard?: boolean
          show_in_exports?: boolean
          show_in_filters?: boolean
          show_in_forms?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          applies_to?: string[]
          created_at?: string
          field_name?: string
          field_slug?: string
          field_type?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          organization_id?: string
          show_in_dashboard?: boolean
          show_in_exports?: boolean
          show_in_filters?: boolean
          show_in_forms?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_definitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_options: {
        Row: {
          color: string | null
          created_at: string
          field_definition_id: string
          id: string
          is_active: boolean
          option_label: string
          option_value: string
          sort_order: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          field_definition_id: string
          id?: string
          is_active?: boolean
          option_label: string
          option_value: string
          sort_order?: number
        }
        Update: {
          color?: string | null
          created_at?: string
          field_definition_id?: string
          id?: string
          is_active?: boolean
          option_label?: string
          option_value?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_options_field_definition_id_fkey"
            columns: ["field_definition_id"]
            isOneToOne: false
            referencedRelation: "custom_field_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_values: {
        Row: {
          created_at: string
          field_definition_id: string
          id: string
          organization_id: string
          record_id: string
          record_type: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          field_definition_id: string
          id?: string
          organization_id: string
          record_id: string
          record_type: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          field_definition_id?: string
          id?: string
          organization_id?: string
          record_id?: string
          record_type?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_values_field_definition_id_fkey"
            columns: ["field_definition_id"]
            isOneToOne: false
            referencedRelation: "custom_field_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_field_values_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_layouts: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          layout_config: Json
          layout_name: string
          layout_type: string
          organization_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          layout_config?: Json
          layout_name?: string
          layout_type?: string
          organization_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          layout_config?: Json
          layout_name?: string
          layout_type?: string
          organization_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_layouts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_widgets: {
        Row: {
          chart_config: Json | null
          comparison_enabled: boolean | null
          created_at: string | null
          dashboard_id: string
          dataset_id: string
          filters: Json | null
          id: string
          is_active: boolean | null
          metric_config: Json | null
          organization_id: string
          position: Json | null
          refresh_interval_seconds: number | null
          title: string | null
          updated_at: string | null
          widget_type: string
        }
        Insert: {
          chart_config?: Json | null
          comparison_enabled?: boolean | null
          created_at?: string | null
          dashboard_id: string
          dataset_id: string
          filters?: Json | null
          id?: string
          is_active?: boolean | null
          metric_config?: Json | null
          organization_id: string
          position?: Json | null
          refresh_interval_seconds?: number | null
          title?: string | null
          updated_at?: string | null
          widget_type?: string
        }
        Update: {
          chart_config?: Json | null
          comparison_enabled?: boolean | null
          created_at?: string | null
          dashboard_id?: string
          dataset_id?: string
          filters?: Json | null
          id?: string
          is_active?: boolean | null
          metric_config?: Json | null
          organization_id?: string
          position?: Json | null
          refresh_interval_seconds?: number | null
          title?: string | null
          updated_at?: string | null
          widget_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_widgets_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "webhook_dashboards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_widgets_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_widgets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dataset_alerts: {
        Row: {
          condition: Json
          cooldown_minutes: number | null
          created_at: string | null
          dataset_id: string
          id: string
          is_active: boolean | null
          last_triggered_at: string | null
          name: string
          notification_config: Json | null
          notification_type: string
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          condition: Json
          cooldown_minutes?: number | null
          created_at?: string | null
          dataset_id: string
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          name: string
          notification_config?: Json | null
          notification_type?: string
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          condition?: Json
          cooldown_minutes?: number | null
          created_at?: string | null
          dataset_id?: string
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          name?: string
          notification_config?: Json | null
          notification_type?: string
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dataset_alerts_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dataset_alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dataset_calculated_fields: {
        Row: {
          comparison_period: string | null
          created_at: string | null
          dataset_id: string
          display_name: string
          field_slug: string
          formula: string
          formula_type: string
          id: string
          is_active: boolean | null
          organization_id: string
          refresh_mode: string | null
          time_scope: string | null
          updated_at: string | null
        }
        Insert: {
          comparison_period?: string | null
          created_at?: string | null
          dataset_id: string
          display_name: string
          field_slug: string
          formula: string
          formula_type?: string
          id?: string
          is_active?: boolean | null
          organization_id: string
          refresh_mode?: string | null
          time_scope?: string | null
          updated_at?: string | null
        }
        Update: {
          comparison_period?: string | null
          created_at?: string | null
          dataset_id?: string
          display_name?: string
          field_slug?: string
          formula?: string
          formula_type?: string
          id?: string
          is_active?: boolean | null
          organization_id?: string
          refresh_mode?: string | null
          time_scope?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dataset_calculated_fields_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dataset_calculated_fields_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dataset_enrichments: {
        Row: {
          auto_create_if_missing: boolean | null
          created_at: string | null
          dataset_id: string
          field_mappings: Json | null
          id: string
          is_active: boolean | null
          match_field: string
          organization_id: string
          target_field: string
          target_table: string
          updated_at: string | null
        }
        Insert: {
          auto_create_if_missing?: boolean | null
          created_at?: string | null
          dataset_id: string
          field_mappings?: Json | null
          id?: string
          is_active?: boolean | null
          match_field: string
          organization_id: string
          target_field: string
          target_table: string
          updated_at?: string | null
        }
        Update: {
          auto_create_if_missing?: boolean | null
          created_at?: string | null
          dataset_id?: string
          field_mappings?: Json | null
          id?: string
          is_active?: boolean | null
          match_field?: string
          organization_id?: string
          target_field?: string
          target_table?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dataset_enrichments_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dataset_enrichments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dataset_fields: {
        Row: {
          created_at: string | null
          dataset_id: string
          field_name: string
          field_slug: string
          field_type: string
          format: string | null
          formula: string | null
          id: string
          is_visible: boolean | null
          organization_id: string
          sort_order: number | null
          source_config: Json | null
          source_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          dataset_id: string
          field_name: string
          field_slug: string
          field_type?: string
          format?: string | null
          formula?: string | null
          id?: string
          is_visible?: boolean | null
          organization_id: string
          sort_order?: number | null
          source_config?: Json | null
          source_type?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          dataset_id?: string
          field_name?: string
          field_slug?: string
          field_type?: string
          format?: string | null
          formula?: string | null
          id?: string
          is_visible?: boolean | null
          organization_id?: string
          sort_order?: number | null
          source_config?: Json | null
          source_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dataset_fields_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dataset_fields_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dataset_records: {
        Row: {
          created_at: string | null
          dataset_id: string | null
          error_message: string | null
          extracted_data: Json | null
          id: string
          organization_id: string
          payload_hash: string | null
          processing_status: string | null
          raw_payload: Json
          webhook_connection_id: string | null
        }
        Insert: {
          created_at?: string | null
          dataset_id?: string | null
          error_message?: string | null
          extracted_data?: Json | null
          id?: string
          organization_id: string
          payload_hash?: string | null
          processing_status?: string | null
          raw_payload: Json
          webhook_connection_id?: string | null
        }
        Update: {
          created_at?: string | null
          dataset_id?: string | null
          error_message?: string | null
          extracted_data?: Json | null
          id?: string
          organization_id?: string
          payload_hash?: string | null
          processing_status?: string | null
          raw_payload?: Json
          webhook_connection_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dataset_records_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dataset_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dataset_records_webhook_connection_id_fkey"
            columns: ["webhook_connection_id"]
            isOneToOne: false
            referencedRelation: "webhook_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      datasets: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          name: string
          organization_id: string
          realtime_enabled: boolean | null
          retention_days: number | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          organization_id: string
          realtime_enabled?: boolean | null
          retention_days?: number | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          organization_id?: string
          realtime_enabled?: boolean | null
          retention_days?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "datasets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_display_columns: {
        Row: {
          created_at: string | null
          display_label: string
          field_key: string
          field_source: string | null
          id: string
          is_visible: boolean | null
          organization_id: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_label: string
          field_key: string
          field_source?: string | null
          id?: string
          is_visible?: boolean | null
          organization_id: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_label?: string
          field_key?: string
          field_source?: string | null
          id?: string
          is_visible?: boolean | null
          organization_id?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_display_columns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          actual_duration_minutes: number | null
          booked_at: string | null
          booking_metadata: Json | null
          booking_platform: string | null
          booking_responses: Json | null
          calcom_booking_uid: string | null
          calcom_event_type_id: string | null
          calendly_event_uuid: string | null
          calendly_invitee_uuid: string | null
          call_status: string
          call_type_id: string | null
          cancellation_reason: string | null
          close_custom_fields: Json | null
          closer_email: string | null
          closer_id: string | null
          closer_name: string | null
          created_at: string
          event_name: string | null
          event_outcome: Database["public"]["Enums"]["event_outcome"] | null
          ghl_contact_id: string | null
          hubspot_contact_id: string | null
          id: string
          lead_email: string
          lead_id: string | null
          lead_name: string
          lead_phone: string | null
          meeting_ended_at: string | null
          meeting_started_at: string | null
          no_show_guest: boolean | null
          no_show_host: boolean | null
          no_show_reported_at: string | null
          notes: string | null
          organization_id: string | null
          pcf_outcome_label: string | null
          pcf_submitted: boolean
          pcf_submitted_at: string | null
          recording_url: string | null
          reschedule_reason: string | null
          rescheduled_from_uid: string | null
          rescheduled_to_uid: string | null
          scheduled_at: string
          setter_id: string | null
          setter_name: string | null
          source_id: string | null
          traffic_type_id: string | null
          updated_at: string
        }
        Insert: {
          actual_duration_minutes?: number | null
          booked_at?: string | null
          booking_metadata?: Json | null
          booking_platform?: string | null
          booking_responses?: Json | null
          calcom_booking_uid?: string | null
          calcom_event_type_id?: string | null
          calendly_event_uuid?: string | null
          calendly_invitee_uuid?: string | null
          call_status?: string
          call_type_id?: string | null
          cancellation_reason?: string | null
          close_custom_fields?: Json | null
          closer_email?: string | null
          closer_id?: string | null
          closer_name?: string | null
          created_at?: string
          event_name?: string | null
          event_outcome?: Database["public"]["Enums"]["event_outcome"] | null
          ghl_contact_id?: string | null
          hubspot_contact_id?: string | null
          id?: string
          lead_email: string
          lead_id?: string | null
          lead_name: string
          lead_phone?: string | null
          meeting_ended_at?: string | null
          meeting_started_at?: string | null
          no_show_guest?: boolean | null
          no_show_host?: boolean | null
          no_show_reported_at?: string | null
          notes?: string | null
          organization_id?: string | null
          pcf_outcome_label?: string | null
          pcf_submitted?: boolean
          pcf_submitted_at?: string | null
          recording_url?: string | null
          reschedule_reason?: string | null
          rescheduled_from_uid?: string | null
          rescheduled_to_uid?: string | null
          scheduled_at: string
          setter_id?: string | null
          setter_name?: string | null
          source_id?: string | null
          traffic_type_id?: string | null
          updated_at?: string
        }
        Update: {
          actual_duration_minutes?: number | null
          booked_at?: string | null
          booking_metadata?: Json | null
          booking_platform?: string | null
          booking_responses?: Json | null
          calcom_booking_uid?: string | null
          calcom_event_type_id?: string | null
          calendly_event_uuid?: string | null
          calendly_invitee_uuid?: string | null
          call_status?: string
          call_type_id?: string | null
          cancellation_reason?: string | null
          close_custom_fields?: Json | null
          closer_email?: string | null
          closer_id?: string | null
          closer_name?: string | null
          created_at?: string
          event_name?: string | null
          event_outcome?: Database["public"]["Enums"]["event_outcome"] | null
          ghl_contact_id?: string | null
          hubspot_contact_id?: string | null
          id?: string
          lead_email?: string
          lead_id?: string | null
          lead_name?: string
          lead_phone?: string | null
          meeting_ended_at?: string | null
          meeting_started_at?: string | null
          no_show_guest?: boolean | null
          no_show_host?: boolean | null
          no_show_reported_at?: string | null
          notes?: string | null
          organization_id?: string | null
          pcf_outcome_label?: string | null
          pcf_submitted?: boolean
          pcf_submitted_at?: string | null
          recording_url?: string | null
          reschedule_reason?: string | null
          rescheduled_from_uid?: string | null
          rescheduled_to_uid?: string | null
          scheduled_at?: string
          setter_id?: string | null
          setter_name?: string | null
          source_id?: string | null
          traffic_type_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_call_type_id_fkey"
            columns: ["call_type_id"]
            isOneToOne: false
            referencedRelation: "call_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_setter_id_fkey"
            columns: ["setter_id"]
            isOneToOne: false
            referencedRelation: "setters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_traffic_type_id_fkey"
            columns: ["traffic_type_id"]
            isOneToOne: false
            referencedRelation: "traffic_types"
            referencedColumns: ["id"]
          },
        ]
      }
      form_configs: {
        Row: {
          created_at: string
          fields: Json
          form_type: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          fields?: Json
          form_type?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          fields?: Json
          form_type?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      form_definitions: {
        Row: {
          assigned_closers: string[] | null
          created_at: string | null
          dataset_id: string | null
          description: string | null
          entity_type: string
          icon: string | null
          id: string
          is_active: boolean | null
          is_recurring: boolean | null
          name: string
          organization_id: string
          recurrence_pattern: string | null
          slug: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_closers?: string[] | null
          created_at?: string | null
          dataset_id?: string | null
          description?: string | null
          entity_type?: string
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_recurring?: boolean | null
          name: string
          organization_id: string
          recurrence_pattern?: string | null
          slug: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_closers?: string[] | null
          created_at?: string | null
          dataset_id?: string | null
          description?: string | null
          entity_type?: string
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_recurring?: boolean | null
          name?: string
          organization_id?: string
          recurrence_pattern?: string | null
          slug?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_definitions_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_definitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      form_field_values: {
        Row: {
          created_at: string | null
          field_id: string
          id: string
          organization_id: string
          submission_id: string
          updated_at: string | null
          value_boolean: boolean | null
          value_date: string | null
          value_json: Json | null
          value_number: number | null
          value_text: string | null
        }
        Insert: {
          created_at?: string | null
          field_id: string
          id?: string
          organization_id: string
          submission_id: string
          updated_at?: string | null
          value_boolean?: boolean | null
          value_date?: string | null
          value_json?: Json | null
          value_number?: number | null
          value_text?: string | null
        }
        Update: {
          created_at?: string | null
          field_id?: string
          id?: string
          organization_id?: string
          submission_id?: string
          updated_at?: string | null
          value_boolean?: boolean | null
          value_date?: string | null
          value_json?: Json | null
          value_number?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_field_values_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "form_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_field_values_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_field_values_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "form_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      form_fields: {
        Row: {
          conditional_logic: Json | null
          created_at: string | null
          creates_metric: boolean | null
          default_value: Json | null
          field_name: string
          field_slug: string
          field_type: string
          form_definition_id: string
          help_text: string | null
          id: string
          is_active: boolean | null
          is_required: boolean | null
          label: string
          metric_config: Json | null
          options: Json | null
          organization_id: string
          placeholder: string | null
          show_in_summary: boolean | null
          sort_order: number | null
          updated_at: string | null
          validation_rules: Json | null
        }
        Insert: {
          conditional_logic?: Json | null
          created_at?: string | null
          creates_metric?: boolean | null
          default_value?: Json | null
          field_name: string
          field_slug: string
          field_type?: string
          form_definition_id: string
          help_text?: string | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          label: string
          metric_config?: Json | null
          options?: Json | null
          organization_id: string
          placeholder?: string | null
          show_in_summary?: boolean | null
          sort_order?: number | null
          updated_at?: string | null
          validation_rules?: Json | null
        }
        Update: {
          conditional_logic?: Json | null
          created_at?: string | null
          creates_metric?: boolean | null
          default_value?: Json | null
          field_name?: string
          field_slug?: string
          field_type?: string
          form_definition_id?: string
          help_text?: string | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          label?: string
          metric_config?: Json | null
          options?: Json | null
          organization_id?: string
          placeholder?: string | null
          show_in_summary?: boolean | null
          sort_order?: number | null
          updated_at?: string | null
          validation_rules?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "form_fields_form_definition_id_fkey"
            columns: ["form_definition_id"]
            isOneToOne: false
            referencedRelation: "form_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_fields_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      form_metrics: {
        Row: {
          aggregate_by: string | null
          color: string | null
          created_at: string | null
          dashboard_position: number | null
          description: string | null
          display_name: string
          field_id: string | null
          form_definition_id: string
          format: string | null
          formula_config: Json | null
          formula_type: string
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string
          show_on_dashboard: boolean | null
          updated_at: string | null
        }
        Insert: {
          aggregate_by?: string | null
          color?: string | null
          created_at?: string | null
          dashboard_position?: number | null
          description?: string | null
          display_name: string
          field_id?: string | null
          form_definition_id: string
          format?: string | null
          formula_config?: Json | null
          formula_type?: string
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id: string
          show_on_dashboard?: boolean | null
          updated_at?: string | null
        }
        Update: {
          aggregate_by?: string | null
          color?: string | null
          created_at?: string | null
          dashboard_position?: number | null
          description?: string | null
          display_name?: string
          field_id?: string | null
          form_definition_id?: string
          format?: string | null
          formula_config?: Json | null
          formula_type?: string
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string
          show_on_dashboard?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_metrics_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "form_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_metrics_form_definition_id_fkey"
            columns: ["form_definition_id"]
            isOneToOne: false
            referencedRelation: "form_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_metrics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submissions: {
        Row: {
          created_at: string | null
          entity_id: string | null
          entity_name: string | null
          entity_type: string
          form_definition_id: string
          id: string
          organization_id: string
          period_date: string | null
          status: string | null
          submitted_at: string | null
          submitted_by_id: string | null
          submitted_by_name: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type: string
          form_definition_id: string
          id?: string
          organization_id: string
          period_date?: string | null
          status?: string | null
          submitted_at?: string | null
          submitted_by_id?: string | null
          submitted_by_name?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string
          form_definition_id?: string
          id?: string
          organization_id?: string
          period_date?: string | null
          status?: string | null
          submitted_at?: string | null
          submitted_by_id?: string | null
          submitted_by_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_form_definition_id_fkey"
            columns: ["form_definition_id"]
            isOneToOne: false
            referencedRelation: "form_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          api_key: string | null
          booking_engine: string
          connected_at: string
          created_by: string | null
          id: string
          is_active: boolean
          webhook_url: string | null
        }
        Insert: {
          api_key?: string | null
          booking_engine?: string
          connected_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          webhook_url?: string | null
        }
        Update: {
          api_key?: string | null
          booking_engine?: string
          connected_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          webhook_url?: string | null
        }
        Relationships: []
      }
      invitations: {
        Row: {
          accepted_at: string | null
          closer_name: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invite_type: string
          invited_by: string | null
          organization_id: string | null
          role: string | null
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          closer_name?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invite_type: string
          invited_by?: string | null
          organization_id?: string | null
          role?: string | null
          status?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          closer_name?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invite_type?: string
          invited_by?: string | null
          organization_id?: string | null
          role?: string | null
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          created_at: string
          current_setter_name: string | null
          email: string
          full_name: string
          id: string
          organization_id: string | null
          original_setter_name: string | null
          phone: string | null
          source_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_setter_name?: string | null
          email: string
          full_name: string
          id?: string
          organization_id?: string | null
          original_setter_name?: string | null
          phone?: string | null
          source_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_setter_name?: string | null
          email?: string
          full_name?: string
          id?: string
          organization_id?: string | null
          original_setter_name?: string | null
          phone?: string | null
          source_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_definitions: {
        Row: {
          created_at: string
          data_source: string | null
          date_field: string | null
          denominator_conditions: Json | null
          denominator_field: string | null
          description: string | null
          display_name: string
          exclude_overdue_pcf: boolean | null
          formula_type: string
          id: string
          include_cancels: boolean | null
          include_no_shows: boolean | null
          include_reschedules: boolean | null
          is_active: boolean | null
          name: string
          numerator_conditions: Json | null
          numerator_field: string | null
          organization_id: string | null
          pcf_field_id: string | null
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_source?: string | null
          date_field?: string | null
          denominator_conditions?: Json | null
          denominator_field?: string | null
          description?: string | null
          display_name: string
          exclude_overdue_pcf?: boolean | null
          formula_type?: string
          id?: string
          include_cancels?: boolean | null
          include_no_shows?: boolean | null
          include_reschedules?: boolean | null
          is_active?: boolean | null
          name: string
          numerator_conditions?: Json | null
          numerator_field?: string | null
          organization_id?: string | null
          pcf_field_id?: string | null
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_source?: string | null
          date_field?: string | null
          denominator_conditions?: Json | null
          denominator_field?: string | null
          description?: string | null
          display_name?: string
          exclude_overdue_pcf?: boolean | null
          formula_type?: string
          id?: string
          include_cancels?: boolean | null
          include_no_shows?: boolean | null
          include_reschedules?: boolean | null
          is_active?: boolean | null
          name?: string
          numerator_conditions?: Json | null
          numerator_field?: string | null
          organization_id?: string | null
          pcf_field_id?: string | null
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "metric_definitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_statuses: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string | null
          sort_order: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id?: string | null
          sort_order?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_statuses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_integrations: {
        Row: {
          calcom_api_key_encrypted: string | null
          calcom_auto_sync_enabled: boolean | null
          calcom_excluded_event_type_ids: Json | null
          calcom_last_auto_sync_at: string | null
          calcom_organization_id: string | null
          calcom_webhook_id: string | null
          calcom_webhook_registered_at: string | null
          calcom_webhook_secret: string | null
          calendly_api_key: string | null
          calendly_api_key_encrypted: string | null
          calendly_webhook_signing_key: string | null
          close_api_key: string | null
          close_api_key_encrypted: string | null
          created_at: string
          encryption_version: number | null
          ghl_api_key: string | null
          ghl_api_key_encrypted: string | null
          ghl_location_id: string | null
          ghl_webhook_secret: string | null
          hubspot_api_key: string | null
          hubspot_api_key_encrypted: string | null
          id: string
          organization_id: string
          primary_booking_platform:
            | Database["public"]["Enums"]["booking_platform_type"]
            | null
          primary_crm: Database["public"]["Enums"]["crm_type"] | null
          primary_payment_processor:
            | Database["public"]["Enums"]["payment_processor_type"]
            | null
          secondary_crm: Database["public"]["Enums"]["crm_type"] | null
          stripe_api_key_encrypted: string | null
          stripe_publishable_key: string | null
          stripe_webhook_signing_key: string | null
          updated_at: string
          whop_api_key: string | null
          whop_api_key_encrypted: string | null
          whop_company_id: string | null
          whop_webhook_signing_key: string | null
        }
        Insert: {
          calcom_api_key_encrypted?: string | null
          calcom_auto_sync_enabled?: boolean | null
          calcom_excluded_event_type_ids?: Json | null
          calcom_last_auto_sync_at?: string | null
          calcom_organization_id?: string | null
          calcom_webhook_id?: string | null
          calcom_webhook_registered_at?: string | null
          calcom_webhook_secret?: string | null
          calendly_api_key?: string | null
          calendly_api_key_encrypted?: string | null
          calendly_webhook_signing_key?: string | null
          close_api_key?: string | null
          close_api_key_encrypted?: string | null
          created_at?: string
          encryption_version?: number | null
          ghl_api_key?: string | null
          ghl_api_key_encrypted?: string | null
          ghl_location_id?: string | null
          ghl_webhook_secret?: string | null
          hubspot_api_key?: string | null
          hubspot_api_key_encrypted?: string | null
          id?: string
          organization_id: string
          primary_booking_platform?:
            | Database["public"]["Enums"]["booking_platform_type"]
            | null
          primary_crm?: Database["public"]["Enums"]["crm_type"] | null
          primary_payment_processor?:
            | Database["public"]["Enums"]["payment_processor_type"]
            | null
          secondary_crm?: Database["public"]["Enums"]["crm_type"] | null
          stripe_api_key_encrypted?: string | null
          stripe_publishable_key?: string | null
          stripe_webhook_signing_key?: string | null
          updated_at?: string
          whop_api_key?: string | null
          whop_api_key_encrypted?: string | null
          whop_company_id?: string | null
          whop_webhook_signing_key?: string | null
        }
        Update: {
          calcom_api_key_encrypted?: string | null
          calcom_auto_sync_enabled?: boolean | null
          calcom_excluded_event_type_ids?: Json | null
          calcom_last_auto_sync_at?: string | null
          calcom_organization_id?: string | null
          calcom_webhook_id?: string | null
          calcom_webhook_registered_at?: string | null
          calcom_webhook_secret?: string | null
          calendly_api_key?: string | null
          calendly_api_key_encrypted?: string | null
          calendly_webhook_signing_key?: string | null
          close_api_key?: string | null
          close_api_key_encrypted?: string | null
          created_at?: string
          encryption_version?: number | null
          ghl_api_key?: string | null
          ghl_api_key_encrypted?: string | null
          ghl_location_id?: string | null
          ghl_webhook_secret?: string | null
          hubspot_api_key?: string | null
          hubspot_api_key_encrypted?: string | null
          id?: string
          organization_id?: string
          primary_booking_platform?:
            | Database["public"]["Enums"]["booking_platform_type"]
            | null
          primary_crm?: Database["public"]["Enums"]["crm_type"] | null
          primary_payment_processor?:
            | Database["public"]["Enums"]["payment_processor_type"]
            | null
          secondary_crm?: Database["public"]["Enums"]["crm_type"] | null
          stripe_api_key_encrypted?: string | null
          stripe_publishable_key?: string | null
          stripe_webhook_signing_key?: string | null
          updated_at?: string
          whop_api_key?: string | null
          whop_api_key_encrypted?: string | null
          whop_company_id?: string | null
          whop_webhook_signing_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      packages: {
        Row: {
          created_at: string
          default_price: number | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_price?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_price?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "packages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          closer_id: string | null
          contract_value: number | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          deal_type: Database["public"]["Enums"]["deal_type"] | null
          event_id: string | null
          id: string
          lead_id: string | null
          net_revenue: number | null
          notes: string | null
          organization_id: string | null
          package_id: string | null
          payment_2_due_date: string | null
          payment_3_due_date: string | null
          payment_date: string
          payment_type: Database["public"]["Enums"]["payment_type"] | null
          pcf_id: string | null
          refund_amount: number | null
          refunded_at: string | null
          setter_id: string | null
          source_id: string | null
          traffic_type_id: string | null
          updated_at: string
          whop_connection_id: string | null
        }
        Insert: {
          amount: number
          closer_id?: string | null
          contract_value?: number | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          deal_type?: Database["public"]["Enums"]["deal_type"] | null
          event_id?: string | null
          id?: string
          lead_id?: string | null
          net_revenue?: number | null
          notes?: string | null
          organization_id?: string | null
          package_id?: string | null
          payment_2_due_date?: string | null
          payment_3_due_date?: string | null
          payment_date?: string
          payment_type?: Database["public"]["Enums"]["payment_type"] | null
          pcf_id?: string | null
          refund_amount?: number | null
          refunded_at?: string | null
          setter_id?: string | null
          source_id?: string | null
          traffic_type_id?: string | null
          updated_at?: string
          whop_connection_id?: string | null
        }
        Update: {
          amount?: number
          closer_id?: string | null
          contract_value?: number | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          deal_type?: Database["public"]["Enums"]["deal_type"] | null
          event_id?: string | null
          id?: string
          lead_id?: string | null
          net_revenue?: number | null
          notes?: string | null
          organization_id?: string | null
          package_id?: string | null
          payment_2_due_date?: string | null
          payment_3_due_date?: string | null
          payment_date?: string
          payment_type?: Database["public"]["Enums"]["payment_type"] | null
          pcf_id?: string | null
          refund_amount?: number | null
          refunded_at?: string | null
          setter_id?: string | null
          source_id?: string | null
          traffic_type_id?: string | null
          updated_at?: string
          whop_connection_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_pcf_id_fkey"
            columns: ["pcf_id"]
            isOneToOne: false
            referencedRelation: "post_call_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_setter_id_fkey"
            columns: ["setter_id"]
            isOneToOne: false
            referencedRelation: "setters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_traffic_type_id_fkey"
            columns: ["traffic_type_id"]
            isOneToOne: false
            referencedRelation: "traffic_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_whop_connection_id_fkey"
            columns: ["whop_connection_id"]
            isOneToOne: false
            referencedRelation: "webhook_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_snapshot_details: {
        Row: {
          amount: number
          closer_id: string | null
          closer_name: string | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          id: string
          net_amount: number
          organization_id: string
          payment_date: string | null
          payment_id: string | null
          refund_amount: number
          setter_id: string | null
          setter_name: string | null
          snapshot_id: string
          source_id: string | null
          source_name: string | null
          traffic_type_id: string | null
          traffic_type_name: string | null
          whop_connection_id: string | null
          whop_connection_name: string | null
        }
        Insert: {
          amount?: number
          closer_id?: string | null
          closer_name?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          net_amount?: number
          organization_id: string
          payment_date?: string | null
          payment_id?: string | null
          refund_amount?: number
          setter_id?: string | null
          setter_name?: string | null
          snapshot_id: string
          source_id?: string | null
          source_name?: string | null
          traffic_type_id?: string | null
          traffic_type_name?: string | null
          whop_connection_id?: string | null
          whop_connection_name?: string | null
        }
        Update: {
          amount?: number
          closer_id?: string | null
          closer_name?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          net_amount?: number
          organization_id?: string
          payment_date?: string | null
          payment_id?: string | null
          refund_amount?: number
          setter_id?: string | null
          setter_name?: string | null
          snapshot_id?: string
          source_id?: string | null
          source_name?: string | null
          traffic_type_id?: string | null
          traffic_type_name?: string | null
          whop_connection_id?: string | null
          whop_connection_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payout_snapshot_details_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_snapshot_details_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_snapshot_details_setter_id_fkey"
            columns: ["setter_id"]
            isOneToOne: false
            referencedRelation: "setters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_snapshot_details_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "payout_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_snapshot_details_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_snapshot_details_traffic_type_id_fkey"
            columns: ["traffic_type_id"]
            isOneToOne: false
            referencedRelation: "traffic_types"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_snapshot_summaries: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_name: string
          id: string
          net_revenue: number
          organization_id: string
          payment_count: number
          snapshot_id: string
          summary_type: string
          total_refunds: number
          total_revenue: number
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_name: string
          id?: string
          net_revenue?: number
          organization_id: string
          payment_count?: number
          snapshot_id: string
          summary_type: string
          total_refunds?: number
          total_revenue?: number
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_name?: string
          id?: string
          net_revenue?: number
          organization_id?: string
          payment_count?: number
          snapshot_id?: string
          summary_type?: string
          total_refunds?: number
          total_revenue?: number
        }
        Relationships: [
          {
            foreignKeyName: "payout_snapshot_summaries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_snapshot_summaries_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "payout_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_snapshots: {
        Row: {
          created_at: string
          finalized_at: string | null
          id: string
          name: string
          net_revenue: number
          notes: string | null
          organization_id: string
          period_end: string
          period_start: string
          status: string
          total_refunds: number
          total_revenue: number
        }
        Insert: {
          created_at?: string
          finalized_at?: string | null
          id?: string
          name: string
          net_revenue?: number
          notes?: string | null
          organization_id: string
          period_end: string
          period_start: string
          status?: string
          total_refunds?: number
          total_revenue?: number
        }
        Update: {
          created_at?: string
          finalized_at?: string | null
          id?: string
          name?: string
          net_revenue?: number
          notes?: string | null
          organization_id?: string
          period_end?: string
          period_start?: string
          status?: string
          total_refunds?: number
          total_revenue?: number
        }
        Relationships: [
          {
            foreignKeyName: "payout_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_settings: {
        Row: {
          created_at: string
          custom_domain: string | null
          id: string
          organization_id: string | null
          show_booked_calls: boolean
          show_cash_collected: boolean
          show_close_rate: boolean
          show_overdue_pcfs: boolean
          show_past_events: boolean
          show_show_rate: boolean
          show_upcoming_events: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_domain?: string | null
          id?: string
          organization_id?: string | null
          show_booked_calls?: boolean
          show_cash_collected?: boolean
          show_close_rate?: boolean
          show_overdue_pcfs?: boolean
          show_past_events?: boolean
          show_show_rate?: boolean
          show_upcoming_events?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_domain?: string | null
          id?: string
          organization_id?: string | null
          show_booked_calls?: boolean
          show_cash_collected?: boolean
          show_close_rate?: boolean
          show_overdue_pcfs?: boolean
          show_past_events?: boolean
          show_show_rate?: boolean
          show_upcoming_events?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      post_call_forms: {
        Row: {
          call_occurred: boolean
          call_outcome_id: string | null
          cash_collected: number | null
          close_date: string | null
          closer_id: string
          closer_name: string
          created_at: string
          deal_closed: boolean
          event_id: string
          id: string
          lead_showed: boolean
          notes: string | null
          offer_made: boolean
          opportunity_status_id: string | null
          organization_id: string | null
          payment_type: Database["public"]["Enums"]["payment_type"] | null
          submitted_at: string
        }
        Insert: {
          call_occurred: boolean
          call_outcome_id?: string | null
          cash_collected?: number | null
          close_date?: string | null
          closer_id: string
          closer_name: string
          created_at?: string
          deal_closed: boolean
          event_id: string
          id?: string
          lead_showed: boolean
          notes?: string | null
          offer_made: boolean
          opportunity_status_id?: string | null
          organization_id?: string | null
          payment_type?: Database["public"]["Enums"]["payment_type"] | null
          submitted_at?: string
        }
        Update: {
          call_occurred?: boolean
          call_outcome_id?: string | null
          cash_collected?: number | null
          close_date?: string | null
          closer_id?: string
          closer_name?: string
          created_at?: string
          deal_closed?: boolean
          event_id?: string
          id?: string
          lead_showed?: boolean
          notes?: string | null
          offer_made?: boolean
          opportunity_status_id?: string | null
          organization_id?: string | null
          payment_type?: Database["public"]["Enums"]["payment_type"] | null
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_call_forms_call_outcome_id_fkey"
            columns: ["call_outcome_id"]
            isOneToOne: false
            referencedRelation: "call_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_call_forms_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_call_forms_opportunity_status_id_fkey"
            columns: ["opportunity_status_id"]
            isOneToOne: false
            referencedRelation: "opportunity_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_call_forms_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          current_organization_id: string | null
          email: string
          id: string
          linked_closer_name: string | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_organization_id?: string | null
          email: string
          id?: string
          linked_closer_name?: string | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_organization_id?: string | null
          email?: string
          id?: string
          linked_closer_name?: string | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_current_organization_id_fkey"
            columns: ["current_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          identifier: string
          request_count: number
          window_start: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          identifier: string
          request_count?: number
          window_start?: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          identifier?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      setter_activities: {
        Row: {
          activity_date: string
          close_user_id: string
          connected_calls: number | null
          created_at: string
          emails_sent: number | null
          id: string
          organization_id: string | null
          setter_id: string | null
          sms_sent: number | null
          total_dials: number | null
          total_talk_time_seconds: number | null
          updated_at: string
          voicemails_left: number | null
        }
        Insert: {
          activity_date: string
          close_user_id: string
          connected_calls?: number | null
          created_at?: string
          emails_sent?: number | null
          id?: string
          organization_id?: string | null
          setter_id?: string | null
          sms_sent?: number | null
          total_dials?: number | null
          total_talk_time_seconds?: number | null
          updated_at?: string
          voicemails_left?: number | null
        }
        Update: {
          activity_date?: string
          close_user_id?: string
          connected_calls?: number | null
          created_at?: string
          emails_sent?: number | null
          id?: string
          organization_id?: string | null
          setter_id?: string | null
          sms_sent?: number | null
          total_dials?: number | null
          total_talk_time_seconds?: number | null
          updated_at?: string
          voicemails_left?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "setter_activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setter_activities_setter_id_fkey"
            columns: ["setter_id"]
            isOneToOne: false
            referencedRelation: "setters"
            referencedColumns: ["id"]
          },
        ]
      }
      setter_aliases: {
        Row: {
          alias_name: string
          canonical_name: string
          created_at: string | null
          id: string
          organization_id: string
        }
        Insert: {
          alias_name: string
          canonical_name: string
          created_at?: string | null
          id?: string
          organization_id: string
        }
        Update: {
          alias_name?: string
          canonical_name?: string
          created_at?: string | null
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "setter_aliases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      setters: {
        Row: {
          close_user_id: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string | null
        }
        Insert: {
          close_user_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id?: string | null
        }
        Update: {
          close_user_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "setters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      traffic_types: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "traffic_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_connections: {
        Row: {
          api_key: string | null
          color: string | null
          connection_type: string
          created_at: string
          dataset_id: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          last_webhook_at: string | null
          name: string
          organization_id: string | null
          rate_limit_per_minute: number | null
          signature_secret_encrypted: string | null
          signature_type: string | null
          tags: string[] | null
          updated_at: string
          webhook_count: number
          webhook_secret: string | null
        }
        Insert: {
          api_key?: string | null
          color?: string | null
          connection_type?: string
          created_at?: string
          dataset_id?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          last_webhook_at?: string | null
          name: string
          organization_id?: string | null
          rate_limit_per_minute?: number | null
          signature_secret_encrypted?: string | null
          signature_type?: string | null
          tags?: string[] | null
          updated_at?: string
          webhook_count?: number
          webhook_secret?: string | null
        }
        Update: {
          api_key?: string | null
          color?: string | null
          connection_type?: string
          created_at?: string
          dataset_id?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          last_webhook_at?: string | null
          name?: string
          organization_id?: string | null
          rate_limit_per_minute?: number | null
          signature_secret_encrypted?: string | null
          signature_type?: string | null
          tags?: string[] | null
          updated_at?: string
          webhook_count?: number
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_connections_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_dashboards: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_shared: boolean | null
          layout_config: Json | null
          name: string
          organization_id: string
          share_token: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_shared?: boolean | null
          layout_config?: Json | null
          name: string
          organization_id: string
          share_token?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_shared?: boolean | null
          layout_config?: Json | null
          name?: string
          organization_id?: string
          share_token?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_dashboards_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          connection_id: string | null
          created_at: string | null
          dataset_record_id: string | null
          error_message: string | null
          extracted_data: Json | null
          headers: Json | null
          id: string
          ip_address: string | null
          organization_id: string | null
          payload_hash: string | null
          processing_time_ms: number | null
          raw_payload: Json | null
          status: string
        }
        Insert: {
          connection_id?: string | null
          created_at?: string | null
          dataset_record_id?: string | null
          error_message?: string | null
          extracted_data?: Json | null
          headers?: Json | null
          id?: string
          ip_address?: string | null
          organization_id?: string | null
          payload_hash?: string | null
          processing_time_ms?: number | null
          raw_payload?: Json | null
          status?: string
        }
        Update: {
          connection_id?: string | null
          created_at?: string | null
          dataset_record_id?: string | null
          error_message?: string | null
          extracted_data?: Json | null
          headers?: Json | null
          id?: string
          ip_address?: string | null
          organization_id?: string | null
          payload_hash?: string | null
          processing_time_ms?: number | null
          raw_payload?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "webhook_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_logs_dataset_record_id_fkey"
            columns: ["dataset_record_id"]
            isOneToOne: false
            referencedRelation: "dataset_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_rate_limit: {
        Args: {
          p_endpoint: string
          p_identifier: string
          p_max_requests?: number
          p_window_minutes?: number
        }
        Returns: {
          allowed: boolean
          current_count: number
          reset_at: string
        }[]
      }
      cleanup_rate_limits: { Args: never; Returns: number }
      get_user_org_ids: { Args: { _user_id: string }; Returns: string[] }
      get_user_organization_ids: {
        Args: { _user_id: string }
        Returns: string[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_sales_rep: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      user_in_organization: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      user_is_org_admin: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      user_is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "sales_rep" | "super_admin"
      booking_platform_type: "calendly" | "acuity" | "none" | "calcom"
      crm_type:
        | "ghl"
        | "close"
        | "hubspot"
        | "salesforce"
        | "pipedrive"
        | "none"
      deal_type: "new_deal" | "upsell" | "renewal"
      event_outcome:
        | "no_show"
        | "showed_no_offer"
        | "showed_offer_no_close"
        | "closed"
        | "not_qualified"
        | "lost"
        | "rescheduled"
        | "canceled"
      payment_processor_type: "whop" | "stripe" | "none"
      payment_type: "paid_in_full" | "split_pay" | "deposit"
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
      app_role: ["admin", "sales_rep", "super_admin"],
      booking_platform_type: ["calendly", "acuity", "none", "calcom"],
      crm_type: ["ghl", "close", "hubspot", "salesforce", "pipedrive", "none"],
      deal_type: ["new_deal", "upsell", "renewal"],
      event_outcome: [
        "no_show",
        "showed_no_offer",
        "showed_offer_no_close",
        "closed",
        "not_qualified",
        "lost",
        "rescheduled",
        "canceled",
      ],
      payment_processor_type: ["whop", "stripe", "none"],
      payment_type: ["paid_in_full", "split_pay", "deposit"],
    },
  },
} as const
