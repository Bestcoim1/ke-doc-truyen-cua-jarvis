export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      chapter_read_states: {
        Row: {
          chapter_id: string
          completed_at: string | null
          completed_content_hash: string | null
          completion_method:
            | Database["public"]["Enums"]["completion_method"]
            | null
          first_opened_at: string
          last_anchor_id: string | null
          last_content_hash: string | null
          last_opened_at: string
          last_revision_id: string | null
          max_progress_pct: number
          story_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chapter_id: string
          completed_at?: string | null
          completed_content_hash?: string | null
          completion_method?:
            | Database["public"]["Enums"]["completion_method"]
            | null
          first_opened_at?: string
          last_anchor_id?: string | null
          last_content_hash?: string | null
          last_opened_at?: string
          last_revision_id?: string | null
          max_progress_pct?: number
          story_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chapter_id?: string
          completed_at?: string | null
          completed_content_hash?: string | null
          completion_method?:
            | Database["public"]["Enums"]["completion_method"]
            | null
          first_opened_at?: string
          last_anchor_id?: string | null
          last_content_hash?: string | null
          last_opened_at?: string
          last_revision_id?: string | null
          max_progress_pct?: number
          story_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapter_read_states_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapter_read_states_last_revision_id_fkey"
            columns: ["last_revision_id"]
            isOneToOne: false
            referencedRelation: "chapter_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapter_read_states_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      chapter_revisions: {
        Row: {
          chapter_id: string
          content_blocks: Json
          content_hash: string
          created_at: string
          created_in_version_id: string | null
          id: string
          word_count: number
        }
        Insert: {
          chapter_id: string
          content_blocks: Json
          content_hash: string
          created_at?: string
          created_in_version_id?: string | null
          id?: string
          word_count?: number
        }
        Update: {
          chapter_id?: string
          content_blocks?: Json
          content_hash?: string
          created_at?: string
          created_in_version_id?: string | null
          id?: string
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "chapter_revisions_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapter_revisions_created_in_version_fk"
            columns: ["created_in_version_id"]
            isOneToOne: false
            referencedRelation: "story_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      chapters: {
        Row: {
          archived_in_version_id: string | null
          created_at: string
          current_revision_id: string | null
          id: string
          is_active: boolean
          is_synthetic: boolean
          kind: Database["public"]["Enums"]["chapter_kind"]
          section_id: string | null
          sort_order: number
          source_key: string | null
          story_id: string
          title: string
          updated_at: string
        }
        Insert: {
          archived_in_version_id?: string | null
          created_at?: string
          current_revision_id?: string | null
          id?: string
          is_active?: boolean
          is_synthetic?: boolean
          kind?: Database["public"]["Enums"]["chapter_kind"]
          section_id?: string | null
          sort_order: number
          source_key?: string | null
          story_id: string
          title: string
          updated_at?: string
        }
        Update: {
          archived_in_version_id?: string | null
          created_at?: string
          current_revision_id?: string | null
          id?: string
          is_active?: boolean
          is_synthetic?: boolean
          kind?: Database["public"]["Enums"]["chapter_kind"]
          section_id?: string | null
          sort_order?: number
          source_key?: string | null
          story_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapters_archived_version_story_fk"
            columns: ["archived_in_version_id", "story_id"]
            isOneToOne: false
            referencedRelation: "story_versions"
            referencedColumns: ["id", "story_id"]
          },
          {
            foreignKeyName: "chapters_current_revision_fk"
            columns: ["current_revision_id", "id"]
            isOneToOne: false
            referencedRelation: "chapter_revisions"
            referencedColumns: ["id", "chapter_id"]
          },
          {
            foreignKeyName: "chapters_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapters_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          draft_json: Json | null
          error_message: string | null
          id: string
          mapping_json: Json | null
          owner_id: string
          parser_version: string
          source_filename: string | null
          source_hash: string | null
          source_type: Database["public"]["Enums"]["import_source_type"]
          status: Database["public"]["Enums"]["import_job_status"]
          story_id: string | null
          updated_at: string
          warnings: Json
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          draft_json?: Json | null
          error_message?: string | null
          id?: string
          mapping_json?: Json | null
          owner_id: string
          parser_version: string
          source_filename?: string | null
          source_hash?: string | null
          source_type: Database["public"]["Enums"]["import_source_type"]
          status?: Database["public"]["Enums"]["import_job_status"]
          story_id?: string | null
          updated_at?: string
          warnings?: Json
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          draft_json?: Json | null
          error_message?: string | null
          id?: string
          mapping_json?: Json | null
          owner_id?: string
          parser_version?: string
          source_filename?: string | null
          source_hash?: string | null
          source_type?: Database["public"]["Enums"]["import_source_type"]
          status?: Database["public"]["Enums"]["import_job_status"]
          story_id?: string | null
          updated_at?: string
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_story_owner_fk"
            columns: ["story_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      reading_progress: {
        Row: {
          chapter_id: string
          chapter_progress_pct: number
          chapter_revision_id: string
          last_write_id: string | null
          observed_at: string
          paragraph_anchor_id: string
          paragraph_fingerprint: string
          paragraph_offset_ratio: number | null
          paragraph_ordinal: number
          story_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chapter_id: string
          chapter_progress_pct?: number
          chapter_revision_id: string
          last_write_id?: string | null
          observed_at?: string
          paragraph_anchor_id: string
          paragraph_fingerprint: string
          paragraph_offset_ratio?: number | null
          paragraph_ordinal?: number
          story_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chapter_id?: string
          chapter_progress_pct?: number
          chapter_revision_id?: string
          last_write_id?: string | null
          observed_at?: string
          paragraph_anchor_id?: string
          paragraph_fingerprint?: string
          paragraph_offset_ratio?: number | null
          paragraph_ordinal?: number
          story_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reading_progress_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_progress_chapter_revision_id_fkey"
            columns: ["chapter_revision_id"]
            isOneToOne: false
            referencedRelation: "chapter_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_progress_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      reading_settings: {
        Row: {
          font_size_step: number
          line_height: number
          theme: Database["public"]["Enums"]["reading_theme"]
          updated_at: string
          user_id: string
        }
        Insert: {
          font_size_step?: number
          line_height?: number
          theme?: Database["public"]["Enums"]["reading_theme"]
          updated_at?: string
          user_id: string
        }
        Update: {
          font_size_step?: number
          line_height?: number
          theme?: Database["public"]["Enums"]["reading_theme"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sections: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          parent_section_id: string | null
          sort_order: number
          source_key: string | null
          story_id: string
          title: string
          type: Database["public"]["Enums"]["section_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          parent_section_id?: string | null
          sort_order: number
          source_key?: string | null
          story_id: string
          title: string
          type: Database["public"]["Enums"]["section_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          parent_section_id?: string | null
          sort_order?: number
          source_key?: string | null
          story_id?: string
          title?: string
          type?: Database["public"]["Enums"]["section_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sections_parent_section_id_fkey"
            columns: ["parent_section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      stories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          last_read_at: string | null
          owner_id: string
          status: Database["public"]["Enums"]["story_status"]
          title: string
          updated_at: string
          visibility: Database["public"]["Enums"]["story_visibility"]
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          last_read_at?: string | null
          owner_id: string
          status?: Database["public"]["Enums"]["story_status"]
          title: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["story_visibility"]
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          last_read_at?: string | null
          owner_id?: string
          status?: Database["public"]["Enums"]["story_status"]
          title?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["story_visibility"]
        }
        Relationships: []
      }
      story_versions: {
        Row: {
          committed_at: string
          id: string
          import_job_id: string
          parser_version: string
          source_hash: string | null
          story_id: string
          version_number: number
        }
        Insert: {
          committed_at?: string
          id?: string
          import_job_id: string
          parser_version: string
          source_hash?: string | null
          story_id: string
          version_number: number
        }
        Update: {
          committed_at?: string
          id?: string
          import_job_id?: string
          parser_version?: string
          source_hash?: string | null
          story_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "story_versions_import_job_story_fk"
            columns: ["import_job_id", "story_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id", "story_id"]
          },
          {
            foreignKeyName: "story_versions_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      commit_import_job: {
        Args: { p_job_id: string }
        Returns: {
          story_id: string
          version_id: string
        }[]
      }
      commit_reimport_job: {
        Args: { p_job_id: string }
        Returns: {
          chapter_id_pairs: Json
          story_id: string
          version_id: string
        }[]
      }
      upsert_chapter_progress: {
        Args: {
          p_anchor_id: string
          p_chapter_id: string
          // generator emits function scalar args as always non-null; this one
          // (completion_method, no "not null" in 0002_slice1_reader.sql) is
          // genuinely nullable — callers pass null when markCompleted is
          // false. Patched by hand after each `types:generate` run.
          p_completion_method: Database["public"]["Enums"]["completion_method"] | null
          p_content_hash: string
          p_mark_completed: boolean
          p_progress_pct: number
          p_revision_id: string
          p_story_id: string
        }
        Returns: undefined
      }
      upsert_reading_progress: {
        Args: {
          p_chapter_id: string
          p_chapter_progress_pct: number
          p_chapter_revision_id: string
          p_observed_at: string
          p_paragraph_anchor_id: string
          p_paragraph_fingerprint: string
          // see upsert_chapter_progress.p_completion_method comment above —
          // same generator limitation, genuinely nullable in
          // 0002_slice1_reader.sql.
          p_paragraph_offset_ratio: number | null
          p_paragraph_ordinal: number
          p_story_id: string
          p_write_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      chapter_kind: "regular" | "extra"
      completion_method: "reader_end" | "next_action" | "revision_migration"
      import_job_status:
        | "uploaded"
        | "parsing"
        | "needs_review"
        | "committing"
        | "completed"
        | "failed"
        | "cancelled"
      import_source_type: "paste" | "txt" | "docx"
      reading_theme: "light" | "dark" | "sepia"
      section_type: "volume" | "arc" | "part"
      story_status: "active" | "archived" | "deleting"
      story_visibility: "private"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      chapter_kind: ["regular", "extra"],
      completion_method: ["reader_end", "next_action", "revision_migration"],
      import_job_status: [
        "uploaded",
        "parsing",
        "needs_review",
        "committing",
        "completed",
        "failed",
        "cancelled",
      ],
      import_source_type: ["paste", "txt", "docx"],
      reading_theme: ["light", "dark", "sepia"],
      section_type: ["volume", "arc", "part"],
      story_status: ["active", "archived", "deleting"],
      story_visibility: ["private"],
    },
  },
} as const

