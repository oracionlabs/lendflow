# LendFlow

A private lending portfolio platform for managing loans, borrowing opportunities, and capital deployment.

**Stack:** React 18 · TypeScript · Express.js · Supabase (PostgreSQL + Storage) · Tailwind CSS + shadcn/ui · Recharts

---

## Architecture

```
lendflow/
├── client/          # Vite + React 18 + TypeScript + Tailwind
├── server/          # Express.js + TypeScript API
├── shared/          # Shared types and constants
└── supabase/        # Migrations and local config
    ├── migrations/  # 8 SQL migration files
    └── docker-compose.yml
```

**API-first design.** The Express API is fully decoupled from the React client — the same endpoints work with a future Expo mobile app with zero changes. All business logic lives server-side.

---

## Key Features

### Three Distinct User Roles

| Role | Experience |
|------|-----------|
| **Borrower** | Apply for loans, track applications, make repayments, view amortization schedule |
| **Lender** | Browse opportunities, fund loans, track portfolio yield, manage wallet |
| **Admin** | Review applications with AI credit assessment, manage loan lifecycle, monitor risk |

### Financial Engine
- **Amortization calculator** — standard formula, server-side, monthly payment breakdown
- **AI credit assessment** — Claude grades applicants A–E, determines interest rate
- **Yield distribution** — borrower payments split proportionally across all lenders
- **ACID wallet transactions** — PostgreSQL transactions guarantee consistency across 7+ operations

### Loan Lifecycle
```
Draft → Submitted → Under Review → Approved → Funding → Fully Funded → Active → Repaying → Completed
                                              ↓                                  ↓
                                           Rejected                           Defaulted
```

### Automated Jobs
- **Late payment detection** — runs daily on server start, marks overdue installments
- **Default detection** — flags loans after N consecutive missed payments (configurable)
- **Payment reminders** — email + in-app notification 3 days before due date

---

## Running Locally

### Prerequisites
- Node.js 20+, pnpm 9+
- Docker (for local Supabase)

### Setup

```bash
# Install dependencies
pnpm install

# Start local Supabase (runs migrations automatically)
docker compose -f supabase/docker-compose.yml --env-file supabase/.env up -d

# Copy env files
cp server/.env.example server/.env    # fill in Supabase URL + service key
cp client/.env.example client/.env    # fill in Supabase URL + anon key

# Seed demo data (11 users, 25 loans across all lifecycle states)
pnpm --filter server seed

# Start everything
pnpm dev
```

Open `http://localhost:5173`

### Seed Credentials

All seed users use password: **`Lendflow123!`**

| Role | Email | Notes |
|------|-------|-------|
| Admin | admin@lendflow.dev | Full platform access |
| Borrower | borrower1@lendflow.dev | Sarah Chen — Grade B, completed + repaying loans |
| Borrower | borrower2@lendflow.dev | Marcus Johnson — Grade A, long-term loans |
| Borrower | borrower3@lendflow.dev | Emily Rodriguez — Grade C |
| Borrower | borrower4@lendflow.dev | David Park — Grade D, has a defaulted loan |
| Borrower | borrower5@lendflow.dev | Lisa Thompson — Grade E, student |
| Lender | lender1@lendflow.dev | Robert Kim — conservative |
| Lender | lender2@lendflow.dev | Jennifer Walsh — moderate, institutional |
| Lender | lender3@lendflow.dev | Michael Torres — aggressive (holds defaulted commitments) |
| Lender | lender4@lendflow.dev | Amanda Foster — conservative |
| Lender | lender5@lendflow.dev | Christopher Lee — moderate |

**Seed data includes:** 3 completed, 4 repaying, 2 defaulted, 2 fully-funded, 3 funding, 2 approved, 3 under-review, 3 submitted, 1 rejected, 2 draft loans — all with realistic yield distributions, wallet transactions, and amortization schedules.

---

## Schema Overview

| Table | Purpose |
|-------|---------|
| `users` | Core accounts (mirrors Supabase auth) |
| `borrower_profiles` | Income, employment, address |
| `lender_profiles` | Type, accreditation, risk tolerance |
| `loans` | Full lifecycle with AI assessment |
| `loan_schedule` | Monthly amortization schedule per loan |
| `funding_commitments` | Lender commitments with share % |
| `yield_distributions` | Per-installment yield per lender |
| `wallets` | Available, committed, pending, yield balances |
| `transactions` | Full ledger (deposits, repayments, yield, fees) |
| `notifications` | In-app + email notification log |
| `notification_preferences` | Per-user channel preferences |
| `platform_settings` | Configurable rates, thresholds, limits |

Row-Level Security (RLS) is enforced in PostgreSQL — users can only see their own data regardless of client behavior.

---

## API Routes

```
POST /api/auth/register        Create borrower/lender account
GET  /api/auth/me              Current user

GET  /api/loans                Borrower's loans
POST /api/loans                Submit loan application
GET  /api/loans/:id/payments   Payment history
POST /api/loans/:id/payments   Make a payment (uses process_borrower_payment RPC)

GET  /api/borrower/profile/completion   Profile completeness %
PUT  /api/borrower/profile     Update borrower profile

GET  /api/lender/opportunities          Browse funding opportunities
GET  /api/lender/portfolio/summary      Portfolio KPIs
GET  /api/lender/portfolio/yield-chart  Monthly yield chart data
GET  /api/lender/commitments            Lender's commitments
POST /api/loans/:id/fund               Commit funds to a loan

GET  /api/wallet               Wallet balances
POST /api/wallet/deposit        Simulated deposit
POST /api/wallet/withdraw       Simulated withdrawal

GET  /api/admin/dashboard       Platform KPIs + alerts
GET  /api/admin/queue           Pending applications
POST /api/admin/loans/:id/approve
POST /api/admin/loans/:id/reject
POST /api/admin/loans/:id/disburse
GET  /api/admin/reports/origination    Monthly volume
GET  /api/admin/reports/npl            NPL by credit grade
GET  /api/admin/reports/revenue        Fee revenue over time
GET  /api/admin/reports/cohort         Cohort performance

GET  /api/reports/export        CSV export (transactions, income_summary)
GET  /api/notifications         In-app notifications
PUT  /api/notifications/preferences    Update email/in-app prefs
```

---

## Language Guide

This platform is positioned as portfolio management tooling for private lenders, not a public marketplace.

| Avoid | Use instead |
|-------|-------------|
| Investors | Lenders / Capital Partners |
| Returns / ROI | Portfolio Yield / Interest Income |
| Marketplace | Lending Network / Opportunities Board |
| Risk grade | Credit assessment |
| Default rate | Non-performing loan (NPL) rate |

---

## What This Demonstrates

- **Financial domain depth** — amortization, credit assessment, yield distribution, ACID wallet transactions
- **Multi-role platform** — three distinct experiences with shared data model
- **PostgreSQL mastery** — RLS, atomic transactions via RPC functions, complex queries
- **AI integration** — practical credit assessment using Claude (Anthropic SDK)
- **API-first architecture** — designed for Expo mobile expansion with zero backend changes
- **Domain positioning** — regulatory-aware language throughout
