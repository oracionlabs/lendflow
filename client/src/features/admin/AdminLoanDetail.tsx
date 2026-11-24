import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '@/lib/api'
import { formatCents, formatDate, formatPercent, useCurrency, useCurrencySymbol } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { CreditGradeBadge } from '@/components/shared/CreditGradeBadge'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { toast } from 'sonner'
import { LOAN_PURPOSE_LABELS } from '@lendflow/shared'
import type { Loan, LoanScheduleItem, LoanStatus } from '@lendflow/shared'
import { ArrowLeft } from 'lucide-react'

const GRADES = ['A', 'B', 'C', 'D', 'E'] as const
const REVIEWABLE = ['submitted', 'under_review']

interface Borrower {
  id: string
  name: string
  email: string
}

interface Profile {
  employment_status?: string
  employer?: string
  job_title?: string
  annual_income?: number
  monthly_expenses?: number
  credit_score_range?: string
  identity_verified?: boolean
  city?: string
  state?: string
  country?: string
}

interface Doc {
  id: string
  type: string
  file_name?: string
  file_url: string
  status: string
}

interface HistoryItem {
  id: string
  status: string
  amount_requested: number
  purpose?: string
  created_at: string
}

interface Commitment {
  id: string
  amount: number
  share_percent?: number
  status: string
  funded_at: string
  users?: { name: string; email: string } | { name: string; email: string }[] | null
}

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback
}

function personName(users: Commitment['users']): string {
  if (!users) return 'Lender'
  const row = Array.isArray(users) ? users[0] : users
  return row?.name ?? 'Lender'
}

export function AdminLoanDetail() {
  useCurrency()
  const symbol = useCurrencySymbol()
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [action, setAction] = useState<'approve' | 'reject' | 'disburse' | 'grade' | null>(null)
  const [approvedAmount, setApprovedAmount] = useState(0)
  const [rejectionReason, setRejectionReason] = useState('')
  const [grade, setGrade] = useState<(typeof GRADES)[number]>('C')
  const [justification, setJustification] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-loan', id],
    queryFn: async () => {
      const { data } = await api.get<{
        loan: Loan
        borrower: Borrower | null
        profile: Profile | null
        documents: Doc[]
        history: HistoryItem[]
        commitments?: Commitment[]
      }>(`/api/admin/loans/${id}`)
      return data
    },
  })

  const { data: schedule } = useQuery({
    queryKey: ['admin-loan-schedule', id],
    queryFn: async () => {
      const { data } = await api.get<{ schedule: LoanScheduleItem[] }>(`/api/loans/${id}/schedule`)
      return data.schedule
    },
    enabled: !!data,
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-loan', id] })
    qc.invalidateQueries({ queryKey: ['admin-loan-schedule', id] })
    qc.invalidateQueries({ queryKey: ['admin-loans'] })
    setAction(null)
  }

  const review = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post(`/api/admin/loans/${id}/review`, body),
    onSuccess: () => { refresh(); toast.success('Review saved') },
    onError: (err: unknown) => toast.error(errMsg(err, 'Review failed')),
  })

  const disburse = useMutation({
    mutationFn: () => api.post(`/api/admin/loans/${id}/disburse`),
    onSuccess: () => { refresh(); toast.success('Loan disbursed') },
    onError: (err: unknown) => toast.error(errMsg(err, 'Disbursement failed')),
  })

  const overrideGrade = useMutation({
    mutationFn: () => api.post(`/api/admin/loans/${id}/override-grade`, { grade, justification }),
    onSuccess: () => { refresh(); setJustification(''); toast.success('Grade updated') },
    onError: (err: unknown) => toast.error(errMsg(err, 'Could not update grade')),
  })

  if (isLoading) return <TableSkeleton />

  if (isError || !data?.loan) {
    return (
      <div className="space-y-4">
        <Link to="/admin/loans" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Loan Management
        </Link>
        <p className="font-medium">This loan could not be opened.</p>
      </div>
    )
  }

  const { loan, borrower, profile, documents, history, commitments = [] } = data
  const fmt = (cents: number) => formatCents(cents, loan.currency)
  const amount = loan.approved_amount ?? loan.amount_requested

  return (
    <div className="mx-auto max-w-4xl space-y-7">
      <Link to="/admin/loans" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Loan Management
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="page-heading break-words">{LOAN_PURPOSE_LABELS[loan.purpose] ?? loan.purpose}</h1>
          <p className="text-sm text-muted-foreground break-all">{borrower?.name ?? 'Borrower'}{borrower?.email ? ` · ${borrower.email}` : ''}</p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <StatusBadge status={loan.status} />
            <CreditGradeBadge grade={loan.admin_override_grade ?? loan.ai_credit_grade} />
          </div>
        </div>
        <div className="sm:text-right">
          <p className="text-2xl sm:text-3xl font-bold break-words tabular-nums">{fmt(amount)}</p>
          <p className="text-sm text-muted-foreground">{loan.term_months} month term</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          ['Requested', fmt(loan.amount_requested)],
          ['Funded', fmt(loan.amount_funded ?? 0)],
          ['Rate', loan.interest_rate != null ? formatPercent(loan.interest_rate) : '—'],
          ['Monthly', loan.monthly_payment != null ? fmt(loan.monthly_payment) : '—'],
          ['Lenders', String(loan.lender_count ?? 0)],
          ['Opened', formatDate(loan.created_at)],
        ].map(([label, value]) => (
          <div key={label} className="card-base p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-medium mt-0.5 break-words">{value}</p>
          </div>
        ))}
      </div>

      {loan.purpose_description && (
        <p className="text-sm text-muted-foreground">{loan.purpose_description}</p>
      )}
      {loan.rejection_reason && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {loan.rejection_reason}
        </div>
      )}

      <section className="card-base p-4 space-y-3">
        <h2 className="font-semibold">Actions</h2>
        {action === null && (
          <div className="flex flex-col sm:flex-row flex-wrap gap-2">
            {REVIEWABLE.includes(loan.status) && (
              <>
                <button
                  onClick={() => { setApprovedAmount(loan.amount_requested); setAction('approve') }}
                  className="min-h-11 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Approve
                </button>
                <button
                  onClick={() => setAction('reject')}
                  className="min-h-11 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700"
                >
                  Reject
                </button>
              </>
            )}
            {loan.status === 'fully_funded' && (
              <button
                onClick={() => setAction('disburse')}
                className="min-h-11 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Disburse
              </button>
            )}
            <button
              onClick={() => { setGrade(loan.admin_override_grade ?? loan.ai_credit_grade ?? 'C'); setAction('grade') }}
              className="min-h-11 rounded-lg border px-4 text-sm font-medium hover:bg-accent"
            >
              Change grade
            </button>
          </div>
        )}

        {action === 'approve' && (
          <div className="space-y-3">
            <label className="block text-sm font-medium">Approved amount</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">{symbol}</span>
              <input
                type="number"
                value={approvedAmount / 100}
                onChange={e => setApprovedAmount(Math.round(parseFloat(e.target.value || '0') * 100))}
                className="w-full rounded-md border bg-background pl-7 pr-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <button onClick={() => setAction(null)} className="min-h-11 flex-1 rounded-lg border text-sm hover:bg-muted">Cancel</button>
              <button
                disabled={review.isPending}
                onClick={() => review.mutate({ action: 'approve', approved_amount: approvedAmount || loan.amount_requested })}
                className="min-h-11 flex-1 rounded-lg bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {review.isPending ? 'Saving…' : 'Confirm approval'}
              </button>
            </div>
          </div>
        )}

        {action === 'reject' && (
          <div className="space-y-3">
            <label className="block text-sm font-medium">Reason shown to the borrower</label>
            <textarea
              value={rejectionReason}
              onChange={e => setRejectionReason(e.target.value)}
              rows={3}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <button onClick={() => setAction(null)} className="min-h-11 flex-1 rounded-lg border text-sm hover:bg-muted">Cancel</button>
              <button
                disabled={review.isPending}
                onClick={() => review.mutate({ action: 'reject', rejection_reason: rejectionReason || 'Application did not meet lending criteria' })}
                className="min-h-11 flex-1 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {review.isPending ? 'Saving…' : 'Confirm rejection'}
              </button>
            </div>
          </div>
        )}

        {action === 'disburse' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">This releases funds to the borrower and starts the repayment schedule.</p>
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <button onClick={() => setAction(null)} className="min-h-11 flex-1 rounded-lg border text-sm hover:bg-muted">Cancel</button>
              <button
                disabled={disburse.isPending}
                onClick={() => disburse.mutate()}
                className="min-h-11 flex-1 rounded-lg bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {disburse.isPending ? 'Processing…' : 'Confirm disbursement'}
              </button>
            </div>
          </div>
        )}

        {action === 'grade' && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {GRADES.map(g => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGrade(g)}
                  className={`min-h-11 min-w-11 rounded-lg border text-sm font-semibold ${grade === g ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
                >
                  {g}
                </button>
              ))}
            </div>
            <textarea
              value={justification}
              onChange={e => setJustification(e.target.value)}
              rows={3}
              placeholder="Why this grade (at least 10 characters)"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <button onClick={() => setAction(null)} className="min-h-11 flex-1 rounded-lg border text-sm hover:bg-muted">Cancel</button>
              <button
                disabled={overrideGrade.isPending || justification.trim().length < 10}
                onClick={() => overrideGrade.mutate()}
                className="min-h-11 flex-1 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {overrideGrade.isPending ? 'Saving…' : 'Save grade'}
              </button>
            </div>
          </div>
        )}
      </section>

      {profile && (
        <section className="space-y-2">
          <h2 className="font-semibold">Borrower</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-xs text-muted-foreground">Employment</p><p className="capitalize">{profile.employment_status?.replace('_', ' ') ?? '—'}</p></div>
            <div><p className="text-xs text-muted-foreground">Job</p><p>{[profile.job_title, profile.employer].filter(Boolean).join(' · ') || '—'}</p></div>
            <div><p className="text-xs text-muted-foreground">Income</p><p>{profile.annual_income ? fmt(profile.annual_income) : '—'}</p></div>
            <div><p className="text-xs text-muted-foreground">Monthly expenses</p><p>{profile.monthly_expenses ? fmt(profile.monthly_expenses) : '—'}</p></div>
            <div><p className="text-xs text-muted-foreground">Credit</p><p className="capitalize">{profile.credit_score_range?.replace('_', ' ') ?? '—'}</p></div>
            <div><p className="text-xs text-muted-foreground">Identity</p><p>{profile.identity_verified ? 'Verified' : 'Not verified'}</p></div>
            <div className="col-span-2"><p className="text-xs text-muted-foreground">Location</p><p>{[profile.city, profile.state, profile.country].filter(Boolean).join(', ') || '—'}</p></div>
          </div>
        </section>
      )}

      {loan.ai_reasoning && (
        <section className="rounded-lg bg-muted/40 p-4 space-y-2">
          <p className="text-sm font-medium">Credit assessment</p>
          <p className="text-sm">{loan.ai_reasoning}</p>
          {loan.ai_risk_factors?.map(factor => (
            <p key={factor} className="text-xs text-muted-foreground">{factor}</p>
          ))}
        </section>
      )}

      {commitments.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Lenders</h2>
          <div className="card-base divide-y divide-border">
            {commitments.map(row => (
              <div key={row.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium truncate">{personName(row.users)}</p>
                  <p className="text-xs text-muted-foreground capitalize">{row.status.replace('_', ' ')}</p>
                </div>
                <p className="font-mono shrink-0">{fmt(row.amount)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {!!documents.length && (
        <section className="space-y-2">
          <h2 className="font-semibold">Documents</h2>
          <div className="card-base divide-y divide-border">
            {documents.map(doc => (
              <div key={doc.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium capitalize truncate">{doc.type.replaceAll('_', ' ')}</p>
                  <p className="text-xs text-muted-foreground truncate">{doc.file_name ?? doc.status}</p>
                </div>
                {doc.file_url.startsWith('http') && (
                  <a href={doc.file_url} target="_blank" rel="noreferrer" className="shrink-0 text-sm font-medium text-primary hover:underline">
                    Open
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {!!schedule?.length && (
        <section className="space-y-2">
          <h2 className="font-semibold">Schedule</h2>
          <div className="card-base divide-y divide-border">
            {schedule.map(row => (
              <div key={row.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div>
                  <p className="font-medium">#{row.installment_number} · {formatDate(row.due_date)}</p>
                  <p className="text-xs text-muted-foreground capitalize">{row.status}</p>
                </div>
                <p className="font-mono">{fmt(row.total_due)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {!!history.length && (
        <section className="space-y-2">
          <h2 className="font-semibold">Other loans</h2>
          <div className="card-base divide-y divide-border">
            {history.map(item => (
              <Link key={item.id} to={`/admin/loans/${item.id}`} className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-muted/40">
                <div className="min-w-0">
                  <p className="font-medium truncate">{LOAN_PURPOSE_LABELS[item.purpose as Loan['purpose']] ?? item.purpose ?? 'Loan'}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(item.created_at)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono">{fmt(item.amount_requested)}</span>
                  <StatusBadge status={item.status as LoanStatus} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
