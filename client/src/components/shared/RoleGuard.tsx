import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import type { UserRole } from '@lendflow/shared'

interface Props {
  allowedRoles: UserRole[]
  redirectTo?: string
}

export function RoleGuard({ allowedRoles, redirectTo = '/login' }: Props) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!user) return <Navigate to={redirectTo} replace />

  if (!allowedRoles.includes(user.role)) {
    const roleHome: Record<UserRole, string> = {
      borrower: '/borrower',
      lender: '/lender',
      admin: '/admin',
    }
    return <Navigate to={roleHome[user.role]} replace />
  }

  return <Outlet />
}
