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
      abuse_checklist_progress: {
        Row: {
          abuse_report_id: string
          completed: boolean | null
          completed_at: string | null
          completed_by: string | null
          id: string
          step_label: string
        }
        Insert: {
          abuse_report_id: string
          completed?: boolean | null
          completed_at?: string | null
          completed_by?: string | null
          id?: string
          step_label: string
        }
        Update: {
          abuse_report_id?: string
          completed?: boolean | null
          completed_at?: string | null
          completed_by?: string | null
          id?: string
          step_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "abuse_checklist_progress_abuse_report_id_fkey"
            columns: ["abuse_report_id"]
            isOneToOne: false
            referencedRelation: "abuse_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      abuse_reports: {
        Row: {
          abuse_type: string
          action_taken: string | null
          created_at: string | null
          device_id: string | null
          id: string
          ip_assignment_id: string | null
          provider: string | null
          raw_email_text: string | null
          report_date: string | null
          source_ip: string | null
          status: string | null
          strike_number: number | null
        }
        Insert: {
          abuse_type: string
          action_taken?: string | null
          created_at?: string | null
          device_id?: string | null
          id?: string
          ip_assignment_id?: string | null
          provider?: string | null
          raw_email_text?: string | null
          report_date?: string | null
          source_ip?: string | null
          status?: string | null
          strike_number?: number | null
        }
        Update: {
          abuse_type?: string
          action_taken?: string | null
          created_at?: string | null
          device_id?: string | null
          id?: string
          ip_assignment_id?: string | null
          provider?: string | null
          raw_email_text?: string | null
          report_date?: string | null
          source_ip?: string | null
          status?: string | null
          strike_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "abuse_reports_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abuse_reports_ip_assignment_id_fkey"
            columns: ["ip_assignment_id"]
            isOneToOne: false
            referencedRelation: "ip_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      blacklist_history: {
        Row: {
          confidence: number | null
          created_at: string
          delisted_at: string | null
          device_id: string
          id: string
          ip_address: string
          listed_at: string
          provider: string
          reason: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          delisted_at?: string | null
          device_id: string
          id?: string
          ip_address: string
          listed_at?: string
          provider: string
          reason?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          delisted_at?: string | null
          device_id?: string
          id?: string
          ip_address?: string
          listed_at?: string
          provider?: string
          reason?: string | null
        }
        Relationships: []
      }
      blacklist_scans: {
        Row: {
          confidence_score: number | null
          device_id: string
          expires_at: string | null
          id: string
          ip_address: string
          provider: string
          raw_response: Json | null
          scanned_at: string
        }
        Insert: {
          confidence_score?: number | null
          device_id: string
          expires_at?: string | null
          id?: string
          ip_address: string
          provider: string
          raw_response?: Json | null
          scanned_at?: string
        }
        Update: {
          confidence_score?: number | null
          device_id?: string
          expires_at?: string | null
          id?: string
          ip_address?: string
          provider?: string
          raw_response?: Json | null
          scanned_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blacklist_scans_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      change_log: {
        Row: {
          change_type: string
          changed_by: string | null
          created_at: string | null
          device_id: string | null
          field_name: string | null
          id: string
          new_value: string | null
          old_value: string | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          change_type: string
          changed_by?: string | null
          created_at?: string | null
          device_id?: string | null
          field_name?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          change_type?: string
          changed_by?: string | null
          created_at?: string | null
          device_id?: string | null
          field_name?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_log_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      device_links: {
        Row: {
          created_at: string | null
          device_a_id: string | null
          device_b_id: string | null
          id: string
          interface_a_id: string | null
          interface_b_id: string | null
          link_type: string | null
          notes: string | null
          speed: string | null
        }
        Insert: {
          created_at?: string | null
          device_a_id?: string | null
          device_b_id?: string | null
          id?: string
          interface_a_id?: string | null
          interface_b_id?: string | null
          link_type?: string | null
          notes?: string | null
          speed?: string | null
        }
        Update: {
          created_at?: string | null
          device_a_id?: string | null
          device_b_id?: string | null
          id?: string
          interface_a_id?: string | null
          interface_b_id?: string | null
          link_type?: string | null
          notes?: string | null
          speed?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_links_device_a_id_fkey"
            columns: ["device_a_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_links_device_b_id_fkey"
            columns: ["device_b_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_links_interface_a_id_fkey"
            columns: ["interface_a_id"]
            isOneToOne: false
            referencedRelation: "interfaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_links_interface_b_id_fkey"
            columns: ["interface_b_id"]
            isOneToOne: false
            referencedRelation: "interfaces"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          added_by: string | null
          check_interval_minutes: number | null
          check_ports: number[] | null
          consecutive_failures: number
          created_at: string
          down_since: string | null
          escalation_sent: boolean
          gps_lat: number | null
          gps_lng: number | null
          id: string
          ip_address: string
          ip_label: string | null
          ip_role: string | null
          is_primary: boolean | null
          is_up: boolean | null
          last_latency_ms: number | null
          last_ping_at: string | null
          model: string | null
          monitor_enabled: boolean | null
          name: string
          noc_notes: string | null
          notify_number: string[] | null
          os_version: string | null
          serial_number: string | null
          server_id: string | null
          site_address: string | null
          site_name: string | null
          status: string | null
          type: string | null
          updated_at: string
          vpn_site_id: string | null
        }
        Insert: {
          added_by?: string | null
          check_interval_minutes?: number | null
          check_ports?: number[] | null
          consecutive_failures?: number
          created_at?: string
          down_since?: string | null
          escalation_sent?: boolean
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          ip_address: string
          ip_label?: string | null
          ip_role?: string | null
          is_primary?: boolean | null
          is_up?: boolean | null
          last_latency_ms?: number | null
          last_ping_at?: string | null
          model?: string | null
          monitor_enabled?: boolean | null
          name: string
          noc_notes?: string | null
          notify_number?: string[] | null
          os_version?: string | null
          serial_number?: string | null
          server_id?: string | null
          site_address?: string | null
          site_name?: string | null
          status?: string | null
          type?: string | null
          updated_at?: string
          vpn_site_id?: string | null
        }
        Update: {
          added_by?: string | null
          check_interval_minutes?: number | null
          check_ports?: number[] | null
          consecutive_failures?: number
          created_at?: string
          down_since?: string | null
          escalation_sent?: boolean
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          ip_address?: string
          ip_label?: string | null
          ip_role?: string | null
          is_primary?: boolean | null
          is_up?: boolean | null
          last_latency_ms?: number | null
          last_ping_at?: string | null
          model?: string | null
          monitor_enabled?: boolean | null
          name?: string
          noc_notes?: string | null
          notify_number?: string[] | null
          os_version?: string | null
          serial_number?: string | null
          server_id?: string | null
          site_address?: string | null
          site_name?: string | null
          status?: string | null
          type?: string | null
          updated_at?: string
          vpn_site_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "devices_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devices_vpn_site_id_fkey"
            columns: ["vpn_site_id"]
            isOneToOne: false
            referencedRelation: "vpn_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      interfaces: {
        Row: {
          created_at: string | null
          description: string | null
          device_id: string
          id: string
          is_public: boolean | null
          link_status: string | null
          mac_address: string | null
          monitor_uptime: boolean | null
          name: string
          notes: string | null
          parent_interface_id: string | null
          sort_order: number | null
          speed: string | null
          type: string | null
          vlan_id: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          device_id: string
          id?: string
          is_public?: boolean | null
          link_status?: string | null
          mac_address?: string | null
          monitor_uptime?: boolean | null
          name: string
          notes?: string | null
          parent_interface_id?: string | null
          sort_order?: number | null
          speed?: string | null
          type?: string | null
          vlan_id?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          device_id?: string
          id?: string
          is_public?: boolean | null
          link_status?: string | null
          mac_address?: string | null
          monitor_uptime?: boolean | null
          name?: string
          notes?: string | null
          parent_interface_id?: string | null
          sort_order?: number | null
          speed?: string | null
          type?: string | null
          vlan_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "interfaces_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interfaces_parent_interface_id_fkey"
            columns: ["parent_interface_id"]
            isOneToOne: false
            referencedRelation: "interfaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ip_assignments: {
        Row: {
          blacklist_count: number | null
          created_at: string | null
          device_id: string
          id: string
          interface_id: string
          ip_address: string
          ip_only: string | null
          ip_type: string | null
          is_public: boolean | null
          last_ping_at: string | null
          last_ping_ms: number | null
          last_status: string | null
          monitor_blacklist: boolean | null
          monitor_uptime: boolean | null
          notes: string | null
          prefix_length: number | null
          reachability_type: string | null
          role: string | null
          uptime_7d: number | null
        }
        Insert: {
          blacklist_count?: number | null
          created_at?: string | null
          device_id: string
          id?: string
          interface_id: string
          ip_address: string
          ip_only?: string | null
          ip_type?: string | null
          is_public?: boolean | null
          last_ping_at?: string | null
          last_ping_ms?: number | null
          last_status?: string | null
          monitor_blacklist?: boolean | null
          monitor_uptime?: boolean | null
          notes?: string | null
          prefix_length?: number | null
          reachability_type?: string | null
          role?: string | null
          uptime_7d?: number | null
        }
        Update: {
          blacklist_count?: number | null
          created_at?: string | null
          device_id?: string
          id?: string
          interface_id?: string
          ip_address?: string
          ip_only?: string | null
          ip_type?: string | null
          is_public?: boolean | null
          last_ping_at?: string | null
          last_ping_ms?: number | null
          last_status?: string | null
          monitor_blacklist?: boolean | null
          monitor_uptime?: boolean | null
          notes?: string | null
          prefix_length?: number | null
          reachability_type?: string | null
          role?: string | null
          uptime_7d?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ip_assignments_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ip_assignments_interface_id_fkey"
            columns: ["interface_id"]
            isOneToOne: false
            referencedRelation: "interfaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ip_downtime_events: {
        Row: {
          created_at: string | null
          device_id: string | null
          down_at: string
          duration_minutes: number | null
          escalated: boolean | null
          id: string
          ip_assignment_id: string | null
          notified: boolean | null
          recovered_at: string | null
        }
        Insert: {
          created_at?: string | null
          device_id?: string | null
          down_at: string
          duration_minutes?: number | null
          escalated?: boolean | null
          id?: string
          ip_assignment_id?: string | null
          notified?: boolean | null
          recovered_at?: string | null
        }
        Update: {
          created_at?: string | null
          device_id?: string | null
          down_at?: string
          duration_minutes?: number | null
          escalated?: boolean | null
          id?: string
          ip_assignment_id?: string | null
          notified?: boolean | null
          recovered_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ip_downtime_events_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ip_downtime_events_ip_assignment_id_fkey"
            columns: ["ip_assignment_id"]
            isOneToOne: false
            referencedRelation: "ip_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      ip_groups: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      ip_history: {
        Row: {
          detected_at: string
          device_id: string
          id: string
          ip_address: string
          is_current: boolean
          source: string
        }
        Insert: {
          detected_at?: string
          device_id: string
          id?: string
          ip_address: string
          is_current?: boolean
          source?: string
        }
        Update: {
          detected_at?: string
          device_id?: string
          id?: string
          ip_address?: string
          is_current?: boolean
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "ip_history_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      ip_notes: {
        Row: {
          device_id: string
          id: string
          note_text: string
          updated_at: string
        }
        Insert: {
          device_id: string
          id?: string
          note_text?: string
          updated_at?: string
        }
        Update: {
          device_id?: string
          id?: string
          note_text?: string
          updated_at?: string
        }
        Relationships: []
      }
      ip_reputation_summary: {
        Row: {
          active_listings: number
          device_id: string
          id: string
          ip_address: string
          last_scan_at: string | null
          reputation_score: number
          total_listings: number
          updated_at: string
        }
        Insert: {
          active_listings?: number
          device_id: string
          id?: string
          ip_address: string
          last_scan_at?: string | null
          reputation_score?: number
          total_listings?: number
          updated_at?: string
        }
        Update: {
          active_listings?: number
          device_id?: string
          id?: string
          ip_address?: string
          last_scan_at?: string | null
          reputation_score?: number
          total_listings?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ip_reputation_summary_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: true
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_channels: {
        Row: {
          alert_types: Json
          channel_type: string
          chat_id: string
          created_at: string
          id: string
          is_active: boolean
          mute_end: string | null
          mute_schedule: string
          mute_start: string | null
          name: string
          updated_at: string
        }
        Insert: {
          alert_types?: Json
          channel_type?: string
          chat_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          mute_end?: string | null
          mute_schedule?: string
          mute_start?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          alert_types?: Json
          channel_type?: string
          chat_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          mute_end?: string | null
          mute_schedule?: string
          mute_start?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          error_message: string | null
          event_type: string
          id: string
          ip_address: string
          message: string
          sent_at: string | null
          success: boolean | null
        }
        Insert: {
          error_message?: string | null
          event_type: string
          id?: string
          ip_address: string
          message: string
          sent_at?: string | null
          success?: boolean | null
        }
        Update: {
          error_message?: string | null
          event_type?: string
          id?: string
          ip_address?: string
          message?: string
          sent_at?: string | null
          success?: boolean | null
        }
        Relationships: []
      }
      release_notes: {
        Row: {
          build_number: number
          category: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          is_major: boolean
          release_date: string
          title: string
          updated_at: string
          version: string
        }
        Insert: {
          build_number?: number
          category?: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          is_major?: boolean
          release_date?: string
          title: string
          updated_at?: string
          version: string
        }
        Update: {
          build_number?: number
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          is_major?: boolean
          release_date?: string
          title?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      remediation_tasks: {
        Row: {
          blacklist_history_id: string | null
          completed: boolean
          completed_at: string | null
          completed_by: string | null
          created_at: string
          device_id: string
          id: string
          provider: string
          step_label: string
        }
        Insert: {
          blacklist_history_id?: string | null
          completed?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          device_id: string
          id?: string
          provider: string
          step_label: string
        }
        Update: {
          blacklist_history_id?: string | null
          completed?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          device_id?: string
          id?: string
          provider?: string
          step_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "remediation_tasks_blacklist_history_id_fkey"
            columns: ["blacklist_history_id"]
            isOneToOne: false
            referencedRelation: "blacklist_history"
            referencedColumns: ["id"]
          },
        ]
      }
      reputation_history: {
        Row: {
          active_listings: number
          device_id: string
          id: string
          ip_address: string
          recorded_at: string
          reputation_score: number
        }
        Insert: {
          active_listings?: number
          device_id: string
          id?: string
          ip_address: string
          recorded_at?: string
          reputation_score: number
        }
        Update: {
          active_listings?: number
          device_id?: string
          id?: string
          ip_address?: string
          recorded_at?: string
          reputation_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "reputation_history_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      servers: {
        Row: {
          created_at: string
          description: string | null
          group_id: string | null
          id: string
          location: string | null
          name: string
          server_type: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          group_id?: string | null
          id?: string
          location?: string | null
          name: string
          server_type?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          group_id?: string | null
          id?: string
          location?: string | null
          name?: string
          server_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "servers_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "ip_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_config: {
        Row: {
          client_number: string
          created_at: string | null
          enabled: boolean | null
          id: string
          isp_contact_name: string | null
          isp_contact_number: string | null
          message_template: string | null
          notify_blacklisted: boolean | null
          notify_delisted: boolean | null
          notify_down: boolean | null
          notify_summary: boolean | null
          notify_up: boolean | null
          sms_sender_id: string | null
          sms_user_id: string | null
          techra_api_key: string | null
          updated_at: string | null
          webhook_method: string
          webhook_url: string
        }
        Insert: {
          client_number: string
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          isp_contact_name?: string | null
          isp_contact_number?: string | null
          message_template?: string | null
          notify_blacklisted?: boolean | null
          notify_delisted?: boolean | null
          notify_down?: boolean | null
          notify_summary?: boolean | null
          notify_up?: boolean | null
          sms_sender_id?: string | null
          sms_user_id?: string | null
          techra_api_key?: string | null
          updated_at?: string | null
          webhook_method?: string
          webhook_url: string
        }
        Update: {
          client_number?: string
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          isp_contact_name?: string | null
          isp_contact_number?: string | null
          message_template?: string | null
          notify_blacklisted?: boolean | null
          notify_delisted?: boolean | null
          notify_down?: boolean | null
          notify_summary?: boolean | null
          notify_up?: boolean | null
          sms_sender_id?: string | null
          sms_user_id?: string | null
          techra_api_key?: string | null
          updated_at?: string | null
          webhook_method?: string
          webhook_url?: string
        }
        Relationships: []
      }
      static_routes: {
        Row: {
          comment: string | null
          created_at: string | null
          destination: string
          device_id: string
          distance: number | null
          gateway: string
          id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          destination: string
          device_id: string
          distance?: number | null
          gateway: string
          id?: string
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          destination?: string
          device_id?: string
          distance?: number | null
          gateway?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "static_routes_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      system_config: {
        Row: {
          key: string
          updated_at: string | null
          updated_by: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          alert_threshold_latency_ms: number
          alert_threshold_packet_loss: number
          created_at: string
          default_check_interval: number
          down_confirmation_count: number
          escalation_timer_minutes: number
          id: number
          updated_at: string
        }
        Insert: {
          alert_threshold_latency_ms?: number
          alert_threshold_packet_loss?: number
          created_at?: string
          default_check_interval?: number
          down_confirmation_count?: number
          escalation_timer_minutes?: number
          id: number
          updated_at?: string
        }
        Update: {
          alert_threshold_latency_ms?: number
          alert_threshold_packet_loss?: number
          created_at?: string
          default_check_interval?: number
          down_confirmation_count?: number
          escalation_timer_minutes?: number
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      telegram_config: {
        Row: {
          bot_token: string | null
          chat_id: string
          created_at: string | null
          enabled: boolean | null
          id: string
          notify_blacklisted: boolean | null
          notify_delisted: boolean | null
          notify_down: boolean | null
          notify_summary: boolean | null
          notify_up: boolean | null
          updated_at: string | null
        }
        Insert: {
          bot_token?: string | null
          chat_id: string
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          notify_blacklisted?: boolean | null
          notify_delisted?: boolean | null
          notify_down?: boolean | null
          notify_summary?: boolean | null
          notify_up?: boolean | null
          updated_at?: string | null
        }
        Update: {
          bot_token?: string | null
          chat_id?: string
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          notify_blacklisted?: boolean | null
          notify_delisted?: boolean | null
          notify_down?: boolean | null
          notify_summary?: boolean | null
          notify_up?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vlans: {
        Row: {
          created_at: string | null
          description: string | null
          device_id: string
          dhcp_enabled: boolean | null
          dhcp_end: string | null
          dhcp_start: string | null
          gateway: string | null
          id: string
          interface_id: string | null
          name: string | null
          notes: string | null
          purpose: string | null
          subnet: string | null
          vlan_id: number
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          device_id: string
          dhcp_enabled?: boolean | null
          dhcp_end?: string | null
          dhcp_start?: string | null
          gateway?: string | null
          id?: string
          interface_id?: string | null
          name?: string | null
          notes?: string | null
          purpose?: string | null
          subnet?: string | null
          vlan_id: number
        }
        Update: {
          created_at?: string | null
          description?: string | null
          device_id?: string
          dhcp_enabled?: boolean | null
          dhcp_end?: string | null
          dhcp_start?: string | null
          gateway?: string | null
          id?: string
          interface_id?: string | null
          name?: string | null
          notes?: string | null
          purpose?: string | null
          subnet?: string | null
          vlan_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "vlans_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vlans_interface_id_fkey"
            columns: ["interface_id"]
            isOneToOne: false
            referencedRelation: "interfaces"
            referencedColumns: ["id"]
          },
        ]
      }
      vpn_downtime_events: {
        Row: {
          affected_ip_count: number | null
          created_at: string | null
          down_at: string
          duration_minutes: number | null
          id: string
          notified: boolean | null
          recovered_at: string | null
          vpn_site_id: string | null
        }
        Insert: {
          affected_ip_count?: number | null
          created_at?: string | null
          down_at: string
          duration_minutes?: number | null
          id?: string
          notified?: boolean | null
          recovered_at?: string | null
          vpn_site_id?: string | null
        }
        Update: {
          affected_ip_count?: number | null
          created_at?: string | null
          down_at?: string
          duration_minutes?: number | null
          id?: string
          notified?: boolean | null
          recovered_at?: string | null
          vpn_site_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vpn_downtime_events_vpn_site_id_fkey"
            columns: ["vpn_site_id"]
            isOneToOne: false
            referencedRelation: "vpn_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      vpn_sites: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          last_checked: string | null
          last_status: string | null
          notes: string | null
          site_name: string
          tunnel_interface: string | null
          vpn_gateway_ip: string
          vpn_type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_checked?: string | null
          last_status?: string | null
          notes?: string | null
          site_name: string
          tunnel_interface?: string | null
          vpn_gateway_ip: string
          vpn_type?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_checked?: string | null
          last_status?: string | null
          notes?: string | null
          site_name?: string
          tunnel_interface?: string | null
          vpn_gateway_ip?: string
          vpn_type?: string
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
      app_role: "admin" | "viewer" | "superadmin"
      scan_status: "clean" | "listed" | "error"
      vpn_type: "WireGuard" | "OpenVPN" | "IPSec" | "SSTP" | "L2TP" | "Other"
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
      app_role: ["admin", "viewer", "superadmin"],
      scan_status: ["clean", "listed", "error"],
      vpn_type: ["WireGuard", "OpenVPN", "IPSec", "SSTP", "L2TP", "Other"],
    },
  },
} as const
