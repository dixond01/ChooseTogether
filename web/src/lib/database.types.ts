
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
            "email_templates": {
                  Row: {
                    "body": string,"id": string,"project_id": string,"status": Database["public"]['Enums']["submission_status"],"subject": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"id"?: string,"project_id": string,"status": Database["public"]['Enums']["submission_status"],"subject": string,"updated_at"?: string
                  }
                  Update: {
                    "body"?: string,"id"?: string,"project_id"?: string,"status"?: Database["public"]['Enums']["submission_status"],"subject"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "email_templates_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"media_files": {
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
                },"project_fields": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"id": string,"label": string,"options": (string)[] | null,"placeholder": string | null,"position": number,"project_id": string,"required": boolean,"type": Database["public"]['Enums']["field_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"label": string,"options"?: (string)[] | null,"placeholder"?: string | null,"position": number,"project_id": string,"required"?: boolean,"type": Database["public"]['Enums']["field_type"]
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"label"?: string,"options"?: (string)[] | null,"placeholder"?: string | null,"position"?: number,"project_id"?: string,"required"?: boolean,"type"?: Database["public"]['Enums']["field_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_fields_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
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
                },"project_requests": {
                  Row: {
                    "created_at": string,"decided_at": string | null,"decision_note": string | null,"dismissed_at": string | null,"email": string,"id": string,"note": string,"project_id": string | null,"project_name": string,"slug": string,"status": Database["public"]['Enums']["request_status"],"submissions_close_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"decided_at"?: string | null,"decision_note"?: string | null,"dismissed_at"?: string | null,"email": string,"id"?: string,"note": string,"project_id"?: string | null,"project_name": string,"slug": string,"status"?: Database["public"]['Enums']["request_status"],"submissions_close_at": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"decided_at"?: string | null,"decision_note"?: string | null,"dismissed_at"?: string | null,"email"?: string,"id"?: string,"note"?: string,"project_id"?: string | null,"project_name"?: string,"slug"?: string,"status"?: Database["public"]['Enums']["request_status"],"submissions_close_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_requests_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"projects": {
                  Row: {
                    "accepted_kinds": (Database["public"]['Enums']["media_kind"])[],"agreement_text": string | null,"created_at": string,"decision_rule": Database["public"]['Enums']["decision_rule"],"description_label": string,"file_label": string,"file_requirement": Database["public"]['Enums']["file_requirement"],"id": string,"max_duration_seconds": number | null,"max_participants": number | null,"name": string,"participant_label": string,"participants_label": string,"results_sent_at": string | null,"retention_grace_days": number,"retention_policy": Database["public"]['Enums']["retention_policy"],"reviewers_per_submission": number,"score_required": boolean,"show_enabled": boolean,"slug": string,"submissions_close_at": string,"target_show_seconds": number | null,"title_label": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_kinds"?: (Database["public"]['Enums']["media_kind"])[],"agreement_text"?: string | null,"created_at"?: string,"decision_rule"?: Database["public"]['Enums']["decision_rule"],"description_label"?: string,"file_label"?: string,"file_requirement"?: Database["public"]['Enums']["file_requirement"],"id"?: string,"max_duration_seconds"?: number | null,"max_participants"?: number | null,"name": string,"participant_label"?: string,"participants_label"?: string,"results_sent_at"?: string | null,"retention_grace_days"?: number,"retention_policy"?: Database["public"]['Enums']["retention_policy"],"reviewers_per_submission"?: number,"score_required"?: boolean,"show_enabled"?: boolean,"slug": string,"submissions_close_at": string,"target_show_seconds"?: number | null,"title_label"?: string
                  }
                  Update: {
                    "accepted_kinds"?: (Database["public"]['Enums']["media_kind"])[],"agreement_text"?: string | null,"created_at"?: string,"decision_rule"?: Database["public"]['Enums']["decision_rule"],"description_label"?: string,"file_label"?: string,"file_requirement"?: Database["public"]['Enums']["file_requirement"],"id"?: string,"max_duration_seconds"?: number | null,"max_participants"?: number | null,"name"?: string,"participant_label"?: string,"participants_label"?: string,"results_sent_at"?: string | null,"retention_grace_days"?: number,"retention_policy"?: Database["public"]['Enums']["retention_policy"],"reviewers_per_submission"?: number,"score_required"?: boolean,"show_enabled"?: boolean,"slug"?: string,"submissions_close_at"?: string,"target_show_seconds"?: number | null,"title_label"?: string
                  }
                  Relationships: [
                    
                  ]
                },"site_admins": {
                  Row: {
                    "added_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_at"?: string,"user_id": string
                  }
                  Update: {
                    "added_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"submission_answers": {
                  Row: {
                    "field_id": string,"submission_id": string,"value_bool": boolean | null,"value_date": string | null,"value_number": number | null,"value_text": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "field_id": string,"submission_id": string,"value_bool"?: boolean | null,"value_date"?: string | null,"value_number"?: number | null,"value_text"?: string | null
                  }
                  Update: {
                    "field_id"?: string,"submission_id"?: string,"value_bool"?: boolean | null,"value_date"?: string | null,"value_number"?: number | null,"value_text"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "submission_answers_field_id_fkey"
      columns: ["field_id"]
isOneToOne: false
      referencedRelation: "project_fields"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "submission_answers_submission_id_fkey"
      columns: ["submission_id"]
isOneToOne: false
      referencedRelation: "submissions"
      referencedColumns: ["id"]
    }
                  ]
                },"submissions": {
                  Row: {
                    "act_title": string,"agreed_at": string,"description": string,"id": string,"last_emailed_status": Database["public"]['Enums']["submission_status"] | null,"project_id": string,"status": Database["public"]['Enums']["submission_status"],"submitted_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "act_title": string,"agreed_at": string,"description": string,"id"?: string,"last_emailed_status"?: Database["public"]['Enums']["submission_status"] | null,"project_id": string,"status"?: Database["public"]['Enums']["submission_status"],"submitted_at"?: string
                  }
                  Update: {
                    "act_title"?: string,"agreed_at"?: string,"description"?: string,"id"?: string,"last_emailed_status"?: Database["public"]['Enums']["submission_status"] | null,"project_id"?: string,"status"?: Database["public"]['Enums']["submission_status"],"submitted_at"?: string
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
            "add_default_email_templates":
{ Args: { "p_project_id": string }; Returns: undefined
                           },
"claim_memberships":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"create_project":
{ Args: { "p_name": string,"p_slug": string,"p_submissions_close_at": string }; Returns: {
              "accepted_kinds": (Database["public"]['Enums']["media_kind"])[],
"agreement_text": string | null,
"created_at": string,
"decision_rule": Database["public"]['Enums']["decision_rule"],
"description_label": string,
"file_label": string,
"file_requirement": Database["public"]['Enums']["file_requirement"],
"id": string,
"max_duration_seconds": number | null,
"max_participants": number | null,
"name": string,
"participant_label": string,
"participants_label": string,
"results_sent_at": string | null,
"retention_grace_days": number,
"retention_policy": Database["public"]['Enums']["retention_policy"],
"reviewers_per_submission": number,
"score_required": boolean,
"show_enabled": boolean,
"slug": string,
"submissions_close_at": string,
"target_show_seconds": number | null,
"title_label": string
            }
                          SetofOptions: {
        from: "*"
        to: "projects"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_submission":
{ Args: { "p_agreed": boolean,"p_answers": Json,"p_description": string,"p_file": Json,"p_participants": Json,"p_project_id": string,"p_title": string }; Returns: {
              "job_id": string,"media_file_id": string,"original_key": string,"submission_id": string
            }[]
                           },
"decide_project_request":
{ Args: { "p_approve": boolean,"p_note"?: string,"p_request_id": string }; Returns: {
              "created_at": string,
"decided_at": string | null,
"decision_note": string | null,
"dismissed_at": string | null,
"email": string,
"id": string,
"note": string,
"project_id": string | null,
"project_name": string,
"slug": string,
"status": Database["public"]['Enums']["request_status"],
"submissions_close_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "project_requests"
        isOneToOne: true
        isSetofReturn: false
      } },
"dismiss_project_request":
{ Args: { "p_request_id": string }; Returns: undefined
                           },
"get_public_form":
{ Args: { "p_slug": string }; Returns: {
              "accepted_kinds": (Database["public"]['Enums']["media_kind"])[],"agreement_text": string,"description_label": string,"file_label": string,"file_requirement": Database["public"]['Enums']["file_requirement"],"is_open": boolean,"max_duration_seconds": number,"max_participants": number,"name": string,"organizer_email": string,"participant_label": string,"participants_label": string,"project_id": string,"submissions_close_at": string,"title_label": string
            }[]
                           },
"get_public_form_fields":
{ Args: { "p_slug": string }; Returns: {
              "id": string,"label": string,"options": (string)[],"placeholder": string,"required": boolean,"type": Database["public"]['Enums']["field_type"]
            }[]
                           },
"insert_project_with_owner":
{ Args: { "p_name": string,"p_owner_email": string,"p_owner_id": string,"p_slug": string,"p_submissions_close_at": string }; Returns: {
              "accepted_kinds": (Database["public"]['Enums']["media_kind"])[],
"agreement_text": string | null,
"created_at": string,
"decision_rule": Database["public"]['Enums']["decision_rule"],
"description_label": string,
"file_label": string,
"file_requirement": Database["public"]['Enums']["file_requirement"],
"id": string,
"max_duration_seconds": number | null,
"max_participants": number | null,
"name": string,
"participant_label": string,
"participants_label": string,
"results_sent_at": string | null,
"retention_grace_days": number,
"retention_policy": Database["public"]['Enums']["retention_policy"],
"reviewers_per_submission": number,
"score_required": boolean,
"show_enabled": boolean,
"slug": string,
"submissions_close_at": string,
"target_show_seconds": number | null,
"title_label": string
            }
                          SetofOptions: {
        from: "*"
        to: "projects"
        isOneToOne: true
        isSetofReturn: false
      } },
"is_manager":
{ Args: { "p_project_id": string }; Returns: boolean
                           },
"is_member":
{ Args: { "p_project_id": string }; Returns: boolean
                           },
"is_site_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"my_role":
{ Args: { "p_project_id": string }; Returns: Database["public"]['Enums']["member_role"]
                           },
"reorder_project_fields":
{ Args: { "p_ids": (string)[],"p_project_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "decision_rule": "any_disagreement_to_owner"|"majority","field_type": "short_text"|"long_text"|"number"|"choice"|"checkbox"|"date","file_requirement": "required"|"optional"|"none","job_mode": "standard"|"safe","job_status": "awaiting_upload"|"queued"|"running"|"done"|"failed","media_kind": "video"|"audio"|"image"|"text","member_role": "owner"|"co_manager"|"member","processing_status": "pending"|"ready"|"failed","request_status": "pending"|"approved"|"denied","retention_policy": "after_conversion"|"until_results_sent"|"forever","submission_status": "submitted"|"in_review"|"pending_decision"|"selected"|"waitlisted"|"not_selected"
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
            "decision_rule": ["any_disagreement_to_owner", "majority"],"field_type": ["short_text", "long_text", "number", "choice", "checkbox", "date"],"file_requirement": ["required", "optional", "none"],"job_mode": ["standard", "safe"],"job_status": ["awaiting_upload", "queued", "running", "done", "failed"],"media_kind": ["video", "audio", "image", "text"],"member_role": ["owner", "co_manager", "member"],"processing_status": ["pending", "ready", "failed"],"request_status": ["pending", "approved", "denied"],"retention_policy": ["after_conversion", "until_results_sent", "forever"],"submission_status": ["submitted", "in_review", "pending_decision", "selected", "waitlisted", "not_selected"]
          }
        }
} as const
