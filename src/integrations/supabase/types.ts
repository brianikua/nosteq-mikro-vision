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
      devices: {
        Row: {
          check_interval_minutes: number | null
          check_ports: number[] | null
          created_at: string
          id: string
          ip_address: string
          is_up: boolean | null
          last_latency_ms: number | null
          last_ping_at: string | null
          name: string
          updated_at: string
        }
        Insert: {
          check_interval_minutes?: number | null
          check_ports?: number[] | null
          created_at?: string
          id?: string
          ip_address: string
          is_up?: boolean | null
          last_latency_ms?: number | null
          last_ping_at?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          check_interval_minutes?: number | null
          check_ports?: number[] | null
          created_at?: string
          id?: string
          ip_address?: string
          is_up?: boolean | null
          last_latency_ms?: number | null
          last_ping_at?: string | null
          name?: string
          updated_at?: string
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
      telegram_config: {
        Row: {
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
    },
  },
} as const
