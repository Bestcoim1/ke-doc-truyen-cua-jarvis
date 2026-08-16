export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Preserved from the hosted generator output. The local CLI fallback does
  // not currently emit its PostgREST version metadata.
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
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
      chapter_annotations: {
        Row: {
          anchor_id: string
          chapter_id: string
          color: string | null
          created_at: string
          end_offset: number
          id: string
          note: string | null
          start_offset: number
          story_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          anchor_id: string
          chapter_id: string
          color?: string | null
          created_at?: string
          end_offset: number
          id?: string
          note?: string | null
          start_offset: number
          story_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          anchor_id?: string
          chapter_id?: string
          color?: string | null
          created_at?: string
          end_offset?: number
          id?: string
          note?: string | null
          start_offset?: number
          story_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapter_annotations_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapter_annotations_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
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
      continuity_analysis_runs: {
        Row: {
          alert_count: number
          candidate_count: number
          chapters_analyzed: number
          completed_at: string | null
          created_at: string
          detector_version: string
          error_message: string | null
          id: string
          import_job_id: string | null
          owner_id: string
          started_at: string
          status: Database["public"]["Enums"]["continuity_analysis_run_status"]
          story_id: string
          updated_at: string
          version_id: string
        }
        Insert: {
          alert_count?: number
          candidate_count?: number
          chapters_analyzed?: number
          completed_at?: string | null
          created_at?: string
          detector_version: string
          error_message?: string | null
          id?: string
          import_job_id?: string | null
          owner_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["continuity_analysis_run_status"]
          story_id: string
          updated_at?: string
          version_id: string
        }
        Update: {
          alert_count?: number
          candidate_count?: number
          chapters_analyzed?: number
          completed_at?: string | null
          created_at?: string
          detector_version?: string
          error_message?: string | null
          id?: string
          import_job_id?: string | null
          owner_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["continuity_analysis_run_status"]
          story_id?: string
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "continuity_analysis_runs_job_story_fk"
            columns: ["import_job_id", "story_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id", "story_id"]
          },
          {
            foreignKeyName: "continuity_analysis_runs_story_owner_fk"
            columns: ["story_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "continuity_analysis_runs_version_story_fk"
            columns: ["version_id", "story_id"]
            isOneToOne: false
            referencedRelation: "story_versions"
            referencedColumns: ["id", "story_id"]
          },
        ]
      }
      continuity_character_knowledge: {
        Row: {
          acquired_chapter_id: string | null
          certainty: Database["public"]["Enums"]["continuity_fact_status"]
          chapter_sequence: number | null
          character_entity_id: string
          created_at: string
          fact_id: string | null
          id: string
          is_secret: boolean
          knowledge_state: Database["public"]["Enums"]["continuity_knowledge_state"]
          knowledge_text: string
          owner_id: string
          source_inbox_item_id: string
          story_id: string
          updated_at: string
        }
        Insert: {
          acquired_chapter_id?: string | null
          certainty: Database["public"]["Enums"]["continuity_fact_status"]
          chapter_sequence?: number | null
          character_entity_id: string
          created_at?: string
          fact_id?: string | null
          id?: string
          is_secret?: boolean
          knowledge_state: Database["public"]["Enums"]["continuity_knowledge_state"]
          knowledge_text: string
          owner_id: string
          source_inbox_item_id: string
          story_id: string
          updated_at?: string
        }
        Update: {
          acquired_chapter_id?: string | null
          certainty?: Database["public"]["Enums"]["continuity_fact_status"]
          chapter_sequence?: number | null
          character_entity_id?: string
          created_at?: string
          fact_id?: string | null
          id?: string
          is_secret?: boolean
          knowledge_state?: Database["public"]["Enums"]["continuity_knowledge_state"]
          knowledge_text?: string
          owner_id?: string
          source_inbox_item_id?: string
          story_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "continuity_character_knowledge_chapter_fk"
            columns: ["acquired_chapter_id", "story_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id", "story_id"]
          },
          {
            foreignKeyName: "continuity_character_knowledge_character_fk"
            columns: ["character_entity_id", "story_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "continuity_entities"
            referencedColumns: ["id", "story_id", "owner_id"]
          },
          {
            foreignKeyName: "continuity_character_knowledge_fact_fk"
            columns: ["fact_id", "story_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "continuity_facts"
            referencedColumns: ["id", "story_id", "owner_id"]
          },
          {
            foreignKeyName: "continuity_character_knowledge_source_item_fk"
            columns: ["source_inbox_item_id", "story_id", "owner_id"]
            isOneToOne: true
            referencedRelation: "continuity_inbox_items"
            referencedColumns: ["id", "story_id", "owner_id"]
          },
          {
            foreignKeyName: "continuity_character_knowledge_story_owner_fk"
            columns: ["story_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      continuity_entities: {
        Row: {
          aliases: string[]
          archived_at: string | null
          created_at: string
          description: string | null
          id: string
          kind: Database["public"]["Enums"]["continuity_entity_kind"]
          name: string
          owner_id: string
          story_id: string
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          archived_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind: Database["public"]["Enums"]["continuity_entity_kind"]
          name: string
          owner_id: string
          story_id: string
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          archived_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["continuity_entity_kind"]
          name?: string
          owner_id?: string
          story_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "continuity_entities_story_owner_fk"
            columns: ["story_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      continuity_inbox_evidence: {
        Row: {
          chapter_id: string | null
          chapter_revision_id: string | null
          created_at: string
          end_line: number | null
          excerpt: string | null
          id: string
          inbox_item_id: string
          owner_id: string
          source_anchor_id: string | null
          source_label: string
          start_line: number | null
          story_id: string
        }
        Insert: {
          chapter_id?: string | null
          chapter_revision_id?: string | null
          created_at?: string
          end_line?: number | null
          excerpt?: string | null
          id?: string
          inbox_item_id: string
          owner_id: string
          source_anchor_id?: string | null
          source_label: string
          start_line?: number | null
          story_id: string
        }
        Update: {
          chapter_id?: string | null
          chapter_revision_id?: string | null
          created_at?: string
          end_line?: number | null
          excerpt?: string | null
          id?: string
          inbox_item_id?: string
          owner_id?: string
          source_anchor_id?: string | null
          source_label?: string
          start_line?: number | null
          story_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "continuity_inbox_evidence_chapter_same_story_fk"
            columns: ["chapter_id", "story_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id", "story_id"]
          },
          {
            foreignKeyName: "continuity_inbox_evidence_item_same_story_fk"
            columns: ["inbox_item_id", "story_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "continuity_inbox_items"
            referencedColumns: ["id", "story_id", "owner_id"]
          },
          {
            foreignKeyName: "continuity_inbox_evidence_revision_chapter_fk"
            columns: ["chapter_revision_id", "chapter_id"]
            isOneToOne: false
            referencedRelation: "chapter_revisions"
            referencedColumns: ["id", "chapter_id"]
          },
          {
            foreignKeyName: "continuity_inbox_evidence_story_owner_fk"
            columns: ["story_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      continuity_inbox_items: {
        Row: {
          alert_kind: Database["public"]["Enums"]["continuity_alert_kind"] | null
          created_at: string
          fingerprint: string
          id: string
          kind: Database["public"]["Enums"]["continuity_inbox_kind"]
          metadata: Json
          owner_id: string
          related_entity_id: string | null
          review_status: Database["public"]["Enums"]["continuity_review_status"]
          reviewed_at: string | null
          run_id: string
          severity: Database["public"]["Enums"]["continuity_severity"] | null
          statement: string
          story_id: string
          subject_entity_id: string | null
          updated_at: string
        }
        Insert: {
          alert_kind?: Database["public"]["Enums"]["continuity_alert_kind"] | null
          created_at?: string
          fingerprint: string
          id?: string
          kind: Database["public"]["Enums"]["continuity_inbox_kind"]
          metadata?: Json
          owner_id: string
          related_entity_id?: string | null
          review_status?: Database["public"]["Enums"]["continuity_review_status"]
          reviewed_at?: string | null
          run_id: string
          severity?: Database["public"]["Enums"]["continuity_severity"] | null
          statement: string
          story_id: string
          subject_entity_id?: string | null
          updated_at?: string
        }
        Update: {
          alert_kind?: Database["public"]["Enums"]["continuity_alert_kind"] | null
          created_at?: string
          fingerprint?: string
          id?: string
          kind?: Database["public"]["Enums"]["continuity_inbox_kind"]
          metadata?: Json
          owner_id?: string
          related_entity_id?: string | null
          review_status?: Database["public"]["Enums"]["continuity_review_status"]
          reviewed_at?: string | null
          run_id?: string
          severity?: Database["public"]["Enums"]["continuity_severity"] | null
          statement?: string
          story_id?: string
          subject_entity_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "continuity_inbox_items_related_same_story_fk"
            columns: ["related_entity_id", "story_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "continuity_entities"
            referencedColumns: ["id", "story_id", "owner_id"]
          },
          {
            foreignKeyName: "continuity_inbox_items_run_same_story_fk"
            columns: ["run_id", "story_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "continuity_analysis_runs"
            referencedColumns: ["id", "story_id", "owner_id"]
          },
          {
            foreignKeyName: "continuity_inbox_items_story_owner_fk"
            columns: ["story_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "continuity_inbox_items_subject_same_story_fk"
            columns: ["subject_entity_id", "story_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "continuity_entities"
            referencedColumns: ["id", "story_id", "owner_id"]
          },
        ]
      }
      continuity_evidence: {
        Row: {
          chapter_id: string | null
          chapter_revision_id: string | null
          created_at: string
          end_line: number | null
          excerpt: string | null
          fact_id: string | null
          id: string
          owner_id: string
          plot_thread_id: string | null
          source_kind: Database["public"]["Enums"]["continuity_evidence_kind"]
          source_anchor_id: string | null
          source_label: string | null
          start_line: number | null
          story_id: string
          updated_at: string
        }
        Insert: {
          chapter_id?: string | null
          chapter_revision_id?: string | null
          created_at?: string
          end_line?: number | null
          excerpt?: string | null
          fact_id?: string | null
          id?: string
          owner_id: string
          plot_thread_id?: string | null
          source_kind: Database["public"]["Enums"]["continuity_evidence_kind"]
          source_anchor_id?: string | null
          source_label?: string | null
          start_line?: number | null
          story_id: string
          updated_at?: string
        }
        Update: {
          chapter_id?: string | null
          chapter_revision_id?: string | null
          created_at?: string
          end_line?: number | null
          excerpt?: string | null
          fact_id?: string | null
          id?: string
          owner_id?: string
          plot_thread_id?: string | null
          source_kind?: Database["public"]["Enums"]["continuity_evidence_kind"]
          source_anchor_id?: string | null
          source_label?: string | null
          start_line?: number | null
          story_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "continuity_evidence_chapter_same_story_fk"
            columns: ["chapter_id", "story_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id", "story_id"]
          },
          {
            foreignKeyName: "continuity_evidence_fact_same_story_fk"
            columns: ["fact_id", "story_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "continuity_facts"
            referencedColumns: ["id", "story_id", "owner_id"]
          },
          {
            foreignKeyName: "continuity_evidence_revision_chapter_fk"
            columns: ["chapter_revision_id", "chapter_id"]
            isOneToOne: false
            referencedRelation: "chapter_revisions"
            referencedColumns: ["id", "chapter_id"]
          },
          {
            foreignKeyName: "continuity_evidence_story_owner_fk"
            columns: ["story_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "continuity_evidence_thread_same_story_fk"
            columns: ["plot_thread_id", "story_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "continuity_plot_threads"
            referencedColumns: ["id", "story_id", "owner_id"]
          },
        ]
      }
      continuity_facts: {
        Row: {
          created_at: string
          entity_id: string | null
          id: string
          owner_id: string
          source_inbox_item_id: string | null
          statement: string
          status: Database["public"]["Enums"]["continuity_fact_status"]
          story_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          id?: string
          owner_id: string
          source_inbox_item_id?: string | null
          statement: string
          status?: Database["public"]["Enums"]["continuity_fact_status"]
          story_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          id?: string
          owner_id?: string
          source_inbox_item_id?: string | null
          statement?: string
          status?: Database["public"]["Enums"]["continuity_fact_status"]
          story_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "continuity_facts_entity_same_story_fk"
            columns: ["entity_id", "story_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "continuity_entities"
            referencedColumns: ["id", "story_id", "owner_id"]
          },
          {
            foreignKeyName: "continuity_facts_story_owner_fk"
            columns: ["story_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "continuity_facts_source_inbox_item_fk"
            columns: ["source_inbox_item_id", "story_id", "owner_id"]
            isOneToOne: true
            referencedRelation: "continuity_inbox_items"
            referencedColumns: ["id", "story_id", "owner_id"]
          },
        ]
      }
      continuity_plot_threads: {
        Row: {
          created_at: string
          due_chapter_id: string | null
          expected_payoff: string | null
          id: string
          last_touched_chapter_id: string | null
          notes: string | null
          owner_id: string
          promise: string | null
          setup: string | null
          status: Database["public"]["Enums"]["continuity_thread_status"]
          story_id: string
          thread_type: Database["public"]["Enums"]["continuity_thread_type"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          due_chapter_id?: string | null
          expected_payoff?: string | null
          id?: string
          last_touched_chapter_id?: string | null
          notes?: string | null
          owner_id: string
          promise?: string | null
          setup?: string | null
          status?: Database["public"]["Enums"]["continuity_thread_status"]
          story_id: string
          thread_type: Database["public"]["Enums"]["continuity_thread_type"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          due_chapter_id?: string | null
          expected_payoff?: string | null
          id?: string
          last_touched_chapter_id?: string | null
          notes?: string | null
          owner_id?: string
          promise?: string | null
          setup?: string | null
          status?: Database["public"]["Enums"]["continuity_thread_status"]
          story_id?: string
          thread_type?: Database["public"]["Enums"]["continuity_thread_type"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "continuity_plot_threads_due_chapter_fk"
            columns: ["due_chapter_id", "story_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id", "story_id"]
          },
          {
            foreignKeyName: "continuity_plot_threads_last_chapter_fk"
            columns: ["last_touched_chapter_id", "story_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id", "story_id"]
          },
          {
            foreignKeyName: "continuity_plot_threads_story_owner_fk"
            columns: ["story_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      continuity_timeline_events: {
        Row: {
          certainty: Database["public"]["Enums"]["continuity_fact_status"]
          chapter_sequence: number | null
          created_at: string
          id: string
          location_entity_id: string | null
          owner_id: string
          participant_entity_id: string | null
          source_inbox_item_id: string
          story_id: string
          time_end: string | null
          time_start: string | null
          title: string
          updated_at: string
        }
        Insert: {
          certainty: Database["public"]["Enums"]["continuity_fact_status"]
          chapter_sequence?: number | null
          created_at?: string
          id?: string
          location_entity_id?: string | null
          owner_id: string
          participant_entity_id?: string | null
          source_inbox_item_id: string
          story_id: string
          time_end?: string | null
          time_start?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          certainty?: Database["public"]["Enums"]["continuity_fact_status"]
          chapter_sequence?: number | null
          created_at?: string
          id?: string
          location_entity_id?: string | null
          owner_id?: string
          participant_entity_id?: string | null
          source_inbox_item_id?: string
          story_id?: string
          time_end?: string | null
          time_start?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "continuity_timeline_events_location_fk"
            columns: ["location_entity_id", "story_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "continuity_entities"
            referencedColumns: ["id", "story_id", "owner_id"]
          },
          {
            foreignKeyName: "continuity_timeline_events_participant_fk"
            columns: ["participant_entity_id", "story_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "continuity_entities"
            referencedColumns: ["id", "story_id", "owner_id"]
          },
          {
            foreignKeyName: "continuity_timeline_events_source_item_fk"
            columns: ["source_inbox_item_id", "story_id", "owner_id"]
            isOneToOne: true
            referencedRelation: "continuity_inbox_items"
            referencedColumns: ["id", "story_id", "owner_id"]
          },
          {
            foreignKeyName: "continuity_timeline_events_story_owner_fk"
            columns: ["story_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id", "owner_id"]
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
          cover_image_url: string | null
          created_at: string
          description: string | null
          id: string
          last_read_at: string | null
          owner_id: string
          status: Database["public"]["Enums"]["story_status"]
          title: string
          updated_at: string
          visibility: Database["public"]["Enums"]["story_visibility"]
          writing_status: Database["public"]["Enums"]["story_writing_status"]
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          last_read_at?: string | null
          owner_id: string
          status?: Database["public"]["Enums"]["story_status"]
          title: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["story_visibility"]
          writing_status?: Database["public"]["Enums"]["story_writing_status"]
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          last_read_at?: string | null
          owner_id?: string
          status?: Database["public"]["Enums"]["story_status"]
          title?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["story_visibility"]
          writing_status?: Database["public"]["Enums"]["story_writing_status"]
        }
        Relationships: []
      }
      story_relationships: {
        Row: {
          created_at: string
          id: string
          relationship_type: Database["public"]["Enums"]["story_relationship_type"]
          source_story_id: string
          target_story_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          relationship_type: Database["public"]["Enums"]["story_relationship_type"]
          source_story_id: string
          target_story_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          relationship_type?: Database["public"]["Enums"]["story_relationship_type"]
          source_story_id?: string
          target_story_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_relationships_source_story_id_fkey"
            columns: ["source_story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_relationships_target_story_id_fkey"
            columns: ["target_story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
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
      commit_reimport_job_v2: {
        Args: { p_job_id: string }
        Returns: {
          chapter_id_pairs: Json
          story_id: string
          version_id: string
        }[]
      }
      commit_reimport_job_v3: {
        Args: { p_job_id: string }
        Returns: {
          chapter_id_pairs: Json
          story_id: string
          version_id: string
        }[]
      }
      delete_story_section_preserving_contents: {
        Args: { p_section_id: string; p_story_id: string }
        Returns: Json
      }
      normalize_reimport_story_order: {
        Args: { p_story_id: string; p_version_id: string }
        Returns: undefined
      }
      reorder_story_chapters: {
        Args: { p_sections: Json; p_story_id: string }
        Returns: number
      }
      review_continuity_inbox_item: {
        Args: {
          p_decision: Database["public"]["Enums"]["continuity_review_status"]
          p_item_id: string
          p_knowledge_state?: Database["public"]["Enums"]["continuity_knowledge_state"] | null
          p_record_status?: Database["public"]["Enums"]["continuity_fact_status"] | null
        }
        Returns: {
          fact_id: string | null
          knowledge_id: string | null
          out_review_status: Database["public"]["Enums"]["continuity_review_status"]
          timeline_event_id: string | null
        }[]
      }
      upsert_chapter_progress: {
        Args: {
          p_anchor_id: string
          p_chapter_id: string
          p_completion_method: Database["public"]["Enums"]["completion_method"]
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
          p_paragraph_offset_ratio: number
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
      continuity_alert_kind:
        | "state_conflict"
        | "impossible_travel"
        | "premature_knowledge"
        | "duplicate_item"
        | "forgotten_thread"
      continuity_analysis_run_status: "running" | "completed" | "failed"
      continuity_entity_kind:
        | "character"
        | "location"
        | "item"
        | "organization"
        | "world_rule"
      continuity_evidence_kind:
        | "direct_source"
        | "author_document"
        | "summary_derived"
        | "inference"
        | "suggestion"
      continuity_fact_status:
        | "canon"
        | "candidate"
        | "inference"
        | "disputed"
        | "retconned"
        | "inactive"
      continuity_inbox_kind:
        | "state_change"
        | "location_change"
        | "knowledge_claim"
        | "possession_change"
        | "timeline_event"
        | "alert"
      continuity_knowledge_state:
        | "knows"
        | "does_not_know"
        | "believes_false"
        | "doubts"
      continuity_review_status:
        | "pending"
        | "accepted"
        | "dismissed"
        | "intentional"
        | "retcon"
      continuity_severity: "minor" | "moderate" | "major" | "canon_breaking"
      continuity_thread_status:
        | "open"
        | "progressing"
        | "apparently_dropped"
        | "resolved"
        | "intentionally_unresolved"
        | "unknown"
      continuity_thread_type:
        | "foreshadowing"
        | "mystery"
        | "promise"
        | "setup_payoff"
        | "other"
      import_job_status:
        | "uploaded"
        | "parsing"
        | "needs_review"
        | "committing"
        | "completed"
        | "failed"
        | "cancelled"
      import_source_type: "paste" | "txt" | "docx" | "batch"
      reading_theme: "light" | "dark" | "sepia"
      section_type: "volume" | "arc" | "part"
      story_relationship_type:
        | "sequel"
        | "spinoff"
        | "side_story"
        | "adaptation"
        | "related"
      story_status: "active" | "archived" | "deleting"
      story_visibility: "private"
      story_writing_status:
        | "idea"
        | "outlining"
        | "drafting"
        | "revising"
        | "completed"
        | "paused"
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
      continuity_alert_kind: [
        "state_conflict",
        "impossible_travel",
        "premature_knowledge",
        "duplicate_item",
        "forgotten_thread",
      ],
      continuity_analysis_run_status: ["running", "completed", "failed"],
      continuity_entity_kind: [
        "character",
        "location",
        "item",
        "organization",
        "world_rule",
      ],
      continuity_evidence_kind: [
        "direct_source",
        "author_document",
        "summary_derived",
        "inference",
        "suggestion",
      ],
      continuity_fact_status: [
        "canon",
        "candidate",
        "inference",
        "disputed",
        "retconned",
        "inactive",
      ],
      continuity_inbox_kind: [
        "state_change",
        "location_change",
        "knowledge_claim",
        "possession_change",
        "timeline_event",
        "alert",
      ],
      continuity_knowledge_state: [
        "knows",
        "does_not_know",
        "believes_false",
        "doubts",
      ],
      continuity_review_status: [
        "pending",
        "accepted",
        "dismissed",
        "intentional",
        "retcon",
      ],
      continuity_severity: ["minor", "moderate", "major", "canon_breaking"],
      continuity_thread_status: [
        "open",
        "progressing",
        "apparently_dropped",
        "resolved",
        "intentionally_unresolved",
        "unknown",
      ],
      continuity_thread_type: [
        "foreshadowing",
        "mystery",
        "promise",
        "setup_payoff",
        "other",
      ],
      import_job_status: [
        "uploaded",
        "parsing",
        "needs_review",
        "committing",
        "completed",
        "failed",
        "cancelled",
      ],
      import_source_type: ["paste", "txt", "docx", "batch"],
      reading_theme: ["light", "dark", "sepia"],
      section_type: ["volume", "arc", "part"],
      story_relationship_type: [
        "sequel",
        "spinoff",
        "side_story",
        "adaptation",
        "related",
      ],
      story_status: ["active", "archived", "deleting"],
      story_visibility: ["private"],
      story_writing_status: [
        "idea",
        "outlining",
        "drafting",
        "revising",
        "completed",
        "paused",
      ],
    },
  },
} as const
