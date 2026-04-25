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
      const msg = err instanceof Error ? err.message : 'Registration failed'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  if (step === 1) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-md space-y-8 p-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight">Join LendFlow</h1>
            <p className="mt-2 text-muted-foreground">Choose your role to get started</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => { setRole('borrower'); setStep(2) }}
              className="group flex flex-col items-center rounded-xl border-2 p-6 hover:border-primary transition-colors text-center"
            >
              <div className="text-3xl mb-3">📋</div>
              <div className="font-semibold">Borrower</div>
              <div className="text-xs text-muted-foreground mt-1">Apply for a loan, make repayments</div>
            </button>
            <button
              onClick={() => { setRole('lender'); setStep(2) }}
              className="group flex flex-col items-center rounded-xl border-2 p-6 hover:border-primary transition-colors text-center"
            >
              <div className="text-3xl mb-3">💼</div>
              <div className="font-semibold">Capital Partner</div>
              <div className="text-xs text-muted-foreground mt-1">Fund loans, earn interest income</div>
            </button>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-foreground hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-8 p-8">
        <div className="text-center">
          <button onClick={() => setStep(1)} className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block">
            ← Back
          </button>
          <h1 className="text-3xl font-bold tracking-tight">Create your account</h1>
          <p className="mt-2 text-muted-foreground">
            Signing up as a <span className="font-medium capitalize">{role}</span>
          </p>
        </div>

        {role === 'lender' && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <strong>Risk Disclosure:</strong> This platform facilitates private lending. Loans can default and capital is at risk. This is not a guaranteed return product.
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
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Min 8 characters"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-foreground hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
