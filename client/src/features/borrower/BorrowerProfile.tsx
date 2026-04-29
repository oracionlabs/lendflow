import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner'
import type { BorrowerProfile } from '@lendflow/shared'
import { formatCents, useCurrency } from '@/lib/utils'
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton'
import { BarChart2, ChevronRight } from 'lucide-react'

export function BorrowerProfilePage() {
  useCurrency() // subscribe to currency changes
  const { user } = useAuth()
  const qc = useQueryClient()

  const { data: profile, isLoading } = useQuery({
    queryKey: ['borrower-profile'],
    queryFn: async () => {
      const { data } = await api.get<{ profile: BorrowerProfile }>('/api/borrower/profile')
      return data.profile
    },
  })

  const { data: completionData } = useQuery({
    queryKey: ['profile-completion'],
    queryFn: async () => {
      const { data } = await api.get<{ completion: number; canApply: boolean }>('/api/borrower/profile/completion')
      return data
    },
  })

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<BorrowerProfile>>({})

  const save = useMutation({
    mutationFn: (updates: Partial<BorrowerProfile>) => api.put('/api/borrower/profile', updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['borrower-profile'] })
      qc.invalidateQueries({ queryKey: ['profile-completion'] })
      setEditing(false)
      toast.success('Profile updated')
    },
    onError: () => toast.error('Failed to update profile'),
  })

  const handleEdit = () => {
    setForm({
      date_of_birth: profile?.date_of_birth ?? '',
      address_line1: profile?.address_line1 ?? '',
      city: profile?.city ?? '',
      state: profile?.state ?? '',
      zip: profile?.zip ?? '',
      employment_status: profile?.employment_status,
      employer: profile?.employer ?? '',
      job_title: profile?.job_title ?? '',
      annual_income: profile?.annual_income ?? 0,
      monthly_expenses: profile?.monthly_expenses ?? 0,
      credit_score_range: profile?.credit_score_range,
    })
    setEditing(true)
  }

  if (isLoading) return <LoadingSkeleton lines={8} />

  return (
    <div className="max-w-2xl space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Profile</h1>
          <p className="text-muted-foreground mt-1">{user?.email}</p>
        </div>
        {!editing && (
          <button onClick={handleEdit} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors">
            Edit Profile
          </button>
        )}
      </div>

      {completionData && (
        <div className="rounded-lg border p-4 space-y-2">
          <div className="flex justify-between text-sm font-medium">
            <span>Profile Completion</span>
            <span>{completionData.completion}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div
              className={`h-2 rounded-full transition-all ${completionData.completion >= 80 ? 'bg-green-500' : 'bg-amber-500'}`}
              style={{ width: `${completionData.completion}%` }}
            />
          </div>
          {!completionData.canApply && (
            <p className="text-xs text-amber-600">Reach 80% to apply for loans</p>
          )}
        </div>
      )}

      {editing ? (
        <form onSubmit={e => { e.preventDefault(); save.mutate(form) }} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Date of Birth</label>
              <input type="date" value={form.date_of_birth ?? ''} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Employment Status</label>
              <select value={form.employment_status ?? ''} onChange={e => setForm(f => ({ ...f, employment_status: e.target.value as BorrowerProfile['employment_status'] }))}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="employed">Employed</option>
                <option value="self_employed">Self-Employed</option>
                <option value="unemployed">Unemployed</option>
                <option value="retired">Retired</option>
                <option value="student">Student</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Address</label>
            <input type="text" value={form.address_line1 ?? ''} onChange={e => setForm(f => ({ ...f, address_line1: e.target.value }))} placeholder="Street address"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-1">
              <label className="block text-sm font-medium mb-1.5">City</label>
              <input type="text" value={form.city ?? ''} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">State</label>
              <input type="text" value={form.state ?? ''} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} maxLength={2}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">ZIP</label>
              <input type="text" value={form.zip ?? ''} onChange={e => setForm(f => ({ ...f, zip: e.target.value }))}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Annual Income ($)</label>
              <input type="number" value={(form.annual_income ?? 0) / 100} onChange={e => setForm(f => ({ ...f, annual_income: Math.round(parseFloat(e.target.value || '0') * 100) }))}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Monthly Expenses ($)</label>
              <input type="number" value={(form.monthly_expenses ?? 0) / 100} onChange={e => setForm(f => ({ ...f, monthly_expenses: Math.round(parseFloat(e.target.value || '0') * 100) }))}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Credit Score Range</label>
            <select value={form.credit_score_range ?? ''} onChange={e => setForm(f => ({ ...f, credit_score_range: e.target.value as BorrowerProfile['credit_score_range'] }))}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Select…</option>
              <option value="poor">Poor (below 580)</option>
              <option value="fair">Fair (580–669)</option>
              <option value="good">Good (670–739)</option>
              <option value="very_good">Very Good (740–799)</option>
              <option value="excellent">Excellent (800+)</option>
            </select>
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={save.isPending}
              className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {save.isPending ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" onClick={() => setEditing(false)}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4 text-sm">
          {[
            { label: 'Date of Birth', value: profile?.date_of_birth },
            { label: 'Address', value: [profile?.address_line1, profile?.city, profile?.state, profile?.zip].filter(Boolean).join(', ') },
            { label: 'Employment', value: profile?.employment_status?.replace('_', ' ') },
            { label: 'Employer', value: profile?.employer },
            { label: 'Annual Income', value: profile?.annual_income ? formatCents(profile.annual_income) : undefined },
            { label: 'Monthly Expenses', value: profile?.monthly_expenses ? formatCents(profile.monthly_expenses) : undefined },
            { label: 'Credit Score', value: profile?.credit_score_range?.replace('_', ' ') },
          ].map(({ label, value }) => (
            value ? (
              <div key={label} className="flex gap-4 py-2 border-b last:border-0">
                <span className="w-40 text-muted-foreground shrink-0">{label}</span>
                <span className="font-medium capitalize">{value}</span>
              </div>
            ) : null
          ))}
        </div>
      )}

      <Link to="/borrower/reports"
        className="flex items-center justify-between card-base p-4 hover:bg-muted/30 transition-colors">
        <div className="flex items-center gap-3">
          <BarChart2 className="h-5 w-5 text-primary" />
          <span className="font-medium text-sm">Reports & Analytics</span>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </Link>
    </div>
  )
}
