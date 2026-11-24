import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import api from '@/lib/api'
import { toast } from 'sonner'
import { BriefcaseBusiness, ChartNoAxesCombined, LockKeyhole, UserRound, Zap } from 'lucide-react'

type Role = 'borrower' | 'lender'

export function RegisterPage() {
  const { signInWithPassword } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2>(1)
  const [role, setRole] = useState<Role | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!role) return
    setLoading(true)
    try {
      await api.post('/api/auth/register', { email, password, name, role })
      await signInWithPassword(email, password)
      navigate(role === 'borrower' ? '/borrower' : '/lender')
      toast.success('Account created! Welcome to LendFlow.')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? (err instanceof Error ? err.message : 'Registration failed')
      toast.error(msg)
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
        <div className="space-y-7 relative">
          {[
            { icon: LockKeyhole, title: 'Private & Vetted', desc: 'Every borrower and lender is manually reviewed before accessing the network.' },
            { icon: ChartNoAxesCombined, title: 'Full Transparency', desc: 'Credit assessments, repayment schedules, and yield tracking stay visible.' },
            { icon: Zap, title: 'Flexible Origination', desc: 'Arrange cash or product loans and track payments from one clear workspace.' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-lime">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm">{title}</p>
                <p className="text-white/55 text-xs mt-1 leading-relaxed max-w-sm">{desc}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-white/40 text-xs">LendFlow is a private lending management platform. Capital is at risk.</p>
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

            {step === 1 ? (
              <>
                <h1 className="page-heading">Create your account</h1>
                <p className="text-muted-foreground text-sm mt-2">Choose how you'll use LendFlow.</p>
              </>
            ) : (
              <>
                <button onClick={() => setStep(1)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
                  ← Back
                </button>
                <h1 className="page-heading">Your details</h1>
                <p className="text-muted-foreground text-sm mt-1">
                  Signing up as a <span className="font-medium text-foreground capitalize">{role === 'lender' ? 'Capital Partner' : role}</span>
                </p>
              </>
            )}
          </div>

          {step === 1 && (
            <div className="space-y-3">
              {([
                { role: 'borrower' as Role, label: 'Borrower', desc: 'Apply for loans, track repayments, manage your application history', icon: UserRound },
                { role: 'lender' as Role, label: 'Capital Partner', desc: 'Fund vetted loan opportunities, earn yield, originate deals directly', icon: BriefcaseBusiness },
              ]).map(opt => (
                <button
                  key={opt.role}
                  onClick={() => { setRole(opt.role); setStep(2) }}
                  className="w-full flex items-start gap-4 rounded-2xl border border-border bg-card p-5 min-h-11 interactive-card text-left group"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <opt.icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-semibold text-sm group-hover:text-primary transition-colors">{opt.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{opt.desc}</p>
                  </div>
                </button>
              ))}
              <p className="text-center text-sm text-muted-foreground pt-2">
                Already have an account?{' '}
                <Link to="/login" className="font-medium text-primary hover:underline">Sign in</Link>
              </p>
            </div>
          )}

          {step === 2 && (
            <>
              {role === 'lender' && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 mb-4 leading-relaxed">
                  <strong>Risk Disclosure:</strong> Private lending involves risk of capital loss. Loans can default and there is no guarantee of return.
                </div>
              )}

              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    autoFocus
                    autoComplete="name"
                    className="w-full rounded-xl border bg-card px-3.5 py-3 text-base"
                    placeholder="Jane Smith"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
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
                    minLength={8}
                    autoComplete="new-password"
                    className="w-full rounded-xl border bg-card px-3.5 py-3 text-base"
                    placeholder="Min. 8 characters"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="button-primary w-full py-3 text-base"
                >
                  {loading ? 'Creating account…' : 'Create account'}
                </button>
              </form>

              <p className="text-center text-sm text-muted-foreground mt-5">
                Already have an account?{' '}
                <Link to="/login" className="font-medium text-primary hover:underline">Sign in</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
