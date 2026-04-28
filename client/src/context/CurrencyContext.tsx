import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { setCurrency } from '@/lib/utils'

export function CurrencyLoader() {
  const { data } = useQuery({
    queryKey: ['platform-settings-public'],
    queryFn: async () => {
      const { data } = await api.get<{ settings: { currency: string } }>('/api/admin/settings')
      return data.settings
    },
    staleTime: Infinity,
    retry: false,
  })

  useEffect(() => {
    if (data?.currency) setCurrency(data.currency)
  }, [data?.currency])

  return null
}
