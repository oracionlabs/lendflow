export type NotificationType =
  | 'loan_status'
  | 'payment_due'
  | 'payment_received'
  | 'commitment_funded'
  | 'yield_received'
  | 'loan_completed'
  | 'loan_non_performing'
  | 'badge'
  | 'system'

export type NotificationChannel = 'in_app' | 'email' | 'both'

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  body?: string
  link?: string
  channel: NotificationChannel
  read: boolean
  read_at?: string
  email_sent: boolean
  created_at: string
}

export interface NotificationPreferences {
  id: string
  user_id: string
  loan_status_in_app: boolean
  loan_status_email: boolean
  payment_due_in_app: boolean
  payment_due_email: boolean
  yield_received_in_app: boolean
  yield_received_email: boolean
  system_in_app: boolean
  system_email: boolean
  updated_at: string
}
