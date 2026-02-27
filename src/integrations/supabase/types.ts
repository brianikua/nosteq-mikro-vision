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
      abuse_attributions: {
        Row: {
          abuse_category: Database["public"]["Enums"]["abuse_category"]
          attributed_at: string
          device_id: string
          evidence: Json | null
          id: string
          pppoe_username: string | null
          private_ip: string | null
          scan_id: string
          severity_score: number
        }
        Insert: {
          abuse_category: Database["public"]["Enums"]["abuse_category"]
          attributed_at?: string
          device_id: string
          evidence?: Json | null
          id?: string
          pppoe_username?: string | null
          private_ip?: string | null
          scan_id: string
          severity_score?: number
        }
        Update: {
          abuse_category?: Database["public"]["Enums"]["abuse_category"]
          attributed_at?: string
          device_id?: string
          evidence?: Json | null
          id?: string
          pppoe_username?: string | null
          private_ip?: string | null
          scan_id?: string
          severity_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "abuse_attributions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abuse_attributions_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "blacklist_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      blacklist_scans: {
        Row: {
          abuse_category: Database["public"]["Enums"]["abuse_category"] | null
          confidence_score: number | null
          device_id: string
          expires_at: string | null
          id: string
          ip_address: string
          provider: string
          raw_response: Json | null
          scanned_at: string
          status: Database["public"]["Enums"]["scan_status"]
        }
        Insert: {
          abuse_category?: Database["public"]["Enums"]["abuse_category"] | null
          confidence_score?: number | null
          device_id: string
          expires_at?: string | null
          id?: string
          ip_address: string
          provider: string
          raw_response?: Json | null
          scanned_at?: string
          status?: Database["public"]["Enums"]["scan_status"]
        }
        Update: {
          abuse_category?: Database["public"]["Enums"]["abuse_category"] | null
          confidence_score?: number | null
          device_id?: string
          expires_at?: string | null
          id?: string
          ip_address?: string
          provider?: string
          raw_response?: Json | null
          scanned_at?: string
          status?: Database["public"]["Enums"]["scan_status"]
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
      connection_tracking: {
        Row: {
          collected_at: string
          device_id: string
          icmp_connections: number | null
          id: string
          tcp_connections: number | null
          top_destinations: Json | null
          top_sources: Json | null
          total_connections: number
          udp_connections: number | null
        }
        Insert: {
          collected_at?: string
          device_id: string
          icmp_connections?: number | null
          id?: string
          tcp_connections?: number | null
          top_destinations?: Json | null
          top_sources?: Json | null
          total_connections?: number
          udp_connections?: number | null
        }
        Update: {
          collected_at?: string
          device_id?: string
          icmp_connections?: number | null
          id?: string
          tcp_connections?: number | null
          top_destinations?: Json | null
          top_sources?: Json | null
          total_connections?: number
          udp_connections?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "connection_tracking_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      device_interfaces: {
        Row: {
          device_id: string
          id: string
          name: string
          recorded_at: string
          rx_rate: number | null
          status: string
          tx_rate: number | null
        }
        Insert: {
          device_id: string
          id?: string
          name: string
          recorded_at?: string
          rx_rate?: number | null
          status: string
          tx_rate?: number | null
        }
        Update: {
          device_id?: string
          id?: string
          name?: string
          recorded_at?: string
          rx_rate?: number | null
          status?: string
          tx_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "device_interfaces_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      device_metrics: {
        Row: {
          cpu_load: number | null
          device_id: string
          id: string
          memory_usage: number | null
          recorded_at: string
          status: Database["public"]["Enums"]["device_status"]
          total_traffic: number | null
          uptime: string | null
        }
        Insert: {
          cpu_load?: number | null
          device_id: string
          id?: string
          memory_usage?: number | null
          recorded_at?: string
          status: Database["public"]["Enums"]["device_status"]
          total_traffic?: number | null
          uptime?: string | null
        }
        Update: {
          cpu_load?: number | null
          device_id?: string
          id?: string
          memory_usage?: number | null
          recorded_at?: string
          status?: Database["public"]["Enums"]["device_status"]
          total_traffic?: number | null
          uptime?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_metrics_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          created_at: string
          id: string
          ip_address: string
          model: string | null
          name: string
          password: string
          port: number
          routeros_version: string | null
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address: string
          model?: string | null
          name: string
          password: string
          port?: number
          routeros_version?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string
          model?: string | null
          name?: string
          password?: string
          port?: number
          routeros_version?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      firewall_logs: {
        Row: {
          action: string | null
          chain: string | null
          collected_at: string
          device_id: string
          dst_address: string | null
          dst_port: string | null
          id: string
          in_interface: string | null
          log_message: string | null
          out_interface: string | null
          protocol: string | null
          src_address: string | null
          timestamp: string
        }
        Insert: {
          action?: string | null
          chain?: string | null
          collected_at?: string
          device_id: string
          dst_address?: string | null
          dst_port?: string | null
          id?: string
          in_interface?: string | null
          log_message?: string | null
          out_interface?: string | null
          protocol?: string | null
          src_address?: string | null
          timestamp?: string
        }
        Update: {
          action?: string | null
          chain?: string | null
          collected_at?: string
          device_id?: string
          dst_address?: string | null
          dst_port?: string | null
          id?: string
          in_interface?: string | null
          log_message?: string | null
          out_interface?: string | null
          protocol?: string | null
          src_address?: string | null
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "firewall_logs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      firewall_rules: {
        Row: {
          action: string
          bytes: number | null
          chain: string
          collected_at: string
          comment: string | null
          device_id: string
          disabled: boolean
          dst_address: string | null
          dst_port: string | null
          id: string
          in_interface: string | null
          mikrotik_id: string | null
          out_interface: string | null
          packets: number | null
          protocol: string | null
          rule_order: number | null
          src_address: string | null
          src_port: string | null
        }
        Insert: {
          action: string
          bytes?: number | null
          chain: string
          collected_at?: string
          comment?: string | null
          device_id: string
          disabled?: boolean
          dst_address?: string | null
          dst_port?: string | null
          id?: string
          in_interface?: string | null
          mikrotik_id?: string | null
          out_interface?: string | null
          packets?: number | null
          protocol?: string | null
          rule_order?: number | null
          src_address?: string | null
          src_port?: string | null
        }
        Update: {
          action?: string
          bytes?: number | null
          chain?: string
          collected_at?: string
          comment?: string | null
          device_id?: string
          disabled?: boolean
          dst_address?: string | null
          dst_port?: string | null
          id?: string
          in_interface?: string | null
          mikrotik_id?: string | null
          out_interface?: string | null
          packets?: number | null
          protocol?: string | null
          rule_order?: number | null
          src_address?: string | null
          src_port?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "firewall_rules_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
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
      mitigation_actions: {
        Row: {
          action_type: Database["public"]["Enums"]["mitigation_type"]
          approved_by: string | null
          attribution_id: string | null
          created_at: string
          description: string
          device_id: string
          executed_at: string | null
          id: string
          is_approved: boolean
        }
        Insert: {
          action_type: Database["public"]["Enums"]["mitigation_type"]
          approved_by?: string | null
          attribution_id?: string | null
          created_at?: string
          description: string
          device_id: string
          executed_at?: string | null
          id?: string
          is_approved?: boolean
        }
        Update: {
          action_type?: Database["public"]["Enums"]["mitigation_type"]
          approved_by?: string | null
          attribution_id?: string | null
          created_at?: string
          description?: string
          device_id?: string
          executed_at?: string | null
          id?: string
          is_approved?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "mitigation_actions_attribution_id_fkey"
            columns: ["attribution_id"]
            isOneToOne: false
            referencedRelation: "abuse_attributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mitigation_actions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      nat_rules: {
        Row: {
          action: string
          bytes: number | null
          chain: string
          collected_at: string
          comment: string | null
          device_id: string
          disabled: boolean
          dst_address: string | null
          dst_port: string | null
          id: string
          in_interface: string | null
          mikrotik_id: string | null
          out_interface: string | null
          packets: number | null
          protocol: string | null
          rule_order: number | null
          src_address: string | null
          src_port: string | null
          to_addresses: string | null
          to_ports: string | null
        }
        Insert: {
          action: string
          bytes?: number | null
          chain: string
          collected_at?: string
          comment?: string | null
          device_id: string
          disabled?: boolean
          dst_address?: string | null
          dst_port?: string | null
          id?: string
          in_interface?: string | null
          mikrotik_id?: string | null
          out_interface?: string | null
          packets?: number | null
          protocol?: string | null
          rule_order?: number | null
          src_address?: string | null
          src_port?: string | null
          to_addresses?: string | null
          to_ports?: string | null
        }
        Update: {
          action?: string
          bytes?: number | null
          chain?: string
          collected_at?: string
          comment?: string | null
          device_id?: string
          disabled?: boolean
          dst_address?: string | null
          dst_port?: string | null
          id?: string
          in_interface?: string | null
          mikrotik_id?: string | null
          out_interface?: string | null
          packets?: number | null
          protocol?: string | null
          rule_order?: number | null
          src_address?: string | null
          src_port?: string | null
          to_addresses?: string | null
          to_ports?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nat_rules_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
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
      abuse_category:
        | "spam"
        | "ddos"
        | "port_scanning"
        | "botnet"
        | "malware"
        | "open_relay"
        | "brute_force"
        | "dns_amplification"
        | "smtp_abuse"
        | "other"
      app_role: "admin" | "viewer" | "superadmin"
      device_status: "online" | "offline" | "warning"
      mitigation_type:
        | "firewall_rule"
        | "rate_limit"
        | "port_block"
        | "customer_suspension"
        | "manual_review"
      scan_status: "clean" | "listed" | "error"
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
      abuse_category: [
        "spam",
        "ddos",
        "port_scanning",
        "botnet",
        "malware",
        "open_relay",
        "brute_force",
        "dns_amplification",
        "smtp_abuse",
        "other",
      ],
      app_role: ["admin", "viewer", "superadmin"],
      device_status: ["online", "offline", "warning"],
      mitigation_type: [
        "firewall_rule",
        "rate_limit",
        "port_block",
        "customer_suspension",
        "manual_review",
      ],
      scan_status: ["clean", "listed", "error"],
    },
  },
} as const
