import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import api from '@/lib/api'
import { toast } from 'sonner'

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
    <div className="min-h-screen flex bg-background">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary flex-col justify-between p-12">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center">
            <span className="text-sm font-bold text-white">L</span>
          </div>
          <span className="text-white font-bold text-lg">LendFlow</span>
        </div>
        <div className="space-y-6">
          {[
            { icon: '🔒', title: 'Private & Vetted', desc: 'Every borrower and lender is manually reviewed before accessing the network.' },
            { icon: '📊', title: 'Full Transparency', desc: 'AI credit assessments, amortization schedules, and yield tracking — all visible.' },
            { icon: '⚡', title: 'Fast Origination', desc: 'Lenders can originate and fund deals directly, closing in days not months.' },
          ].map(item => (
            <div key={item.title} className="flex gap-4">
              <div className="text-2xl">{item.icon}</div>
              <div>
                <p className="text-white font-semibold text-sm">{item.title}</p>
                <p className="text-white/60 text-xs mt-0.5 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-white/40 text-xs">LendFlow is a private lending management platform. Capital is at risk.</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-6 lg:hidden">
              <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-xs font-bold text-white">L</span>
              </div>
              <span className="font-bold">LendFlow</span>
            </div>

            {step === 1 ? (
              <>
                <h1 className="text-2xl font-bold">Create your account</h1>
                <p className="text-muted-foreground text-sm mt-1">Choose how you'll use LendFlow</p>
              </>
            ) : (
              <>
                <button onClick={() => setStep(1)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
                  ← Back
                </button>
                <h1 className="text-2xl font-bold">Your details</h1>
                <p className="text-muted-foreground text-sm mt-1">
                  Signing up as a <span className="font-medium text-foreground capitalize">{role === 'lender' ? 'Capital Partner' : role}</span>
                </p>
              </>
            )}
          </div>

          {step === 1 && (
            <div className="space-y-3">
              {([
                { role: 'borrower' as Role, label: 'Borrower', desc: 'Apply for loans, track repayments, manage your application history', icon: '📋' },
                { role: 'lender' as Role, label: 'Capital Partner', desc: 'Fund vetted loan opportunities, earn yield, originate deals directly', icon: '💼' },
              ]).map(opt => (
                <button
                  key={opt.role}
                  onClick={() => { setRole(opt.role); setStep(2) }}
                  className="w-full flex items-start gap-4 rounded-xl border-2 border-border bg-white p-5 hover:border-primary hover:shadow-card-md transition-all text-left group"
                >
                  <span className="text-2xl">{opt.icon}</span>
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
                    className="w-full rounded-lg border bg-white px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
                    className="w-full rounded-lg border bg-white px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
                    className="w-full rounded-lg border bg-white px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    placeholder="Min. 8 characters"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-sm"
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
