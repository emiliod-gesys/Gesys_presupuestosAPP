export type UserRole = "admin" | "worker" | "observer"
export type ProjectStatus = "active" | "completed" | "archived"
export type TransactionFlow = "income" | "expense"
export type InvitationStatus = "pending" | "accepted" | "rejected"
export type NotificationType = "budget_alert" | "project_invitation" | "companion_request" | "project_update"

export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface Companion {
  id: string
  user_id: string
  companion_id: string
  status: InvitationStatus
  created_at: string
  companion?: Profile
  user?: Profile
}

export interface Project {
  id: string
  name: string
  description: string | null
  location: string | null
  client: string | null
  start_date: string | null
  end_date: string | null
  status: ProjectStatus
  is_template: boolean
  template_id: string | null
  created_by: string
  total_budget: number
  currency: string
  created_at: string
  updated_at: string
  creator?: Profile
  my_role?: UserRole
  member_count?: number
  spent?: number
}

export interface ProjectMember {
  id: string
  project_id: string
  user_id: string
  role: UserRole
  invited_by: string | null
  joined_at: string
  user?: Profile
}

export interface ProjectInvitation {
  id: string
  project_id: string
  inviter_id: string
  invitee_id: string
  role: UserRole
  status: InvitationStatus
  created_at: string
  project?: Project
  inviter?: Profile
  invitee?: Profile
}

export interface BudgetCategory {
  id: string
  project_id: string
  name: string
  description: string | null
  budget_amount: number
  parent_id: string | null
  order_index: number
  created_at: string
  children?: BudgetCategory[]
  spent?: number
}

export interface BudgetAlert {
  id: string
  category_id: string
  project_id: string
  threshold_percentage: number
  is_active: boolean
  created_by: string
  created_at: string
  category?: BudgetCategory
}

export interface TransactionType {
  id: string
  name: string
  type: TransactionFlow
  description: string | null
}

export interface Transaction {
  id: string
  project_id: string
  category_id: string | null
  transaction_type_id: string
  description: string
  amount: number
  date: string
  reference_number: string | null
  vendor: string | null
  attachment_url: string | null
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
  transaction_type?: TransactionType
  category?: BudgetCategory
  creator?: Profile
}

export interface TransactionComment {
  id: string
  transaction_id: string
  user_id: string
  body: string
  created_at: string
  author?: Profile
}

export interface ProjectLog {
  id: string
  project_id: string
  user_id: string
  action: string
  details: Record<string, unknown> | null
  created_at: string
  user?: Profile
}

export interface Notification {
  id: string
  user_id: string
  project_id: string | null
  type: NotificationType
  title: string
  message: string
  is_read: boolean
  data: Record<string, unknown> | null
  created_at: string
  project?: Project
}
