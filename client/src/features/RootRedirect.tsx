import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export function RootRedirect() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (user.role === 'borrower') return <Navigate to="/borrower" replace />
  if (user.role === 'lender') return <Navigate to="/lender" replace />
  return <Navigate to="/admin" replace />
}
