import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { NotificationBell } from './NotificationBell'
import { LayoutDashboard, Search, User, BarChart2, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/lender', label: 'Portfolio', icon: LayoutDashboard, end: true },
  { to: '/lender/opportunities', label: 'Opportunities', icon: Search },
  { to: '/lender/reports', label: 'Reports', icon: BarChart2 },
  { to: '/lender/profile', label: 'Profile', icon: User },
]

export function LenderShell() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const currentPage = navItems.find(n => n.end ? location.pathname === n.to : location.pathname.startsWith(n.to))

  return (
    <div className="flex h-screen bg-background">
      <aside className="w-56 flex-shrink-0 flex flex-col bg-white border-r border-border shadow-sm">
        <div className="px-5 py-5 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-xs font-bold text-white">L</span>
            </div>
            <span className="font-bold text-base tracking-tight">LendFlow</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1 ml-9">Capital Partner Portal</p>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-0.5">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                isActive
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-border">
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg mb-0.5">
            <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-primary">{user?.name?.[0]?.toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate leading-tight">{user?.name}</p>
              <p className="text-[11px] text-muted-foreground truncate">Lender</p>
            </div>
          </div>
          <button
            onClick={async () => { await signOut(); navigate('/login') }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-border flex items-center justify-between px-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">{currentPage?.label ?? 'Portfolio'}</h2>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <div className="flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1.5">
              <div className="h-5 w-5 rounded-full bg-primary/15 flex items-center justify-center">
                <span className="text-[10px] font-bold text-primary">{user?.name?.[0]?.toUpperCase()}</span>
              </div>
              <span className="text-xs font-medium">{user?.name?.split(' ')[0]}</span>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
