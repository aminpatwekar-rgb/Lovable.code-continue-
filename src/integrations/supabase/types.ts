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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      annotations: {
        Row: {
          author_id: string
          created_at: string
          data: Json
          id: string
          submission_file_id: string | null
          submission_id: string
        }
        Insert: {
          author_id: string
          created_at?: string
          data?: Json
          id?: string
          submission_file_id?: string | null
          submission_id: string
        }
        Update: {
          author_id?: string
          created_at?: string
          data?: Json
          id?: string
          submission_file_id?: string | null
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "annotations_author_profile_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "annotations_submission_file_id_fkey"
            columns: ["submission_file_id"]
            isOneToOne: false
            referencedRelation: "submission_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "annotations_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          audience: string
          author_id: string
          body: string | null
          class_id: string | null
          created_at: string
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          audience?: string
          author_id: string
          body?: string | null
          class_id?: string | null
          created_at?: string
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          audience?: string
          author_id?: string
          body?: string | null
          class_id?: string | null
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_profile_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_attachments: {
        Row: {
          assignment_id: string
          created_at: string
          file_name: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          file_name: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_attachments_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          allow_autocorrect: boolean
          allow_images: boolean
          allow_links: boolean
          allow_voice_typing: boolean
          archived: boolean
          class_id: string
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          instructions: string | null
          is_group: boolean
          max_marks: number
          priority: string
          published: boolean
          reference_links: Json
          rubric: Json | null
          subject: string | null
          submission_type: Database["public"]["Enums"]["submission_type"]
          teacher_id: string
          title: string
          updated_at: string
        }
        Insert: {
          allow_autocorrect?: boolean
          allow_images?: boolean
          allow_links?: boolean
          allow_voice_typing?: boolean
          archived?: boolean
          class_id: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          instructions?: string | null
          is_group?: boolean
          max_marks?: number
          priority?: string
          published?: boolean
          reference_links?: Json
          rubric?: Json | null
          subject?: string | null
          submission_type?: Database["public"]["Enums"]["submission_type"]
          teacher_id: string
          title: string
          updated_at?: string
        }
        Update: {
          allow_autocorrect?: boolean
          allow_images?: boolean
          allow_links?: boolean
          allow_voice_typing?: boolean
          archived?: boolean
          class_id?: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          instructions?: string | null
          is_group?: boolean
          max_marks?: number
          priority?: string
          published?: boolean
          reference_links?: Json
          rubric?: Json | null
          subject?: string | null
          submission_type?: Database["public"]["Enums"]["submission_type"]
          teacher_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      badges: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          icon: string
          id: string
          is_custom: boolean
          name: string
          points: number
          tone: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string
          id?: string
          is_custom?: boolean
          name: string
          points?: number
          tone?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string
          id?: string
          is_custom?: boolean
          name?: string
          points?: number
          tone?: string
        }
        Relationships: [
          {
            foreignKeyName: "badges_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      class_discussions: {
        Row: {
          author_id: string
          body: string
          class_id: string
          created_at: string
          id: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          class_id: string
          created_at?: string
          id?: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          class_id?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_discussions_author_profile_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_discussions_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_discussions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "class_discussions"
            referencedColumns: ["id"]
          },
        ]
      }
      class_members: {
        Row: {
          class_id: string
          er_no: string | null
          full_name: string | null
          id: string
          joined_at: string
          member_role: string
          roll_no: string | null
          sr_no: string | null
          student_id: string
        }
        Insert: {
          class_id: string
          er_no?: string | null
          full_name?: string | null
          id?: string
          joined_at?: string
          member_role?: string
          roll_no?: string | null
          sr_no?: string | null
          student_id: string
        }
        Update: {
          class_id?: string
          er_no?: string | null
          full_name?: string | null
          id?: string
          joined_at?: string
          member_role?: string
          roll_no?: string | null
          sr_no?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_members_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_members_student_profile_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          archived: boolean
          banner_url: string | null
          created_at: string
          description: string | null
          id: string
          join_code: string
          name: string
          section: string | null
          subject: string | null
          teacher_id: string
          updated_at: string
        }
        Insert: {
          archived?: boolean
          banner_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          join_code: string
          name: string
          section?: string | null
          subject?: string | null
          teacher_id: string
          updated_at?: string
        }
        Update: {
          archived?: boolean
          banner_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          join_code?: string
          name?: string
          section?: string | null
          subject?: string | null
          teacher_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          submission_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          submission_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_profile_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      paste_violations: {
        Row: {
          id: string
          kind: string
          occurred_at: string
          student_id: string
          submission_id: string
        }
        Insert: {
          id?: string
          kind: string
          occurred_at?: string
          student_id: string
          submission_id: string
        }
        Update: {
          id?: string
          kind?: string
          occurred_at?: string
          student_id?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paste_violations_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_bootstrap: {
        Row: {
          admin_initialized: boolean
          created_at: string
          id: boolean
          initialized_at: string | null
          initialized_by: string | null
          updated_at: string
        }
        Insert: {
          admin_initialized?: boolean
          created_at?: string
          id?: boolean
          initialized_at?: string | null
          initialized_by?: string | null
          updated_at?: string
        }
        Update: {
          admin_initialized?: boolean
          created_at?: string
          id?: boolean
          initialized_at?: string | null
          initialized_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          institution: string | null
          is_active: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          institution?: string | null
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          institution?: string | null
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      question_bank: {
        Row: {
          archived: boolean
          class_id: string | null
          correct: Json
          created_at: string
          difficulty: Database["public"]["Enums"]["quiz_difficulty"]
          explanation: string | null
          id: string
          options: Json
          owner_id: string
          points: number
          prompt: string
          subject: string | null
          topic: string | null
          type: Database["public"]["Enums"]["quiz_question_type"]
          updated_at: string
        }
        Insert: {
          archived?: boolean
          class_id?: string | null
          correct?: Json
          created_at?: string
          difficulty?: Database["public"]["Enums"]["quiz_difficulty"]
          explanation?: string | null
          id?: string
          options?: Json
          owner_id: string
          points?: number
          prompt: string
          subject?: string | null
          topic?: string | null
          type?: Database["public"]["Enums"]["quiz_question_type"]
          updated_at?: string
        }
        Update: {
          archived?: boolean
          class_id?: string | null
          correct?: Json
          created_at?: string
          difficulty?: Database["public"]["Enums"]["quiz_difficulty"]
          explanation?: string | null
          id?: string
          options?: Json
          owner_id?: string
          points?: number
          prompt?: string
          subject?: string | null
          topic?: string | null
          type?: Database["public"]["Enums"]["quiz_question_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_bank_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_answers: {
        Row: {
          attempt_id: string
          awarded_points: number | null
          created_at: string
          feedback: string | null
          id: string
          is_correct: boolean | null
          question_id: string
          response: Json
          updated_at: string
        }
        Insert: {
          attempt_id: string
          awarded_points?: number | null
          created_at?: string
          feedback?: string | null
          id?: string
          is_correct?: boolean | null
          question_id: string
          response?: Json
          updated_at?: string
        }
        Update: {
          attempt_id?: string
          awarded_points?: number | null
          created_at?: string
          feedback?: string | null
          id?: string
          is_correct?: boolean | null
          question_id?: string
          response?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "quiz_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "quiz_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_attempts: {
        Row: {
          attempt_no: number
          created_at: string
          graded_at: string | null
          id: string
          lock_reason: string | null
          locked_at: string | null
          max_score: number | null
          needs_manual_grading: boolean
          question_order: Json
          quiz_id: string
          score: number | null
          started_at: string
          status: Database["public"]["Enums"]["quiz_attempt_status"]
          student_id: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          attempt_no?: number
          created_at?: string
          graded_at?: string | null
          id?: string
          lock_reason?: string | null
          locked_at?: string | null
          max_score?: number | null
          needs_manual_grading?: boolean
          question_order?: Json
          quiz_id: string
          score?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["quiz_attempt_status"]
          student_id: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          attempt_no?: number
          created_at?: string
          graded_at?: string | null
          id?: string
          lock_reason?: string | null
          locked_at?: string | null
          max_score?: number | null
          needs_manual_grading?: boolean
          question_order?: Json
          quiz_id?: string
          score?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["quiz_attempt_status"]
          student_id?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          correct: Json
          created_at: string
          difficulty: Database["public"]["Enums"]["quiz_difficulty"]
          explanation: string | null
          id: string
          options: Json
          points: number
          position: number
          prompt: string
          quiz_id: string
          type: Database["public"]["Enums"]["quiz_question_type"]
          updated_at: string
        }
        Insert: {
          correct?: Json
          created_at?: string
          difficulty?: Database["public"]["Enums"]["quiz_difficulty"]
          explanation?: string | null
          id?: string
          options?: Json
          points?: number
          position?: number
          prompt: string
          quiz_id: string
          type?: Database["public"]["Enums"]["quiz_question_type"]
          updated_at?: string
        }
        Update: {
          correct?: Json
          created_at?: string
          difficulty?: Database["public"]["Enums"]["quiz_difficulty"]
          explanation?: string | null
          id?: string
          options?: Json
          points?: number
          position?: number
          prompt?: string
          quiz_id?: string
          type?: Database["public"]["Enums"]["quiz_question_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_violations: {
        Row: {
          attempt_id: string
          away_ms: number
          id: string
          kind: string
          locked: boolean
          occurred_at: string
          quiz_id: string
          student_id: string
        }
        Insert: {
          attempt_id: string
          away_ms?: number
          id?: string
          kind: string
          locked?: boolean
          occurred_at?: string
          quiz_id: string
          student_id: string
        }
        Update: {
          attempt_id?: string
          away_ms?: number
          id?: string
          kind?: string
          locked?: boolean
          occurred_at?: string
          quiz_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_violations_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "quiz_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_violations_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_violations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          archived: boolean
          assignment_id: string | null
          auto_submit: boolean
          class_id: string
          created_at: string
          description: string | null
          end_at: string | null
          id: string
          kind: Database["public"]["Enums"]["quiz_kind"]
          lockdown_enabled: boolean
          max_attempts: number
          passing_marks: number
          published: boolean
          randomize_choices: boolean
          randomize_questions: boolean
          show_results: boolean
          start_at: string | null
          subject: string | null
          teacher_id: string
          time_limit_minutes: number | null
          title: string
          updated_at: string
        }
        Insert: {
          archived?: boolean
          assignment_id?: string | null
          auto_submit?: boolean
          class_id: string
          created_at?: string
          description?: string | null
          end_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["quiz_kind"]
          lockdown_enabled?: boolean
          max_attempts?: number
          passing_marks?: number
          published?: boolean
          randomize_choices?: boolean
          randomize_questions?: boolean
          show_results?: boolean
          start_at?: string | null
          subject?: string | null
          teacher_id: string
          time_limit_minutes?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          archived?: boolean
          assignment_id?: string | null
          auto_submit?: boolean
          class_id?: string
          created_at?: string
          description?: string | null
          end_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["quiz_kind"]
          lockdown_enabled?: boolean
          max_attempts?: number
          passing_marks?: number
          published?: boolean
          randomize_choices?: boolean
          randomize_questions?: boolean
          show_results?: boolean
          start_at?: string | null
          subject?: string | null
          teacher_id?: string
          time_limit_minutes?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quizzes_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quizzes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      student_badges: {
        Row: {
          awarded_at: string
          awarded_by: string | null
          badge_id: string
          class_id: string | null
          id: string
          reason: string | null
          student_id: string
        }
        Insert: {
          awarded_at?: string
          awarded_by?: string | null
          badge_id: string
          class_id?: string | null
          id?: string
          reason?: string | null
          student_id: string
        }
        Update: {
          awarded_at?: string
          awarded_by?: string | null
          badge_id?: string
          class_id?: string | null
          id?: string
          reason?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_badges_awarded_by_fkey"
            columns: ["awarded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_badges_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_badges_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_points: {
        Row: {
          class_id: string | null
          created_at: string
          id: string
          note: string | null
          points: number
          reference_id: string | null
          source: string
          student_id: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          points?: number
          reference_id?: string | null
          source: string
          student_id: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          points?: number
          reference_id?: string | null
          source?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_points_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_points_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_files: {
        Row: {
          caption: string | null
          created_at: string
          file_name: string
          id: string
          kind: string
          mime_type: string | null
          page_order: number
          size_bytes: number | null
          storage_path: string
          submission_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          file_name: string
          id?: string
          kind?: string
          mime_type?: string | null
          page_order?: number
          size_bytes?: number | null
          storage_path: string
          submission_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          file_name?: string
          id?: string
          kind?: string
          mime_type?: string | null
          page_order?: number
          size_bytes?: number | null
          storage_path?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_files_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          assignment_id: string
          created_at: string
          grade_released: boolean
          id: string
          improvement_notes: string | null
          is_late: boolean
          marks_awarded: number | null
          mode: string
          paste_violation_count: number
          reviewed_at: string | null
          status: Database["public"]["Enums"]["submission_status"]
          student_id: string
          submitted_at: string | null
          teacher_feedback: string | null
          typed_blocks: Json
          typed_content: string | null
          updated_at: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          grade_released?: boolean
          id?: string
          improvement_notes?: string | null
          is_late?: boolean
          marks_awarded?: number | null
          mode?: string
          paste_violation_count?: number
          reviewed_at?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          student_id: string
          submitted_at?: string | null
          teacher_feedback?: string | null
          typed_blocks?: Json
          typed_content?: string | null
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          grade_released?: boolean
          id?: string
          improvement_notes?: string | null
          is_late?: boolean
          marks_awarded?: number | null
          mode?: string
          paste_violation_count?: number
          reviewed_at?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          student_id?: string
          submitted_at?: string | null
          teacher_feedback?: string | null
          typed_blocks?: Json
          typed_content?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_student_profile_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          role: Database["public"]["Enums"]["app_role"]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_set_user_active: {
        Args: { _active: boolean; _user_id: string }
        Returns: undefined
      }
      admin_set_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      admin_transfer_class: {
        Args: { _class_id: string; _new_teacher: string }
        Returns: undefined
      }
      bootstrap_first_admin: { Args: never; Returns: boolean }
      can_view_assignment: {
        Args: { _assignment_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_quiz: {
        Args: { _quiz_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_submission: {
        Args: { _submission_id: string; _user_id: string }
        Returns: boolean
      }
      get_class_roster: {
        Args: { _class_id: string }
        Returns: {
          er_no: string
          full_name: string
          id: string
          joined_at: string
          member_role: string
          roll_no: string
          sr_no: string
          student_id: string
        }[]
      }
      get_profile_emails: {
        Args: { _ids: string[] }
        Returns: {
          email: string
          id: string
        }[]
      }
      get_quiz_explanations: {
        Args: { _attempt_id: string }
        Returns: {
          correct: Json
          explanation: string
          question_id: string
        }[]
      }
      get_quiz_questions_for_student: {
        Args: { _quiz_id: string }
        Returns: {
          difficulty: Database["public"]["Enums"]["quiz_difficulty"]
          id: string
          options: Json
          points: number
          prompt: string
          q_position: number
          type: Database["public"]["Enums"]["quiz_question_type"]
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_assignment_owner: {
        Args: { _assignment_id: string; _user_id: string }
        Returns: boolean
      }
      is_class_member: {
        Args: { _class_id: string; _user_id: string }
        Returns: boolean
      }
      is_class_teacher: {
        Args: { _class_id: string; _user_id: string }
        Returns: boolean
      }
      join_class_by_code: {
        Args: {
          _code: string
          _er_no: string
          _full_name: string
          _roll_no: string
          _sr_no: string
        }
        Returns: string
      }
      leave_class: { Args: { _class_id: string }; Returns: undefined }
      owns_attempt: {
        Args: { _attempt_id: string; _user_id: string }
        Returns: boolean
      }
      owns_quiz: {
        Args: { _quiz_id: string; _user_id: string }
        Returns: boolean
      }
      owns_submission: {
        Args: { _submission_id: string; _user_id: string }
        Returns: boolean
      }
      owns_submission_for_assignment: {
        Args: { _assignment_id: string; _user_id: string }
        Returns: boolean
      }
      reviews_attempt: {
        Args: { _attempt_id: string; _user_id: string }
        Returns: boolean
      }
      reviews_submission: {
        Args: { _submission_id: string; _user_id: string }
        Returns: boolean
      }
      shares_class_with: { Args: { _a: string; _b: string }; Returns: boolean }
    }
    Enums: {
      app_role: "student" | "teacher" | "admin"
      quiz_attempt_status:
        | "in_progress"
        | "submitted"
        | "graded"
        | "locked"
        | "expired"
      quiz_difficulty: "easy" | "medium" | "hard"
      quiz_kind: "practice" | "timed" | "scheduled" | "exam"
      quiz_question_type:
        | "mcq"
        | "multi_select"
        | "true_false"
        | "fill_blank"
        | "short_answer"
        | "essay"
      submission_status:
        | "not_started"
        | "in_progress"
        | "submitted"
        | "late"
        | "reviewed"
        | "returned"
        | "completed"
      submission_type: "handwritten" | "typed" | "either"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["student", "teacher", "admin"],
      quiz_attempt_status: [
        "in_progress",
        "submitted",
        "graded",
        "locked",
        "expired",
      ],
      quiz_difficulty: ["easy", "medium", "hard"],
      quiz_kind: ["practice", "timed", "scheduled", "exam"],
      quiz_question_type: [
        "mcq",
        "multi_select",
        "true_false",
        "fill_blank",
        "short_answer",
        "essay",
      ],
      submission_status: [
        "not_started",
        "in_progress",
        "submitted",
        "late",
        "reviewed",
        "returned",
        "completed",
      ],
      submission_type: ["handwritten", "typed", "either"],
    },
  },
} as const
