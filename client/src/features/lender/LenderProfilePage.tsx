import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { formatDate } from '@/lib/utils'
import { CardSkeleton } from '@/components/shared/LoadingSkeleton'
import type { LenderProfile } from '@lendflow/shared'

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
      <section className="card-base p-6 space-y-4">
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
      <section className="card-base p-6 space-y-5">
        <h2 className="font-semibold">Lending Preferences</h2>

        <div>
          <label className="block text-sm font-medium mb-2">Lender Type</label>
          <div className="grid grid-cols-2 gap-3">
            {(['individual', 'institutional'] as LenderType[]).map(type => (
              <button
                key={type}
                onClick={() => setLenderType(type === currentType ? '' : type)}
                className={`rounded-lg border p-4 text-left transition-colors ${
                  currentType === type
                    ? 'border-primary bg-primary/5'
                    : 'hover:border-muted-foreground/30'
                }`}
              >
                <p className="font-medium capitalize">{type}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {type === 'individual' ? 'Personal lending from your own funds' : 'Lending on behalf of an organization or fund'}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Risk Tolerance</label>
          <div className="grid grid-cols-3 gap-3">
            {([
              { value: 'conservative', label: 'Conservative', desc: 'Grade A–B only, lower yield' },
              { value: 'moderate', label: 'Moderate', desc: 'Grade A–C, balanced approach' },
              { value: 'aggressive', label: 'Aggressive', desc: 'All grades, higher yield potential' },
            ] as { value: RiskTolerance; label: string; desc: string }[]).map(opt => (
              <button
                key={opt.value}
                onClick={() => setRiskTolerance(opt.value === currentTolerance ? '' : opt.value)}
                className={`rounded-lg border p-4 text-left transition-colors ${
                  currentTolerance === opt.value
                    ? 'border-primary bg-primary/5'
                    : 'hover:border-muted-foreground/30'
                }`}
              >
                <p className="font-medium">{opt.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={handleSave}
            disabled={!isDirty || updateMutation.isPending}
            className="rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </section>

      {/* Document status */}
      <section className="card-base p-6 space-y-4">
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
