import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import api from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { toast } from 'sonner'
import type { User } from '@lendflow/shared'

export function UserManagement() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', search, roleFilter],
    queryFn: async () => {
      const params: Record<string, string> = { limit: '50' }
      if (search) params.search = search
      if (roleFilter) params.role = roleFilter
      const { data } = await api.get<{ users: User[]; total: number }>('/api/admin/users', { params })
      return data
    },
  })

  const updateUser = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.put(`/api/admin/users/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      toast.success('User updated')
    },
    onError: () => toast.error('Update failed'),
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">User Management</h1>

      <div className="flex gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name or email..."
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">All Roles</option>
          <option value="borrower">Borrowers</option>
          <option value="lender">Lenders</option>
          <option value="admin">Admins</option>
        </select>
      </div>

      {isLoading ? <TableSkeleton /> : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Email</th>
                <th className="text-center p-3 font-medium">Role</th>
                <th className="text-center p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Joined</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {data?.users.map(user => (
                <tr key={user.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3 font-medium">{user.name}</td>
                  <td className="p-3 text-muted-foreground">{user.email}</td>
                  <td className="p-3 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      user.role === 'admin' ? 'bg-purple-100 text-purple-700'
                      : user.role === 'lender' ? 'bg-blue-100 text-blue-700'
                      : 'bg-green-100 text-green-700'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      user.status === 'active' ? 'bg-green-100 text-green-700'
                      : user.status === 'suspended' ? 'bg-red-100 text-red-700'
                      : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">{formatDate(user.created_at)}</td>
                  <td className="p-3">
                    {user.role !== 'admin' && (
                      <select
                        value={user.status}
                        onChange={e => updateUser.mutate({ id: user.id, status: e.target.value })}
                        className="rounded border text-xs px-2 py-1 bg-background focus-visible:outline-none"
                      >
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                        <option value="pending_verification">Pending</option>
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 py-2 border-t text-xs text-muted-foreground">{data?.total ?? 0} users</div>
        </div>
      )}
    </div>
  )
}
