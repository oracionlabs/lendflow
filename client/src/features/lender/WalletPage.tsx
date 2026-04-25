import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import api from '@/lib/api'
import { formatCents, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import { CardSkeleton, TableSkeleton } from '@/components/shared/LoadingSkeleton'
import type { Wallet, Transaction } from '@lendflow/shared'

const TX_LABELS: Record<string, string> = {
  deposit: 'Capital Added',
  withdrawal: 'Capital Recalled',
  funding_commitment: 'Loan Funded',
  yield_distribution: 'Yield Received',
  disbursement: 'Disbursement',
  repayment: 'Repayment',
  origination_fee: 'Origination Fee',
  late_fee: 'Late Fee',
  refund: 'Refund',
}

export function WalletPage() {
  const qc = useQueryClient()
  const [addAmount, setAddAmount] = useState(100000)
  const [recallAmount, setRecallAmount] = useState(0)
  const [addOpen, setAddOpen] = useState(false)
  const [recallOpen, setRecallOpen] = useState(false)

  const { data: wallet, isLoading: walletLoading } = useQuery({
    queryKey: ['wallet'],
    queryFn: async () => {
      const { data } = await api.get<{ wallet: Wallet }>('/api/wallet')
      return data.wallet
    },
  })

  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      const { data } = await api.get<{ transactions: Transaction[]; total: number }>('/api/wallet/transactions')
      return data
    },
  })

  const addCapital = useMutation({
    mutationFn: (amount: number) => api.post('/api/wallet/deposit', { amount }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      setAddOpen(false)
      toast.success('Capital added to your account')
    },
    onError: () => toast.error('Failed to add capital'),
  })

  const recallCapital = useMutation({
    mutationFn: (amount: number) => api.post('/api/wallet/withdraw', { amount }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      setRecallOpen(false)
      toast.success('Capital recalled successfully')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to recall capital'
      toast.error(msg)
    },
  })

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-2xl font-bold">Wallet</h1>

      {walletLoading ? (
        <div className="grid grid-cols-2 gap-4"><CardSkeleton /><CardSkeleton /></div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: 'Available', value: wallet?.available_balance ?? 0, sub: 'ready to deploy', accent: true },
            { label: 'Committed', value: wallet?.committed_balance ?? 0, sub: 'locked in active loans' },
            { label: 'Pending', value: wallet?.pending_balance ?? 0, sub: 'processing' },
            { label: 'Total Yield Earned', value: wallet?.total_yield_earned ?? 0, sub: 'lifetime interest income', green: true },
          ].map(({ label, value, sub, accent, green }) => (
            <div key={label} className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-xl font-bold mt-1 ${green ? 'text-primary' : ''}`}>{formatCents(value)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => setAddOpen(true)}
          className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors shadow-sm"
        >
          Add Capital
        </button>
        <button
          onClick={() => setRecallOpen(true)}
          disabled={(wallet?.available_balance ?? 0) === 0}
          className="rounded-lg border px-5 py-2 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
        >
          Recall Capital
        </button>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">Transaction History</h2>
        {txLoading ? <TableSkeleton /> : (
          <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="text-left p-3 font-medium text-xs text-muted-foreground">Date</th>
                  <th className="text-left p-3 font-medium text-xs text-muted-foreground">Type</th>
                  <th className="text-left p-3 font-medium text-xs text-muted-foreground">Description</th>
                  <th className="text-right p-3 font-medium text-xs text-muted-foreground">Amount</th>
                  <th className="text-right p-3 font-medium text-xs text-muted-foreground">Balance</th>
                </tr>
              </thead>
              <tbody>
                {txData?.transactions.map(tx => (
                  <tr key={tx.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="p-3 text-xs text-muted-foreground">{formatDate(tx.created_at)}</td>
                    <td className="p-3 text-xs">{TX_LABELS[tx.type] ?? tx.type.replace(/_/g, ' ')}</td>
                    <td className="p-3 text-xs text-muted-foreground">{tx.description}</td>
                    <td className={`p-3 text-right font-mono text-xs ${tx.amount > 0 ? 'text-primary' : 'text-destructive'}`}>
                      {tx.amount > 0 ? '+' : ''}{formatCents(tx.amount)}
                    </td>
                    <td className="p-3 text-right font-mono text-xs">{formatCents(tx.balance_after)}</td>
                  </tr>
                ))}
                {!txData?.transactions.length && (
                  <tr><td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">No transactions yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Add Capital modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl bg-background p-6 space-y-4 m-4 shadow-xl">
            <div>
              <h3 className="font-bold text-lg">Add Capital</h3>
              <p className="text-sm text-muted-foreground mt-1">Allocate funds to your lending account for deployment into loan opportunities.</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">$</span>
                <input
                  type="number"
                  value={addAmount / 100}
                  onChange={e => setAddAmount(Math.round(parseFloat(e.target.value || '0') * 100))}
                  min={1}
                  className="w-full rounded-lg border bg-background pl-7 pr-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => addCapital.mutate(addAmount)}
                disabled={addCapital.isPending || addAmount <= 0}
                className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {addCapital.isPending ? 'Processing…' : `Add ${formatCents(addAmount)}`}
              </button>
              <button onClick={() => setAddOpen(false)} className="flex-1 rounded-lg border py-2 text-sm font-medium hover:bg-accent">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recall Capital modal */}
      {recallOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl bg-background p-6 space-y-4 m-4 shadow-xl">
            <div>
              <h3 className="font-bold text-lg">Recall Capital</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Available to recall: <span className="font-semibold">{formatCents(wallet?.available_balance ?? 0)}</span>
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">$</span>
                <input
                  type="number"
                  value={recallAmount / 100}
                  onChange={e => setRecallAmount(Math.round(parseFloat(e.target.value || '0') * 100))}
                  min={1}
                  max={(wallet?.available_balance ?? 0) / 100}
                  className="w-full rounded-lg border bg-background pl-7 pr-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => recallCapital.mutate(recallAmount)}
                disabled={recallCapital.isPending || recallAmount <= 0 || recallAmount > (wallet?.available_balance ?? 0)}
                className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {recallCapital.isPending ? 'Processing…' : `Recall ${formatCents(recallAmount)}`}
              </button>
              <button onClick={() => setRecallOpen(false)} className="flex-1 rounded-lg border py-2 text-sm font-medium hover:bg-accent">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
