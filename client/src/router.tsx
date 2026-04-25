import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { BorrowerShell } from '@/components/layout/BorrowerShell'
import { LenderShell } from '@/components/layout/LenderShell'
import { AdminShell } from '@/components/layout/AdminShell'

import { LoginPage } from '@/features/auth/LoginPage'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { AuthCallbackPage } from '@/features/auth/AuthCallbackPage'

import { BorrowerDashboard } from '@/features/borrower/BorrowerDashboard'
import { LoanApplicationForm } from '@/features/borrower/LoanApplicationForm'
import { ActiveLoanDetail } from '@/features/borrower/ActiveLoanDetail'
import { BorrowerProfilePage } from '@/features/borrower/BorrowerProfile'
import { BorrowerReports } from '@/features/borrower/BorrowerReports'

import { PortfolioDashboard } from '@/features/lender/PortfolioDashboard'
import { OpportunitiesBoard } from '@/features/lender/OpportunitiesBoard'
import { OpportunityDetail } from '@/features/lender/OpportunityDetail'
import { CommitmentDetail } from '@/features/lender/CommitmentDetail'
import { LoanOrigination } from '@/features/lender/LoanOrigination'
import { LenderProfilePage } from '@/features/lender/LenderProfilePage'
import { LenderReports } from '@/features/lender/LenderReports'

import { AdminDashboard } from '@/features/admin/AdminDashboard'
import { ApplicationQueue } from '@/features/admin/ApplicationQueue'
import { LoanManagement } from '@/features/admin/LoanManagement'
import { UserManagement } from '@/features/admin/UserManagement'
import { PlatformSettings } from '@/features/admin/PlatformSettings'
import { RiskMonitor } from '@/features/admin/RiskMonitor'
import { AdminReports } from '@/features/admin/AdminReports'

import { RootRedirect } from '@/features/RootRedirect'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/auth/callback', element: <AuthCallbackPage /> },

  {
    element: <RoleGuard allowedRoles={['borrower']} />,
    children: [{
      element: <BorrowerShell />,
      children: [
        { path: '/borrower', element: <BorrowerDashboard /> },
        { path: '/borrower/apply', element: <LoanApplicationForm /> },
        { path: '/borrower/loans', element: <BorrowerDashboard /> },
        { path: '/borrower/loans/:id', element: <ActiveLoanDetail /> },
        { path: '/borrower/profile', element: <BorrowerProfilePage /> },
        { path: '/borrower/reports', element: <BorrowerReports /> },
      ],
    }],
  },

  {
    element: <RoleGuard allowedRoles={['lender']} />,
    children: [{
      element: <LenderShell />,
      children: [
        { path: '/lender', element: <PortfolioDashboard /> },
        { path: '/lender/opportunities', element: <OpportunitiesBoard /> },
        { path: '/lender/opportunities/:id', element: <OpportunityDetail /> },
        { path: '/lender/commitments/:id', element: <CommitmentDetail /> },
        { path: '/lender/originate', element: <LoanOrigination /> },
        { path: '/lender/profile', element: <LenderProfilePage /> },
        { path: '/lender/reports', element: <LenderReports /> },
      ],
    }],
  },

  {
    element: <RoleGuard allowedRoles={['admin']} />,
    children: [{
      element: <AdminShell />,
      children: [
        { path: '/admin', element: <AdminDashboard /> },
        { path: '/admin/queue', element: <ApplicationQueue /> },
        { path: '/admin/loans', element: <LoanManagement /> },
        { path: '/admin/users', element: <UserManagement /> },
        { path: '/admin/settings', element: <PlatformSettings /> },
        { path: '/admin/risk', element: <RiskMonitor /> },
        { path: '/admin/reports', element: <AdminReports /> },
      ],
    }],
  },

  { path: '/', element: <RootRedirect /> },
  { path: '*', element: <Navigate to="/" replace /> },
])
