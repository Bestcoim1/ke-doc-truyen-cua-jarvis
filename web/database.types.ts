// Hand-authored to match web/supabase/migrations/0001..0005. Once a local
// Supabase instance is reachable (`supabase start`), regenerate the real
// thing with `npm run types:generate` and replace this file — that command
// is the source of truth going forward, this is a stopgap so the Supabase
// clients are type-checked in the meantime.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      stories: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          description: string | null;
          visibility: Database["public"]["Enums"]["story_visibility"];
          status: Database["public"]["Enums"]["story_status"];
          last_read_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          description?: string | null;
          visibility?: Database["public"]["Enums"]["story_visibility"];
          status?: Database["public"]["Enums"]["story_status"];
          last_read_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          title?: string;
          description?: string | null;
          visibility?: Database["public"]["Enums"]["story_visibility"];
          status?: Database["public"]["Enums"]["story_status"];
          last_read_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      sections: {
        Row: {
          id: string;
          story_id: string;
          parent_section_id: string | null;
          type: Database["public"]["Enums"]["section_type"];
          title: string;
          source_key: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          story_id: string;
          parent_section_id?: string | null;
          type: Database["public"]["Enums"]["section_type"];
          title: string;
          source_key?: string | null;
          sort_order: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          story_id?: string;
          parent_section_id?: string | null;
          type?: Database["public"]["Enums"]["section_type"];
          title?: string;
          source_key?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      chapters: {
        Row: {
          id: string;
          story_id: string;
          section_id: string | null;
          kind: Database["public"]["Enums"]["chapter_kind"];
          title: string;
          is_synthetic: boolean;
          source_key: string | null;
          archived_in_version_id: string | null;
          sort_order: number;
          current_revision_id: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          story_id: string;
          section_id?: string | null;
          kind?: Database["public"]["Enums"]["chapter_kind"];
          title: string;
          is_synthetic?: boolean;
          source_key?: string | null;
          archived_in_version_id?: string | null;
          sort_order: number;
          current_revision_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          story_id?: string;
          section_id?: string | null;
          kind?: Database["public"]["Enums"]["chapter_kind"];
          title?: string;
          is_synthetic?: boolean;
          source_key?: string | null;
          archived_in_version_id?: string | null;
          sort_order?: number;
          current_revision_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      chapter_revisions: {
        Row: {
          id: string;
          chapter_id: string;
          created_in_version_id: string | null;
          content_blocks: Json;
          content_hash: string;
          word_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          chapter_id: string;
          created_in_version_id?: string | null;
          content_blocks: Json;
          content_hash: string;
          word_count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          chapter_id?: string;
          created_in_version_id?: string | null;
          content_blocks?: Json;
          content_hash?: string;
          word_count?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      reading_progress: {
        Row: {
          user_id: string;
          story_id: string;
          chapter_id: string;
          chapter_revision_id: string;
          paragraph_anchor_id: string;
          paragraph_fingerprint: string;
          paragraph_ordinal: number;
          paragraph_offset_ratio: number | null;
          chapter_progress_pct: number;
          last_write_id: string | null;
          observed_at: string;
          updated_at: string;
        };
        Insert: {
          user_id?: string;
          story_id: string;
          chapter_id: string;
          chapter_revision_id: string;
          paragraph_anchor_id: string;
          paragraph_fingerprint: string;
          paragraph_ordinal?: number;
          paragraph_offset_ratio?: number | null;
          chapter_progress_pct?: number;
          last_write_id?: string | null;
          observed_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          story_id?: string;
          chapter_id?: string;
          chapter_revision_id?: string;
          paragraph_anchor_id?: string;
          paragraph_fingerprint?: string;
          paragraph_ordinal?: number;
          paragraph_offset_ratio?: number | null;
          chapter_progress_pct?: number;
          last_write_id?: string | null;
          observed_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      chapter_read_states: {
        Row: {
          user_id: string;
          story_id: string;
          chapter_id: string;
          last_revision_id: string | null;
          last_content_hash: string | null;
          last_anchor_id: string | null;
          max_progress_pct: number;
          first_opened_at: string;
          last_opened_at: string;
          completed_content_hash: string | null;
          completed_at: string | null;
          completion_method: Database["public"]["Enums"]["completion_method"] | null;
          updated_at: string;
        };
        Insert: {
          user_id?: string;
          story_id: string;
          chapter_id: string;
          last_revision_id?: string | null;
          last_content_hash?: string | null;
          last_anchor_id?: string | null;
          max_progress_pct?: number;
          first_opened_at?: string;
          last_opened_at?: string;
          completed_content_hash?: string | null;
          completed_at?: string | null;
          completion_method?: Database["public"]["Enums"]["completion_method"] | null;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          story_id?: string;
          chapter_id?: string;
          last_revision_id?: string | null;
          last_content_hash?: string | null;
          last_anchor_id?: string | null;
          max_progress_pct?: number;
          first_opened_at?: string;
          last_opened_at?: string;
          completed_content_hash?: string | null;
          completed_at?: string | null;
          completion_method?: Database["public"]["Enums"]["completion_method"] | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      reading_settings: {
        Row: {
          user_id: string;
          font_size_step: number;
          line_height: number;
          theme: Database["public"]["Enums"]["reading_theme"];
          updated_at: string;
        };
        Insert: {
          user_id: string;
          font_size_step?: number;
          line_height?: number;
          theme?: Database["public"]["Enums"]["reading_theme"];
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          font_size_step?: number;
          line_height?: number;
          theme?: Database["public"]["Enums"]["reading_theme"];
          updated_at?: string;
        };
        Relationships: [];
      };
      import_jobs: {
        Row: {
          id: string;
          owner_id: string;
          story_id: string | null;
          source_type: Database["public"]["Enums"]["import_source_type"];
          source_filename: string | null;
          source_hash: string | null;
          parser_version: string;
          status: Database["public"]["Enums"]["import_job_status"];
          draft_json: Json | null;
          warnings: Json;
          error_message: string | null;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          owner_id: string;
          story_id?: string | null;
          source_type: Database["public"]["Enums"]["import_source_type"];
          source_filename?: string | null;
          source_hash?: string | null;
          parser_version: string;
          status?: Database["public"]["Enums"]["import_job_status"];
          draft_json?: Json | null;
          warnings?: Json;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          owner_id?: string;
          story_id?: string | null;
          source_type?: Database["public"]["Enums"]["import_source_type"];
          source_filename?: string | null;
          source_hash?: string | null;
          parser_version?: string;
          status?: Database["public"]["Enums"]["import_job_status"];
          draft_json?: Json | null;
          warnings?: Json;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      story_versions: {
        Row: {
          id: string;
          story_id: string;
          import_job_id: string;
          version_number: number;
          source_hash: string | null;
          parser_version: string;
          committed_at: string;
        };
        Insert: {
          id?: string;
          story_id: string;
          import_job_id: string;
          version_number: number;
          source_hash?: string | null;
          parser_version: string;
          committed_at?: string;
        };
        Update: {
          id?: string;
          story_id?: string;
          import_job_id?: string;
          version_number?: number;
          source_hash?: string | null;
          parser_version?: string;
          committed_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      upsert_reading_progress: {
        Args: {
          p_story_id: string;
          p_chapter_id: string;
          p_chapter_revision_id: string;
          p_paragraph_anchor_id: string;
          p_paragraph_fingerprint: string;
          p_paragraph_ordinal: number;
          p_paragraph_offset_ratio: number | null;
          p_chapter_progress_pct: number;
          p_write_id: string;
          p_observed_at: string;
        };
        Returns: undefined;
      };
      upsert_chapter_progress: {
        Args: {
          p_story_id: string;
          p_chapter_id: string;
          p_revision_id: string;
          p_content_hash: string;
          p_anchor_id: string;
          p_progress_pct: number;
          p_mark_completed: boolean;
          p_completion_method: Database["public"]["Enums"]["completion_method"] | null;
        };
        Returns: undefined;
      };
      commit_import_job: {
        Args: {
          p_job_id: string;
        };
        Returns: { story_id: string; version_id: string }[];
      };
    };
    Enums: {
      story_visibility: "private";
      story_status: "active" | "archived" | "deleting";
      section_type: "volume" | "arc" | "part";
      chapter_kind: "regular" | "extra";
      reading_theme: "light" | "dark" | "sepia";
      completion_method: "reader_end" | "next_action" | "revision_migration";
      import_job_status:
        | "uploaded"
        | "parsing"
        | "needs_review"
        | "committing"
        | "completed"
        | "failed"
        | "cancelled";
      import_source_type: "paste" | "txt" | "docx";
    };
    CompositeTypes: Record<string, never>;
  };
};
