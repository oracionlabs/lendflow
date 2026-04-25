import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import api from '@/lib/api'
import type { User } from '@lendflow/shared'

export function AuthCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        try {
          const { data } = await api.get<{ user: User }>('/api/users/me')
          const role = data.user.role
          navigate(role === 'borrower' ? '/borrower' : role === 'lender' ? '/lender' : '/admin', { replace: true })
        } catch {
          navigate('/login', { replace: true })
        }
      }
    })
  }, [navigate])

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center space-y-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
        <p className="text-sm text-muted-foreground">Completing sign in…</p>
      </div>
    </div>
  )
}
