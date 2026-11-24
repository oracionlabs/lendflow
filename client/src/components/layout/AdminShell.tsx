import { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { NotificationBell } from './NotificationBell'
import { LayoutDashboard, ClipboardList, FileText, Users, Settings, AlertTriangle, BarChart2, LogOut, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/shared/ThemeToggle'

const navItems = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/queue', label: 'Application Queue', icon: ClipboardList },
  { to: '/admin/loans', label: 'Loan Management', icon: FileText },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/risk', label: 'Risk Monitor', icon: AlertTriangle },
  { to: '/admin/reports', label: 'Reports', icon: BarChart2 },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
]

export function AdminShell() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [navOpen, setNavOpen] = useState(false)

  const currentPage = navItems.find(n => n.end ? location.pathname === n.to : location.pathname.startsWith(n.to))
  const initial = user?.name?.[0]?.toUpperCase() ?? '?'

  useEffect(() => {
    setNavOpen(false)
  }, [location.pathname])

  const signOutAndLeave = async () => {
    await signOut()
    navigate('/login')
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) => cn(
    'flex items-center gap-3 rounded-xl px-3.5 min-h-11 text-sm font-medium transition-all',
    isActive
      ? 'bg-primary text-white shadow-sm'
      : 'text-white/60 hover:bg-white/10 hover:text-white'
  )

  const sidebarBody = (
    <>
      <div className="px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-lime flex items-center justify-center shadow-sm">
            <span className="text-xs font-bold text-lime-foreground">L</span>
          </div>
          <span className="font-bold text-base tracking-tight text-white">LendFlow</span>
        </div>
        <p className="text-[11px] text-white/45 mt-1 ml-10 tracking-wide">Admin Portal</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={navLinkClass}>
            <Icon className="h-4 w-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-white/10 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg mb-0.5">
          <div className="h-7 w-7 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-white">{initial}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate leading-tight text-white">{user?.name}</p>
            <p className="text-[11px] text-white/40 truncate">Admin</p>
          </div>
        </div>
        <button
          onClick={signOutAndLeave}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 min-h-11 text-sm text-white/60 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </>
  )

  return (
    <div className="flex h-dvh bg-background">
      <aside className="hidden md:flex w-64 flex-shrink-0 flex-col bg-sidebar">
        {sidebarBody}
      </aside>

      {navOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(18rem,88vw)] flex-col bg-sidebar shadow-xl pt-[env(safe-area-inset-top)]">
            <button
              type="button"
              onClick={() => setNavOpen(false)}
              className="absolute right-2 top-[max(0.5rem,env(safe-area-inset-top))] flex h-11 w-11 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebarBody}
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl border-b border-border/70 flex items-center justify-between gap-2 px-2 md:px-8 pt-[env(safe-area-inset-top)] min-h-16">
          <div className="flex items-center gap-1 min-w-0">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              className="md:hidden flex h-11 w-11 items-center justify-center rounded-lg text-foreground hover:bg-muted"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h2 className="text-sm font-semibold text-foreground truncate">{currentPage?.label ?? 'Dashboard'}</h2>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <ThemeToggle />
            <NotificationBell />
            <div className="flex items-center gap-2 rounded-full border border-border bg-muted/50 px-2.5 py-1.5">
              <div className="h-5 w-5 rounded-full bg-primary/15 flex items-center justify-center">
                <span className="text-[10px] font-bold text-primary">{initial}</span>
              </div>
              <span className="text-xs font-medium hidden sm:block">{user?.name?.split(' ')[0]}</span>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
