import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import api from '@/lib/api'
import { formatCents, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import { LOAN_PURPOSE_LABELS } from '@lendflow/shared'
import { EmptyState } from '@/components/shared/EmptyState'
import { Users, CheckCircle2, XCircle, ChevronDown, ChevronUp } from 'lucide-react'

interface LoanRequest {
  id: string
  amount_requested: number
  purpose: string
  purpose_description: string | null
  term_months: number
  status: string
  created_at: string
  users: { name: string; email: string; phone: string | null } | null
}

const STATUS_STYLES: Record<string, string> = {
  submitted:    'bg-amber-100 text-amber-700',
  under_review: 'bg-blue-100 text-blue-700',
  approved:     'bg-emerald-100 text-emerald-700',
  rejected:     'bg-red-100 text-red-700',
}

export function LoanRequests() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectingId, setRejectingId] = useState<string | null>(null)

  const { data: requests, isLoading } = useQuery({
    queryKey: ['lender-requests'],
    queryFn: async () => {
      const { data } = await api.get<{ requests: LoanRequest[] }>('/api/listings/me/requests')
      return data.requests
    },
  })

  const accept = useMutation({
    mutationFn: async (loanId: string) => {
      await api.post(`/api/listings/me/requests/${loanId}/accept`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lender-requests'] })
      toast.success('Request accepted — loan is now active')
    },
    onError: () => toast.error('Failed to accept request'),
  })

  const reject = useMutation({
    mutationFn: async ({ loanId, reason }: { loanId: string; reason: string }) => {
      await api.post(`/api/listings/me/requests/${loanId}/reject`, { reason })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lender-requests'] })
      setRejectingId(null)
      setRejectReason('')
      toast.success('Request declined')
    },
    onError: () => toast.error('Failed to decline request'),
  })

  const pending = requests?.filter(r => ['submitted', 'under_review'].includes(r.status)) ?? []
  const decided = requests?.filter(r => ['approved', 'rejected'].includes(r.status)) ?? []

  if (isLoading) return (
    <div className="space-y-3 max-w-lg mx-auto">
      {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}
    </div>
  )

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold">Loan Requests</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {pending.length > 0 ? `${pending.length} pending review` : 'No pending requests'}
        </p>
      </div>

      {!requests?.length ? (
        <EmptyState
          icon={Users}
          title="No requests yet"
          description="When borrowers apply to your listing, their requests will appear here."
        />
      ) : (
        <>
          {/* Pending */}
          {pending.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pending</h2>
              {pending.map(req => (
                <RequestCard
                  key={req.id}
                  req={req}
                  expanded={expanded === req.id}
                  onToggle={() => setExpanded(e => e === req.id ? null : req.id)}
                  onAccept={() => accept.mutate(req.id)}
                  acceptPending={accept.isPending}
                  rejectingId={rejectingId}
                  rejectReason={rejectReason}
                  onStartReject={() => setRejectingId(req.id)}
                  onCancelReject={() => { setRejectingId(null); setRejectReason('') }}
                  onRejectReasonChange={setRejectReason}
                  onConfirmReject={() => reject.mutate({ loanId: req.id, reason: rejectReason })}
                  rejectPending={reject.isPending}
                />
              ))}
            </section>
          )}

          {/* Decided */}
          {decided.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Previous</h2>
              {decided.map(req => (
                <RequestCard
                  key={req.id}
                  req={req}
                  expanded={expanded === req.id}
                  onToggle={() => setExpanded(e => e === req.id ? null : req.id)}
                  decided
                />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  )
}

function RequestCard({ req, expanded, onToggle, onAccept, acceptPending, rejectingId, rejectReason, onStartReject, onCancelReject, onRejectReasonChange, onConfirmReject, rejectPending, decided }: {
  req: LoanRequest
  expanded: boolean
  onToggle: () => void
  onAccept?: () => void
  acceptPending?: boolean
  rejectingId?: string | null
  rejectReason?: string
  onStartReject?: () => void
  onCancelReject?: () => void
  onRejectReasonChange?: (v: string) => void
  onConfirmReject?: () => void
  rejectPending?: boolean
  decided?: boolean
}) {
  return (
    <div className="card-base overflow-hidden">
      <button onClick={onToggle} className="w-full text-left p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm">{req.users?.name ?? 'Unknown'}</p>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[req.status] ?? 'bg-muted text-muted-foreground'}`}>
                {req.status.replace('_', ' ')}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {LOAN_PURPOSE_LABELS[req.purpose] ?? req.purpose} · {formatDate(req.created_at)}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="font-bold text-base">{formatCents(req.amount_requested)}</p>
            <p className="text-xs text-muted-foreground">{req.term_months}mo</p>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
          {req.users?.email && (
            <div>
              <p className="text-xs text-muted-foreground">Contact</p>
              <p className="text-sm">{req.users.email}{req.users.phone ? ` · ${req.users.phone}` : ''}</p>
            </div>
          )}
          {req.purpose_description && (
            <div>
              <p className="text-xs text-muted-foreground">Details</p>
              <p className="text-sm">{req.purpose_description}</p>
            </div>
          )}

          {!decided && (
            rejectingId === req.id ? (
              <div className="space-y-2">
                <textarea
                  value={rejectReason}
                  onChange={e => onRejectReasonChange?.(e.target.value)}
                  placeholder="Reason for declining (optional)"
                  rows={2}
                  className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-none"
                />
                <div className="flex gap-2">
                  <button onClick={onConfirmReject} disabled={rejectPending}
                    className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-semibold text-white hover:bg-destructive/90 disabled:opacity-50">
                    Confirm decline
                  </button>
                  <button onClick={onCancelReject} className="flex-1 rounded-xl border py-2.5 text-sm hover:bg-muted">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button onClick={onAccept} disabled={acceptPending}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50">
                  <CheckCircle2 className="h-4 w-4" /> Accept
                </button>
                <button onClick={onStartReject}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-medium hover:bg-muted">
                  <XCircle className="h-4 w-4" /> Decline
                </button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
