import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner'

export function LoginPage() {
  const { signInWithPassword, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await signInWithPassword(email, password)
      navigate('/')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh flex bg-background">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-[46%] bg-sidebar flex-col justify-between p-12 xl:p-16 relative overflow-hidden">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-primary/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-lime/10 blur-3xl" />
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-lime flex items-center justify-center shadow-sm">
            <span className="text-sm font-bold text-lime-foreground">L</span>
          </div>
          <span className="text-white font-bold text-lg tracking-tight">LendFlow</span>
        </div>
        <div className="relative max-w-xl">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.18em] text-lime">Private lending, clearly managed</p>
          <blockquote className="text-white text-3xl xl:text-4xl font-semibold leading-tight tracking-tight">
            Keep every agreement, payment, and next step in one dependable place.
          </blockquote>
          <p className="text-white/55 text-sm mt-5 max-w-md leading-relaxed">
            Built for lenders and borrowers managing real-world cash and product loans.
          </p>
        </div>
        <div className="flex gap-3">
          {['Cash & product loans', 'Flexible repayments', 'InstaPay tracking'].map(label => (
            <div key={label} className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 flex-1">
              <p className="text-white/70 text-xs leading-snug">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-6 lg:hidden">
              <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-xs font-bold text-white">L</span>
              </div>
              <span className="font-bold">LendFlow</span>
            </div>
            <h1 className="page-heading">Welcome back</h1>
            <p className="text-muted-foreground text-sm mt-2">Sign in to manage your loans and payments.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
                inputMode="email"
                className="w-full rounded-xl border bg-card px-3.5 py-3 text-base"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-xl border bg-card px-3.5 py-3 text-base"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="button-primary w-full py-3 text-base"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-background px-3 text-muted-foreground">or</span></div>
          </div>

          <button
            onClick={() => signInWithGoogle()}
            className="button-secondary w-full py-3 text-base gap-2"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Continue with Google
          </button>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Don't have an account?{' '}
            <Link to="/register" className="font-medium text-primary hover:underline">Sign up</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
