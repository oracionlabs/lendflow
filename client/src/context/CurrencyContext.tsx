import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { setCurrency } from '@/lib/utils'

export function CurrencyLoader() {
  const { data } = useQuery({
    queryKey: ['platform-settings-public'],
    queryFn: async () => {
      const { data } = await api.get<{ currency: string }>('/api/platform-currency')
      return data
    },
    staleTime: 60_000,
  })

  useEffect(() => {
    if (data?.currency) setCurrency(data.currency)
  }, [data?.currency])

  return null
}
