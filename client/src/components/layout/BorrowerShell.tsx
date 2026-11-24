import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { NotificationBell } from './NotificationBell'
import { Home, Search, FileText, User, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/shared/ThemeToggle'

const navItems = [
  { to: '/borrower', label: 'Home', icon: Home, end: true },
  { to: '/borrower/lenders', label: 'Find Lender', icon: Search },
  { to: '/borrower/loans', label: 'My Loans', icon: FileText },
  { to: '/borrower/profile', label: 'Profile', icon: User },
]

export function BorrowerShell() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const initial = user?.name?.[0]?.toUpperCase() ?? '?'

  return (
    <div className="flex h-dvh bg-background">
      {/* Desktop sidebar — dark */}
      <aside className="hidden md:flex w-64 flex-shrink-0 flex-col bg-sidebar">
        <div className="px-6 py-6">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-lime flex items-center justify-center shadow-sm">
              <span className="text-xs font-bold text-lime-foreground">L</span>
            </div>
            <span className="font-bold text-base tracking-tight text-white">LendFlow</span>
          </div>
          <p className="text-[11px] text-white/45 mt-1 ml-10 tracking-wide">Borrower Portal</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => cn(
                'flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium transition-all',
                isActive
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-white/60 hover:bg-white/10 hover:text-white'
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />{label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-white/10">
          <div className="flex items-center gap-2.5 px-3 py-2 mb-0.5">
            <div className="h-7 w-7 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-white">{initial}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate leading-tight text-white">{user?.name}</p>
              <p className="text-[11px] text-white/40">Borrower</p>
            </div>
          </div>
          <button onClick={async () => { await signOut(); navigate('/login') }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-white/60 hover:bg-white/10 hover:text-white transition-colors">
            <LogOut className="h-4 w-4" />Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-background/85 backdrop-blur-xl border-b border-border/70 flex items-center justify-between gap-2 px-3 md:px-8 sticky top-0 z-30 pt-[env(safe-area-inset-top)] min-h-16">
          <div className="flex items-center gap-2 md:hidden min-w-0">
            <div className="h-6 w-6 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <span className="text-[10px] font-bold text-white">L</span>
            </div>
            <span className="font-bold text-sm truncate">LendFlow</span>
          </div>
          <div className="hidden md:block text-sm font-semibold">Borrower Portal</div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={async () => { await signOut(); navigate('/login') }}
              aria-label="Sign out"
              className="md:hidden flex h-11 w-11 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-destructive transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
            <ThemeToggle />
            <NotificationBell />
            <div className="flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1.5">
              <div className="h-4 w-4 rounded-full bg-primary/15 flex items-center justify-center">
                <span className="text-[9px] font-bold text-primary">{initial}</span>
              </div>
              <span className="text-xs font-medium hidden sm:block">{user?.name?.split(' ')[0]}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 pb-24 md:p-8 md:pb-10">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border/70 bg-background/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
          <div className="flex">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end}
                className={({ isActive }) => cn(
                  'flex-1 flex flex-col items-center justify-center gap-0.5 min-h-14 px-1 text-[11px] font-medium transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="leading-none">{label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  )
}
