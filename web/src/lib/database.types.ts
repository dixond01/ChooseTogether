
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "media_files": {
                  Row: {
                    "converted_key": string | null,"duration_seconds": number | null,"id": string,"kind": Database["public"]['Enums']["media_kind"],"original_deleted_at": string | null,"original_key": string,"original_mime": string,"original_size_bytes": number,"processing_status": Database["public"]['Enums']["processing_status"],"submission_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "converted_key"?: string | null,"duration_seconds"?: number | null,"id"?: string,"kind": Database["public"]['Enums']["media_kind"],"original_deleted_at"?: string | null,"original_key": string,"original_mime": string,"original_size_bytes": number,"processing_status"?: Database["public"]['Enums']["processing_status"],"submission_id": string
                  }
                  Update: {
                    "converted_key"?: string | null,"duration_seconds"?: number | null,"id"?: string,"kind"?: Database["public"]['Enums']["media_kind"],"original_deleted_at"?: string | null,"original_key"?: string,"original_mime"?: string,"original_size_bytes"?: number,"processing_status"?: Database["public"]['Enums']["processing_status"],"submission_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "media_files_submission_id_fkey"
      columns: ["submission_id"]
isOneToOne: true
      referencedRelation: "submissions"
      referencedColumns: ["id"]
    }
                  ]
                },"participant_emails": {
                  Row: {
                    "email": string,"participant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "email": string,"participant_id": string
                  }
                  Update: {
                    "email"?: string,"participant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "participant_emails_participant_id_fkey"
      columns: ["participant_id"]
isOneToOne: true
      referencedRelation: "participants"
      referencedColumns: ["id"]
    }
                  ]
                },"participants": {
                  Row: {
                    "id": string,"name": string,"position": number,"submission_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"name": string,"position": number,"submission_id": string
                  }
                  Update: {
                    "id"?: string,"name"?: string,"position"?: number,"submission_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "participants_submission_id_fkey"
      columns: ["submission_id"]
isOneToOne: false
      referencedRelation: "submissions"
      referencedColumns: ["id"]
    }
                  ]
                },"processing_jobs": {
                  Row: {
                    "attempts": number,"created_at": string,"error": string | null,"finished_at": string | null,"id": string,"lease_until": string | null,"media_file_id": string,"mode": Database["public"]['Enums']["job_mode"],"requested_by": string | null,"status": Database["public"]['Enums']["job_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"lease_until"?: string | null,"media_file_id": string,"mode"?: Database["public"]['Enums']["job_mode"],"requested_by"?: string | null,"status"?: Database["public"]['Enums']["job_status"]
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"lease_until"?: string | null,"media_file_id"?: string,"mode"?: Database["public"]['Enums']["job_mode"],"requested_by"?: string | null,"status"?: Database["public"]['Enums']["job_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "processing_jobs_media_file_id_fkey"
      columns: ["media_file_id"]
isOneToOne: false
      referencedRelation: "media_files"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "processing_jobs_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "project_members"
      referencedColumns: ["id"]
    }
                  ]
                },"project_members": {
                  Row: {
                    "email": string,"id": string,"in_review_rotation": boolean,"invited_at": string,"project_id": string,"revoked_at": string | null,"role": Database["public"]['Enums']["member_role"],"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "email": string,"id"?: string,"in_review_rotation": boolean,"invited_at"?: string,"project_id": string,"revoked_at"?: string | null,"role"?: Database["public"]['Enums']["member_role"],"user_id"?: string | null
                  }
                  Update: {
                    "email"?: string,"id"?: string,"in_review_rotation"?: boolean,"invited_at"?: string,"project_id"?: string,"revoked_at"?: string | null,"role"?: Database["public"]['Enums']["member_role"],"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_members_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"projects": {
                  Row: {
                    "agreement_text": string | null,"created_at": string,"decision_rule": Database["public"]['Enums']["decision_rule"],"id": string,"max_duration_seconds": number | null,"max_participants": number | null,"name": string,"results_sent_at": string | null,"retention_grace_days": number,"retention_policy": Database["public"]['Enums']["retention_policy"],"reviewers_per_submission": number,"score_required": boolean,"slug": string,"submissions_close_at": string,"target_show_seconds": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "agreement_text"?: string | null,"created_at"?: string,"decision_rule"?: Database["public"]['Enums']["decision_rule"],"id"?: string,"max_duration_seconds"?: number | null,"max_participants"?: number | null,"name": string,"results_sent_at"?: string | null,"retention_grace_days"?: number,"retention_policy"?: Database["public"]['Enums']["retention_policy"],"reviewers_per_submission"?: number,"score_required"?: boolean,"slug": string,"submissions_close_at": string,"target_show_seconds"?: number | null
                  }
                  Update: {
                    "agreement_text"?: string | null,"created_at"?: string,"decision_rule"?: Database["public"]['Enums']["decision_rule"],"id"?: string,"max_duration_seconds"?: number | null,"max_participants"?: number | null,"name"?: string,"results_sent_at"?: string | null,"retention_grace_days"?: number,"retention_policy"?: Database["public"]['Enums']["retention_policy"],"reviewers_per_submission"?: number,"score_required"?: boolean,"slug"?: string,"submissions_close_at"?: string,"target_show_seconds"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"submissions": {
                  Row: {
                    "act_title": string,"agreed_at": string,"description": string,"id": string,"last_emailed_status": Database["public"]['Enums']["submission_status"] | null,"project_id": string,"stage_needs": string | null,"status": Database["public"]['Enums']["submission_status"],"submitted_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "act_title": string,"agreed_at": string,"description": string,"id"?: string,"last_emailed_status"?: Database["public"]['Enums']["submission_status"] | null,"project_id": string,"stage_needs"?: string | null,"status"?: Database["public"]['Enums']["submission_status"],"submitted_at"?: string
                  }
                  Update: {
                    "act_title"?: string,"agreed_at"?: string,"description"?: string,"id"?: string,"last_emailed_status"?: Database["public"]['Enums']["submission_status"] | null,"project_id"?: string,"stage_needs"?: string | null,"status"?: Database["public"]['Enums']["submission_status"],"submitted_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "submissions_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"tags": {
                  Row: {
                    "id": string,"name": string,"project_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"name": string,"project_id": string
                  }
                  Update: {
                    "id"?: string,"name"?: string,"project_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tags_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "claim_memberships":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"create_project":
{ Args: { "p_name": string,"p_slug": string,"p_submissions_close_at": string }; Returns: {
              "agreement_text": string | null,
"created_at": string,
"decision_rule": Database["public"]['Enums']["decision_rule"],
"id": string,
"max_duration_seconds": number | null,
"max_participants": number | null,
"name": string,
"results_sent_at": string | null,
"retention_grace_days": number,
"retention_policy": Database["public"]['Enums']["retention_policy"],
"reviewers_per_submission": number,
"score_required": boolean,
"slug": string,
"submissions_close_at": string,
"target_show_seconds": number | null
            }
                          SetofOptions: {
        from: "*"
        to: "projects"
        isOneToOne: true
        isSetofReturn: false
      } },
"get_public_form":
{ Args: { "p_slug": string }; Returns: {
              "agreement_text": string,"is_open": boolean,"max_duration_seconds": number,"max_participants": number,"name": string,"organizer_email": string,"project_id": string,"submissions_close_at": string
            }[]
                           },
"is_manager":
{ Args: { "p_project_id": string }; Returns: boolean
                           },
"is_member":
{ Args: { "p_project_id": string }; Returns: boolean
                           },
"my_role":
{ Args: { "p_project_id": string }; Returns: Database["public"]['Enums']["member_role"]
                           }
          }
          Enums: {
            "decision_rule": "any_disagreement_to_owner"|"majority","job_mode": "standard"|"safe","job_status": "awaiting_upload"|"queued"|"running"|"done"|"failed","media_kind": "video"|"audio"|"image"|"text","member_role": "owner"|"co_manager"|"member","processing_status": "pending"|"ready"|"failed","retention_policy": "after_conversion"|"until_results_sent"|"forever","submission_status": "submitted"|"in_review"|"pending_decision"|"selected"|"waitlisted"|"not_selected"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "decision_rule": ["any_disagreement_to_owner", "majority"],"job_mode": ["standard", "safe"],"job_status": ["awaiting_upload", "queued", "running", "done", "failed"],"media_kind": ["video", "audio", "image", "text"],"member_role": ["owner", "co_manager", "member"],"processing_status": ["pending", "ready", "failed"],"retention_policy": ["after_conversion", "until_results_sent", "forever"],"submission_status": ["submitted", "in_review", "pending_decision", "selected", "waitlisted", "not_selected"]
          }
        }
} as const
