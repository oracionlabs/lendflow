import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { NotificationBell } from './NotificationBell'
import { Home, Search, FileText, User, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
const navItems = [
  { to: '/borrower/lenders', label: 'Find', icon: Search },
  { to: '/borrower/loans', label: 'My loans', icon: FileText },
  { to: '/borrower', label: 'Home', icon: Home, end: true },
  { to: '/borrower/profile', label: 'Profile', icon: User },
]

export function BorrowerShell() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const screen = pathname.startsWith('/borrower/lenders') ? 'Find'
    : pathname.startsWith('/borrower/loans') ? 'My loans'
    : pathname.startsWith('/borrower/profile') ? 'Profile'
    : 'Lendflow'
  const initial = user?.name?.[0]?.toUpperCase() ?? '?'

  return (
    <div className="flex h-dvh bg-background">
      {/* Desktop sidebar — dark */}
      <aside className="hidden md:flex w-64 flex-shrink-0 flex-col border-r border-border bg-background">
        <div className="px-6 py-8">
          <p className="brand-caps text-foreground">Lendflow</p>
        </div>
        <nav className="flex-1 px-3 py-2 space-y-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => cn(
                'flex min-h-11 items-center gap-3 px-3.5 text-sm transition-colors',
                isActive ? 'font-semibold text-accent' : 'font-normal text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.4} />{label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border px-3 py-4">
          <div className="mb-0.5 flex items-center gap-2.5 px-3 py-2">
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-foreground">
              <span className="font-serif text-xs text-foreground">{initial}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-tight">{user?.name}</p>
              <p className="text-[11px] text-muted-foreground">Borrower</p>
            </div>
          </div>
          <button onClick={async () => { await signOut(); navigate('/login') }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
            <LogOut className="h-4 w-4" strokeWidth={1.4} />Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-30 grid grid-cols-[44px_1fr_44px] items-center bg-background px-3.5 pt-[env(safe-area-inset-top)]">
          <button
            onClick={async () => { await signOut(); navigate('/login') }}
            aria-label="Sign out"
            className="flex h-11 w-11 items-center justify-center text-foreground md:hidden"
          >
            <LogOut className="h-5 w-5" strokeWidth={1.4} />
          </button>
          <p className="brand-caps text-center text-foreground">{screen}</p>
          <div className="flex justify-end">
            <NotificationBell />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-24 md:p-8 md:pb-10">
          <Outlet />
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background px-2.5 pb-[max(10px,env(safe-area-inset-bottom))] pt-1 md:hidden">
          <div className="flex">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end}
                className={({ isActive }) => cn(
                  'flex min-h-[54px] flex-1 flex-col items-center justify-center gap-[5px] text-[11.5px]',
                  isActive ? 'font-semibold text-accent' : 'font-normal text-muted-foreground'
                )}
              >
                <Icon className="h-[19px] w-[19px]" strokeWidth={1.4} />
                <span className="leading-none">{label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  )
}
