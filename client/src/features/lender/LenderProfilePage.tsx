import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import api from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { formatDate } from '@/lib/utils'
import { CardSkeleton } from '@/components/shared/LoadingSkeleton'
import type { LenderProfile } from '@lendflow/shared'
import { BarChart2, FileText, ChevronRight } from 'lucide-react'

type LenderType = 'individual' | 'institutional'
type RiskTolerance = 'conservative' | 'moderate' | 'aggressive'

export function LenderProfilePage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const { data: profile, isLoading } = useQuery({
    queryKey: ['lender-profile'],
    queryFn: async () => {
      const { data } = await api.get<{ profile: LenderProfile }>('/api/lender/profile')
      return data.profile
    },
  })

  const [lenderType, setLenderType] = useState<LenderType | ''>('')
  const [riskTolerance, setRiskTolerance] = useState<RiskTolerance | ''>('')

  const updateMutation = useMutation({
    mutationFn: async (updates: { lender_type?: LenderType; risk_tolerance?: RiskTolerance }) => {
      const { data } = await api.put<{ profile: LenderProfile }>('/api/lender/profile', updates)
      return data.profile
    },
    onSuccess: () => {
      toast.success('Profile updated')
      queryClient.invalidateQueries({ queryKey: ['lender-profile'] })
    },
    onError: () => toast.error('Failed to update profile'),
  })

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-2xl">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    )
  }

  const currentType = lenderType || profile?.lender_type || ''
  const currentTolerance = riskTolerance || profile?.risk_tolerance || ''

  function handleSave() {
    const updates: { lender_type?: LenderType; risk_tolerance?: RiskTolerance } = {}
    if (currentType) updates.lender_type = currentType as LenderType
    if (currentTolerance) updates.risk_tolerance = currentTolerance as RiskTolerance
    updateMutation.mutate(updates)
  }

  const isDirty =
    (lenderType && lenderType !== profile?.lender_type) ||
    (riskTolerance && riskTolerance !== profile?.risk_tolerance)

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Lender Profile</h1>
        <p className="text-muted-foreground mt-1">Manage your lending preferences</p>
      </div>

      {/* Account info */}
      <section className="card-base p-4 md:p-6 space-y-4">
        <h2 className="font-semibold">Account Information</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground text-xs mb-1">Full Name</p>
            <p className="font-medium">{user?.name}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs mb-1">Email</p>
            <p className="font-medium">{user?.email}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs mb-1">Member Since</p>
            <p className="font-medium">{user?.created_at ? formatDate(user.created_at) : '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs mb-1">Verification</p>
            <div className="flex items-center gap-1.5">
              <div className={`h-2 w-2 rounded-full ${profile?.identity_verified ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <span className="font-medium">{profile?.identity_verified ? 'Verified' : 'Pending'}</span>
            </div>
          </div>
          <div>
            <p className="text-muted-foreground text-xs mb-1">Accredited Investor</p>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              profile?.accredited ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {profile?.accredited ? 'Yes' : 'No'}
            </span>
          </div>
        </div>
      </section>

      {/* Lending preferences */}
      <section className="card-base p-4 md:p-6 space-y-5">
        <h2 className="font-semibold">Lending Preferences</h2>

        <div>
          <label className="block text-sm font-medium mb-2">Lender Type</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {([
              { value: 'individual', label: 'Individual', desc: 'Personal lending from your own funds' },
              { value: 'institutional', label: 'Institutional', desc: 'Lending on behalf of an organization or fund' },
            ] as { value: LenderType; label: string; desc: string }[]).map(opt => (
              <button
                key={opt.value}
                onClick={() => setLenderType(opt.value === currentType ? '' : opt.value)}
                className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                  currentType === opt.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
                }`}
              >
                <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                  currentType === opt.value ? 'border-primary' : 'border-muted-foreground/40'
                }`}>
                  {currentType === opt.value && <div className="h-2 w-2 rounded-full bg-primary" />}
                </div>
                <div>
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Risk Tolerance</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {([
              { value: 'conservative', label: 'Conservative', desc: 'Grade A–B only, lower yield' },
              { value: 'moderate', label: 'Moderate', desc: 'Grade A–C, balanced' },
              { value: 'aggressive', label: 'Aggressive', desc: 'All grades, higher yield' },
            ] as { value: RiskTolerance; label: string; desc: string }[]).map(opt => (
              <button
                key={opt.value}
                onClick={() => setRiskTolerance(opt.value === currentTolerance ? '' : opt.value)}
                className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                  currentTolerance === opt.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
                }`}
              >
                <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                  currentTolerance === opt.value ? 'border-primary' : 'border-muted-foreground/40'
                }`}>
                  {currentTolerance === opt.value && <div className="h-2 w-2 rounded-full bg-primary" />}
                </div>
                <div>
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!isDirty || updateMutation.isPending}
          className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </section>

      {/* Quick links */}
      <div className="space-y-2">
        <Link to="/lender/listing"
          className="flex items-center justify-between card-base p-4 hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-primary" />
            <span className="font-medium text-sm">My Listing</span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
        <Link to="/lender/reports"
          className="flex items-center justify-between card-base p-4 hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-3">
            <BarChart2 className="h-5 w-5 text-primary" />
            <span className="font-medium text-sm">Reports & Analytics</span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      </div>

      {/* Document status */}
      <section className="card-base p-4 md:p-6 space-y-4">
        <h2 className="font-semibold">Document Verification</h2>
        <p className="text-sm text-muted-foreground">
          Document uploads are reviewed by our team within 1–2 business days.
        </p>
        <div className="space-y-2">
          {[
            { label: 'Government-issued ID', required: true },
            { label: 'Proof of Funds', required: true },
          ].map(doc => (
            <div key={doc.label} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">{doc.label}</p>
                {doc.required && <p className="text-xs text-muted-foreground">Required for verification</p>}
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                profile?.identity_verified ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {profile?.identity_verified ? 'Verified' : 'Pending'}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
