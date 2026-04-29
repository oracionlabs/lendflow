import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import api from '@/lib/api'
import { toast } from 'sonner'
import type { PlatformSettings } from '@lendflow/shared'
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton'

export function PlatformSettings() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<PlatformSettings>>({})

  const { data: settings, isLoading } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: async () => {
      const { data } = await api.get<{ settings: PlatformSettings }>('/api/admin/settings')
      return data.settings
    },
  })

  const save = useMutation({
    mutationFn: (updates: Partial<PlatformSettings>) => api.put('/api/admin/settings', updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-settings'] })
      qc.invalidateQueries({ queryKey: ['platform-settings-currency'] })
      setEditing(false)
      toast.success('Settings updated. Changes apply to new loans only.')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to update settings'
      toast.error(msg)
    },
  })

  const handleEdit = () => {
    setForm({ ...settings })
    setEditing(true)
  }

  if (isLoading) return <LoadingSkeleton lines={10} />

  return (
    <div className="max-w-2xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Platform Settings</h1>
        {!editing && (
          <button onClick={handleEdit} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors">
            Edit Settings
          </button>
        )}
      </div>

      <div className="rounded-lg border bg-amber-50 border-amber-200 p-3 text-xs text-amber-800">
        Changes apply to new loans only. Existing loans retain their original terms.
      </div>

      {editing ? (
        <form onSubmit={e => { e.preventDefault(); save.mutate(form) }} className="space-y-6">
          <section className="space-y-4">
            <h2 className="font-semibold">Currency</h2>
            <div>
              <label className="block text-sm font-medium mb-1.5">Platform Currency</label>
              <select value={(form as Record<string, unknown>).currency as string ?? 'USD'}
                onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {[
                  ['USD', 'USD — US Dollar ($)'],
                  ['EUR', 'EUR — Euro (€)'],
                  ['GBP', 'GBP — British Pound (£)'],
                  ['AUD', 'AUD — Australian Dollar (A$)'],
                  ['CAD', 'CAD — Canadian Dollar (C$)'],
                  ['ZAR', 'ZAR — South African Rand (R)'],
                  ['NGN', 'NGN — Nigerian Naira (₦)'],
                  ['GHS', 'GHS — Ghanaian Cedi (₵)'],
                  ['KES', 'KES — Kenyan Shilling (KSh)'],
                  ['JPY', 'JPY — Japanese Yen (¥)'],
                  ['INR', 'INR — Indian Rupee (₹)'],
                  ['BRL', 'BRL — Brazilian Real (R$)'],
                  ['MXN', 'MXN — Mexican Peso (MX$)'],
                  ['SGD', 'SGD — Singapore Dollar (S$)'],
                  ['AED', 'AED — UAE Dirham (د.إ)'],
                ].map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">Affects how amounts are displayed across the entire platform.</p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="font-semibold">Fees</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Origination Fee (%)</label>
                <input type="number" step="0.01" value={((form.origination_fee_percent ?? 0) * 100).toFixed(2)}
                  onChange={e => setForm(f => ({ ...f, origination_fee_percent: parseFloat(e.target.value) / 100 }))}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Late Fee Flat ($)</label>
                <input type="number" step="1" value={(form.late_fee_flat ?? 0) / 100}
                  onChange={e => setForm(f => ({ ...f, late_fee_flat: Math.round(parseFloat(e.target.value) * 100) }))}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Grace Period (days)</label>
                <input type="number" min="0" value={form.grace_period_days ?? 5}
                  onChange={e => setForm(f => ({ ...f, grace_period_days: parseInt(e.target.value) }))}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Default Threshold (missed payments)</label>
                <input type="number" min="1" value={form.default_threshold_missed ?? 3}
                  onChange={e => setForm(f => ({ ...f, default_threshold_missed: parseInt(e.target.value) }))}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="font-semibold">Loan Limits</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Min Loan Amount ($)</label>
                <input type="number" value={(form.min_loan_amount ?? 0) / 100}
                  onChange={e => setForm(f => ({ ...f, min_loan_amount: Math.round(parseFloat(e.target.value) * 100) }))}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Max Loan Amount ($)</label>
                <input type="number" value={(form.max_loan_amount ?? 0) / 100}
                  onChange={e => setForm(f => ({ ...f, max_loan_amount: Math.round(parseFloat(e.target.value) * 100) }))}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Min Commitment ($)</label>
                <input type="number" value={(form.min_commitment_amount ?? 0) / 100}
                  onChange={e => setForm(f => ({ ...f, min_commitment_amount: Math.round(parseFloat(e.target.value) * 100) }))}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-semibold">Interest Rates by Credit Grade</h2>
            <div className="grid grid-cols-5 gap-3">
              {['A', 'B', 'C', 'D', 'E'].map(grade => (
                <div key={grade}>
                  <label className="block text-sm font-medium mb-1.5">Grade {grade} (%)</label>
                  <input
                    type="number" step="0.01"
                    value={((form.credit_grade_rates?.[grade] ?? 0) * 100).toFixed(2)}
                    onChange={e => setForm(f => ({
                      ...f,
                      credit_grade_rates: { ...(f.credit_grade_rates ?? {}), [grade]: parseFloat(e.target.value) / 100 }
                    }))}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              ))}
            </div>
          </section>

          <div className="flex gap-3">
            <button type="submit" disabled={save.isPending}
              className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {save.isPending ? 'Saving…' : 'Save Settings'}
            </button>
            <button type="button" onClick={() => setEditing(false)}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-6 text-sm">
          <section className="space-y-3">
            <h2 className="font-semibold">Currency</h2>
            <div className="flex gap-4 py-2">
              <span className="w-48 text-muted-foreground">Platform Currency</span>
              <span className="font-medium">{(settings as Record<string, unknown> | undefined)?.currency as string ?? 'USD'}</span>
            </div>
          </section>
          <section className="space-y-3">
            <h2 className="font-semibold">Fees & Rules</h2>
            {[
              { label: 'Origination Fee', value: `${((settings?.origination_fee_percent ?? 0) * 100).toFixed(2)}%` },
              { label: 'Late Fee (flat)', value: `$${((settings?.late_fee_flat ?? 0) / 100).toFixed(2)}` },
              { label: 'Grace Period', value: `${settings?.grace_period_days} days` },
              { label: 'Default Threshold', value: `${settings?.default_threshold_missed} missed payments` },
            ].map(({ label, value }) => (
              <div key={label} className="flex gap-4 py-2 border-b last:border-0">
                <span className="w-48 text-muted-foreground">{label}</span>
                <span className="font-medium">{value}</span>
              </div>
            ))}
          </section>
          <section className="space-y-3">
            <h2 className="font-semibold">Loan Limits</h2>
            {[
              { label: 'Min Loan', value: `$${((settings?.min_loan_amount ?? 0) / 100).toLocaleString()}` },
              { label: 'Max Loan', value: `$${((settings?.max_loan_amount ?? 0) / 100).toLocaleString()}` },
              { label: 'Min Commitment', value: `$${((settings?.min_commitment_amount ?? 0) / 100).toLocaleString()}` },
            ].map(({ label, value }) => (
              <div key={label} className="flex gap-4 py-2 border-b last:border-0">
                <span className="w-48 text-muted-foreground">{label}</span>
                <span className="font-medium">{value}</span>
              </div>
            ))}
          </section>
          <section>
            <h2 className="font-semibold mb-3">Interest Rates by Grade</h2>
            <div className="grid grid-cols-5 gap-3">
              {['A', 'B', 'C', 'D', 'E'].map(g => (
                <div key={g} className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Grade {g}</p>
                  <p className="font-bold">{((settings?.credit_grade_rates?.[g] ?? 0) * 100).toFixed(2)}%</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
