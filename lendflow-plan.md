# Project Plan: Lending Portfolio Management Platform

**Working Name: LendFlow**
A private lending portfolio platform for managing loans, borrowing opportunities, and capital deployment.
React 18 · Express.js · Supabase (PostgreSQL + Storage) · Tailwind + shadcn/ui

> **Companion doc:** See `LendFlow_User_Stories.md` for all 20 user journeys, acceptance criteria, edge cases, and non-functional requirements. This document covers architecture, schema, API routes, and technical decisions. The user stories doc defines *what* the product does; this doc defines *how* it's built.

---

## Vision

LendFlow helps private lenders manage their lending portfolios — tracking loans, evaluating borrowing opportunities, monitoring repayments, and analyzing portfolio performance. Borrowers apply through a clean portal, lenders evaluate and fund opportunities, and the platform handles the lifecycle from origination through repayment.

This is **not** a public marketplace or crowdfunding platform. It's a private lending network where vetted lenders deploy capital into vetted borrowing opportunities through direct loan agreements.

---

## Positioning & Language Guide

The platform has P2P mechanics but is positioned as portfolio management tooling for private lenders. Language matters.

| ❌ Avoid | ✅ Use Instead |
|----------|---------------|
| Investors | Lenders / Capital Partners |
| Invest / Investment | Fund / Funding Commitment |
| Returns / ROI | Portfolio Yield / Interest Income |
| Marketplace | Lending Network / Opportunities Board |
| Crowdfunding | Direct Lending / Private Lending |
| Securities | Loan Agreements |
| Portfolio returns | Interest income summary |
| Risk grade | Credit assessment |
| Default rate | Non-performing loan (NPL) rate |
| Buy/Sell positions | Transfer loan participation |

Use this language throughout the UI, API naming, documentation, and marketing.

---

## Architecture

**API-first** — Express backend is a standalone REST API. React is one client. Future Expo mobile app plugs in as a second client with zero backend changes.

```
Current:
┌──────────┐       ┌──────────┐       ┌──────────┐
│  React   │──────▶│ Express  │──────▶│ Supabase │
│  (Web)   │  API  │   API    │       │ Postgres │
└──────────┘       └──────────┘       │ Storage  │
                                      └──────────┘
Future:
┌──────────┐
│  React   │───┐
│  (Web)   │   │   ┌──────────┐       ┌──────────┐
└──────────┘   ├──▶│ Express  │──────▶│ Supabase │
┌──────────┐   │   │   API    │       │ Postgres │
│  Expo    │───┘   └──────────┘       │ Storage  │
│ (Mobile) │                          └──────────┘
└──────────┘
```

**Why Supabase over Firebase?**
Financial data needs relational integrity. PostgreSQL gives ACID transactions for wallet operations, foreign key constraints for loan relationships, and row-level security for multi-role access. Supabase Storage replaces Firebase Storage with S3-compatible file handling.

---

## Tech Stack

| Layer | Tech | Why |
|-------|------|-----|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui | Modern React, polished components |
| Charts | Recharts | Portfolio charts, lending analytics |
| Backend | Express.js with TypeScript | Clean REST API, Expo-compatible |
| Database | Supabase PostgreSQL | ACID transactions for financial data, RLS for access control |
| Auth | Supabase Auth (email + Google OAuth) | Works on web, same SDK for future Expo |
| File Storage | Supabase Storage | Document uploads, profile photos, S3-compatible |
| AI | OpenAI or Anthropic API | Credit assessment scoring |
| Email | Resend (free tier) | Real transactional emails |
| Deploy | Vercel (frontend) + Railway (Express) + Supabase | Free/cheap tiers |

---

## Roles & Access

| Role | Label in UI | What They See |
|------|------------|---------------|
| **Borrower** | Borrower | Apply for loans, track applications, manage active loans, make repayments |
| **Lender** | Capital Partner | Browse opportunities, fund loans, portfolio dashboard, track yield |
| **Admin** | Platform Admin | Review applications, platform analytics, user management, risk oversight |

---

## Database Schema (PostgreSQL)

### Users & Profiles

```sql
-- Core user account
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('borrower', 'lender', 'admin')),
  avatar_url TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending_verification')),
  email_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Borrower-specific profile
CREATE TABLE borrower_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  date_of_birth DATE,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  country TEXT DEFAULT 'US',
  employment_status TEXT CHECK (employment_status IN ('employed', 'self_employed', 'unemployed', 'retired', 'student')),
  employer TEXT,
  job_title TEXT,
  annual_income INTEGER, -- cents
  monthly_expenses INTEGER, -- cents
  credit_score_range TEXT CHECK (credit_score_range IN ('poor', 'fair', 'good', 'very_good', 'excellent')),
  identity_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Lender-specific profile
CREATE TABLE lender_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  lender_type TEXT CHECK (lender_type IN ('individual', 'institutional')),
  accredited BOOLEAN DEFAULT FALSE,
  risk_tolerance TEXT CHECK (risk_tolerance IN ('conservative', 'moderate', 'aggressive')),
  identity_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- KYC/verification documents
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('government_id', 'proof_of_income', 'bank_statement', 'proof_of_funds', 'other')),
  file_url TEXT NOT NULL,
  file_name TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  rejection_reason TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);
```

### Loans

```sql
-- Loan applications and active loans
CREATE TABLE loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  borrower_id UUID REFERENCES users(id),
  
  -- Application details
  amount_requested INTEGER NOT NULL, -- cents
  purpose TEXT NOT NULL CHECK (purpose IN ('debt_consolidation', 'business', 'education', 'medical', 'home_improvement', 'auto', 'personal', 'other')),
  purpose_description TEXT,
  term_months INTEGER NOT NULL,
  
  -- Credit assessment (AI-generated)
  ai_credit_grade TEXT CHECK (ai_credit_grade IN ('A', 'B', 'C', 'D', 'E')),
  ai_confidence DECIMAL(5,4),
  ai_reasoning TEXT,
  ai_risk_factors TEXT[], -- array of risk factor strings
  admin_override_grade TEXT CHECK (admin_override_grade IN ('A', 'B', 'C', 'D', 'E')),
  debt_to_income_ratio DECIMAL(5,2),
  
  -- Approved terms (set on approval)
  approved_amount INTEGER, -- cents
  interest_rate DECIMAL(5,4), -- annual rate as decimal (0.0850 = 8.50%)
  monthly_payment INTEGER, -- cents
  total_repayment INTEGER, -- cents
  origination_fee INTEGER, -- cents
  origination_fee_percent DECIMAL(5,4),
  
  -- Funding
  amount_funded INTEGER DEFAULT 0, -- cents
  funding_percent DECIMAL(5,2) DEFAULT 0,
  lender_count INTEGER DEFAULT 0,
  funding_deadline TIMESTAMPTZ,
  fully_funded_at TIMESTAMPTZ,
  
  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'submitted', 'under_review', 'approved', 'funding', 
    'fully_funded', 'active', 'repaying', 'completed', 
    'defaulted', 'cancelled', 'rejected'
  )),
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  disbursed_at TIMESTAMPTZ,
  first_payment_date DATE,
  maturity_date DATE,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Amortization schedule (one row per payment period)
CREATE TABLE loan_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID REFERENCES loans(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL,
  due_date DATE NOT NULL,
  principal_due INTEGER NOT NULL, -- cents
  interest_due INTEGER NOT NULL, -- cents
  total_due INTEGER NOT NULL, -- cents
  principal_paid INTEGER DEFAULT 0,
  interest_paid INTEGER DEFAULT 0,
  total_paid INTEGER DEFAULT 0,
  late_fee INTEGER DEFAULT 0, -- cents
  status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'due', 'paid', 'partial', 'late', 'missed', 'waived')),
  paid_at TIMESTAMPTZ,
  days_late INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(loan_id, installment_number)
);
```

### Funding & Portfolio

```sql
-- Lender funding commitments (replaces "investments")
CREATE TABLE funding_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_id UUID REFERENCES users(id),
  loan_id UUID REFERENCES loans(id),
  amount INTEGER NOT NULL, -- cents
  share_percent DECIMAL(7,4), -- % of total loan
  expected_yield INTEGER, -- cents (total expected interest income)
  actual_yield INTEGER DEFAULT 0, -- cents (actual received so far)
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'repaying', 'completed', 'non_performing')),
  funded_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE(lender_id, loan_id)
);

-- Interest income distributions (each time borrower pays, lenders get share)
CREATE TABLE yield_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commitment_id UUID REFERENCES funding_commitments(id),
  schedule_id UUID REFERENCES loan_schedule(id),
  principal_return INTEGER NOT NULL, -- cents
  interest_return INTEGER NOT NULL, -- cents
  total_return INTEGER NOT NULL, -- cents
  distributed_at TIMESTAMPTZ DEFAULT now()
);
```

### Wallet & Transactions

```sql
-- User wallet (lenders and borrowers)
CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) UNIQUE,
  available_balance INTEGER DEFAULT 0, -- cents
  committed_balance INTEGER DEFAULT 0, -- cents (funds locked in active commitments)
  pending_balance INTEGER DEFAULT 0, -- cents (pending deposits/withdrawals)
  total_yield_earned INTEGER DEFAULT 0, -- cents (lifetime interest income)
  currency TEXT DEFAULT 'USD',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- All money movements
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  wallet_id UUID REFERENCES wallets(id),
  type TEXT NOT NULL CHECK (type IN (
    'deposit', 'withdrawal', 'funding_commitment', 'yield_distribution',
    'disbursement', 'repayment', 'origination_fee', 'late_fee', 'refund'
  )),
  amount INTEGER NOT NULL, -- cents (positive = credit, negative = debit)
  balance_after INTEGER NOT NULL, -- cents
  related_loan_id UUID REFERENCES loans(id),
  related_commitment_id UUID REFERENCES funding_commitments(id),
  description TEXT,
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'reversed')),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Platform

```sql
-- Configurable platform settings
CREATE TABLE platform_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origination_fee_percent DECIMAL(5,4) DEFAULT 0.0200, -- 2%
  late_fee_flat INTEGER DEFAULT 2500, -- $25.00
  late_fee_daily_percent DECIMAL(7,6) DEFAULT 0.000500, -- 0.05% per day
  grace_period_days INTEGER DEFAULT 5,
  default_threshold_missed INTEGER DEFAULT 3, -- consecutive missed payments
  min_loan_amount INTEGER DEFAULT 100000, -- $1,000
  max_loan_amount INTEGER DEFAULT 5000000, -- $50,000
  min_commitment_amount INTEGER DEFAULT 2500, -- $25
  supported_terms INTEGER[] DEFAULT '{6,12,18,24,36,48,60}',
  credit_grade_rates JSONB DEFAULT '{"A":0.0550,"B":0.0850,"C":0.1200,"D":0.1650,"E":0.2100}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN (
    'loan_status', 'payment_due', 'payment_received', 'commitment_funded',
    'yield_received', 'loan_completed', 'loan_non_performing', 'badge', 'system'
  )),
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  channel TEXT DEFAULT 'both' CHECK (channel IN ('in_app', 'email', 'both')),
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  email_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Notification preferences
CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) UNIQUE,
  loan_status_in_app BOOLEAN DEFAULT TRUE,
  loan_status_email BOOLEAN DEFAULT TRUE,
  payment_due_in_app BOOLEAN DEFAULT TRUE,
  payment_due_email BOOLEAN DEFAULT TRUE,
  yield_received_in_app BOOLEAN DEFAULT TRUE,
  yield_received_email BOOLEAN DEFAULT TRUE,
  system_in_app BOOLEAN DEFAULT TRUE,
  system_email BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Row-Level Security

```sql
-- Users can only see their own data
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_own ON users FOR SELECT USING (id = auth.uid());

-- Borrowers see only their loans, lenders see loans in 'funding'+ status
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY borrower_own_loans ON loans FOR SELECT 
  USING (borrower_id = auth.uid());
CREATE POLICY lender_browse_loans ON loans FOR SELECT 
  USING (status IN ('funding', 'fully_funded', 'active', 'repaying', 'completed', 'defaulted'));

-- Lenders see only their own commitments
ALTER TABLE funding_commitments ENABLE ROW LEVEL SECURITY;
CREATE POLICY lender_own_commitments ON funding_commitments FOR SELECT 
  USING (lender_id = auth.uid());

-- Wallets are private
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY wallet_own ON wallets FOR ALL USING (user_id = auth.uid());

-- Transactions are private
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY transactions_own ON transactions FOR SELECT 
  USING (user_id = auth.uid());

-- Admin bypasses all RLS via service role key
```

---

## Feature Breakdown

### 1. Auth & Onboarding

- [ ] Supabase Auth: email/password + Google OAuth
- [ ] Registration with role selection (Borrower or Lender)
- [ ] Email verification via Supabase
- [ ] Borrower onboarding: personal info, employment, income, document upload
- [ ] Lender onboarding: lender type, risk tolerance, document upload
- [ ] Document upload to Supabase Storage (government ID, proof of income/funds)
- [ ] Profile completion progress indicator
- [ ] Supabase JWT forwarded to Express API for verification
- [ ] Wallet auto-created on registration

### 2. Borrower: Loan Application

- [ ] Multi-step application form:
  - Step 1: Amount + purpose + description
  - Step 2: Term selection with live monthly payment preview (API calculation)
  - Step 3: Income & employment details
  - Step 4: Review all details + submit
- [ ] Save draft applications, resume later
- [ ] Application status tracker with timeline visualization
- [ ] View rejection reason if rejected
- [ ] Cancel pending application
- [ ] Application history (past applications)

### 3. Borrower: Active Loans

- [ ] Active loan dashboard: remaining balance, next payment date/amount, progress ring
- [ ] Full amortization schedule (table view + principal vs interest chart)
- [ ] Make a repayment:
  - Pay current installment
  - Pay custom amount (extra applies to principal)
  - Early payoff with interest savings displayed
- [ ] Payment history with status badges (paid, late, missed)
- [ ] Late payment warning with grace period countdown
- [ ] Loan completion summary screen

### 4. Lender: Opportunities Board

- [ ] Browse lending opportunities (loans in "funding" status)
- [ ] Filters: credit grade, term, interest rate, purpose, funding progress, amount range
- [ ] Sort: newest, highest yield, most funded, ending soon
- [ ] Opportunity detail page:
  - Anonymized borrower summary (income range, employment, DTI — never PII)
  - AI credit assessment with grade, confidence, reasoning
  - Funding progress bar with lender count
  - Amortization preview
  - Yield calculator: enter commitment amount → see projected monthly income
- [ ] Fund an opportunity:
  - Enter amount (minimum $25)
  - Confirm with projected yield breakdown
  - Deducts from wallet available balance → moves to committed balance
  - Updates funding progress

### 5. Lender: Portfolio Dashboard

- [ ] Portfolio overview cards: total committed, active loans, total yield earned, projected future yield
- [ ] Active commitments list with status, credit grade, amount, yield so far
- [ ] Performance charts (Recharts):
  - Yield income over time (line chart)
  - Diversification by credit grade (pie chart)
  - Commitment status breakdown — active / completed / non-performing (donut chart)
  - Monthly yield trend (bar chart)
- [ ] Individual commitment detail: link to loan, payment schedule, yield distributions received
- [ ] Portfolio metrics: weighted avg interest rate, avg loan term, NPL rate
- [ ] Interest income summary (for tax purposes)

### 6. Lender: Wallet

- [ ] Balance display: available, committed, pending, total yield earned
- [ ] Transaction history with type filters and date range
- [ ] Deposit funds (simulated — adds to balance, architected for real payment rail)
- [ ] Withdraw funds (simulated — same pattern)
- [ ] Transaction detail view
- [ ] All wallet operations wrapped in PostgreSQL transactions (ACID)

### 7. AI Credit Assessment

- [ ] On loan submission, API sends borrower data to AI:
  - Income, employment, loan amount, term, purpose, DTI ratio, credit score range
- [ ] AI returns: credit grade (A–E), confidence score, reasoning, risk factors[]
- [ ] Credit grade determines interest rate (from platform_settings.credit_grade_rates)
- [ ] Admin can override AI grade with documented justification
- [ ] Assessment displayed to lenders on opportunity detail page
- [ ] Assessment accuracy tracking: predicted grade vs actual outcome

### 8. Loan Lifecycle Engine

- [ ] **Draft → Submitted:** Borrower completes and submits application
- [ ] **Submitted → Under Review:** Enters admin queue
- [ ] **Under Review → Approved:** Admin approves with terms (amount, rate, term) or rejects with reason
- [ ] **Approved → Funding:** Listed on opportunities board, lenders can commit funds
- [ ] **Funding → Fully Funded:** When commitments reach 100%, auto-transitions
- [ ] **Fully Funded → Active:** Admin triggers disbursement (simulated), amortization schedule generated
- [ ] **Active → Repaying:** First payment date arrives
- [ ] **Repaying → Completed:** All installments paid
- [ ] **Repaying → Defaulted:** After N consecutive missed payments (configurable)
- [ ] Amortization schedule generator:
  - Standard fixed-payment formula
  - Each installment split into principal + interest
  - Recalculates remaining schedule on extra/early payments
- [ ] Late payment handling:
  - Grace period (configurable, default 5 days)
  - After grace: flat fee + daily percentage applied
  - Notifications: payment due (3 days before), overdue, late fee applied
- [ ] Non-performing loan handling:
  - After N missed payments → status: defaulted
  - Lender yield distributions stop, loss recorded
  - Admin notified for follow-up
- [ ] Yield distribution on borrower payment:
  - Calculate each lender's share (proportional to commitment %)
  - Credit principal + interest portions to each lender's wallet
  - Create yield_distribution records
  - All within a single PostgreSQL transaction

### 9. Admin Panel

- [ ] **Application queue:** Pending applications with AI credit assessment summary, approve/reject
- [ ] **Loan management:** All loans filterable by status, search, drill into detail
- [ ] **Platform dashboard:**
  - Total loan volume originated
  - Active loans and total outstanding principal
  - NPL rate (overall and by credit grade)
  - Platform fee revenue (origination fees collected)
  - Funding success rate (% of approved loans fully funded)
  - Average time to fund
- [ ] **User management:** Borrowers and lenders, search, view profiles, suspend
- [ ] **Risk monitoring:** Loans approaching default threshold, high-risk flags
- [ ] **Platform settings:** Fee rates, interest rates per grade, late fee config, loan limits, term options

### 10. Notifications

- [ ] In-app notification center (bell icon, dropdown, unread count)
- [ ] Types:
  - Borrower: application status, payment due (3 days), overdue, late fee, loan funded, disbursement
  - Lender: opportunity funded, yield received, loan completed, loan non-performing
  - Admin: new application, loan approaching default, platform alerts
- [ ] Email via Resend (real delivery)
- [ ] Per-user notification preferences
- [ ] Admin system-wide announcements

### 11. Reporting

- [ ] Borrower: payment history summary, remaining balance, interest saved on early payments
- [ ] Lender: portfolio performance, yield history, annual interest income summary (tax document)
- [ ] Admin: origination trends, NPL analysis by grade, platform revenue, cohort performance
- [ ] CSV export on all report pages

---

## API Route Structure

```
# Auth
POST   /api/auth/register
POST   /api/auth/verify-token
GET    /api/auth/me

# Users
GET    /api/users/me
PUT    /api/users/me
PUT    /api/users/me/avatar

# Borrower
GET    /api/borrower/profile
PUT    /api/borrower/profile
POST   /api/borrower/documents
GET    /api/borrower/loans
GET    /api/borrower/loans/:id/schedule

# Lender
GET    /api/lender/profile
PUT    /api/lender/profile
POST   /api/lender/documents
GET    /api/lender/commitments
GET    /api/lender/commitments/:id
GET    /api/lender/commitments/:id/yields
GET    /api/lender/portfolio/summary
GET    /api/lender/portfolio/yield-chart
GET    /api/lender/portfolio/diversification
GET    /api/lender/portfolio/income-summary

# Loans
POST   /api/loans
GET    /api/loans (opportunities board — funding status)
GET    /api/loans/:id
PUT    /api/loans/:id (update draft)
POST   /api/loans/:id/submit
DELETE /api/loans/:id (cancel draft)
GET    /api/loans/:id/schedule
GET    /api/loans/:id/yield-preview (calculator)

# Payments
POST   /api/loans/:id/payments
GET    /api/loans/:id/payments
GET    /api/loans/:id/payoff-quote

# Funding
POST   /api/loans/:id/fund (create commitment)

# Wallet
GET    /api/wallet
GET    /api/wallet/transactions
POST   /api/wallet/deposit
POST   /api/wallet/withdraw

# Credit Assessment (internal)
POST   /api/assessment/score

# Admin
GET    /api/admin/dashboard
GET    /api/admin/loans
GET    /api/admin/loans/queue
POST   /api/admin/loans/:id/review
POST   /api/admin/loans/:id/disburse
POST   /api/admin/loans/:id/override-grade
GET    /api/admin/users
GET    /api/admin/users/:id
PUT    /api/admin/users/:id
GET    /api/admin/risk/monitor
GET    /api/admin/settings
PUT    /api/admin/settings
GET    /api/admin/reports/origination
GET    /api/admin/reports/npl
GET    /api/admin/reports/revenue

# Notifications
GET    /api/notifications
PUT    /api/notifications/:id/read
PUT    /api/notifications/read-all
GET    /api/notifications/preferences
PUT    /api/notifications/preferences

# Reports
GET    /api/reports/export
```

---

## Week-by-Week Build Plan

### Week 1: Foundation + Borrower Flow

**Days 1–2: Scaffold + Auth + Database**
- [ ] Vite + React 18 + TypeScript + Tailwind + shadcn/ui
- [ ] Express.js + TypeScript project
- [ ] Supabase project: database, auth, storage
- [ ] Run all SQL migrations (tables, RLS policies, indexes)
- [ ] Supabase Auth setup (email/password + Google OAuth)
- [ ] Express middleware: Supabase JWT verification
- [ ] Role-based middleware (borrower, lender, admin)
- [ ] Seed script: 5 borrowers (with profiles), 5 lenders, 1 admin, platform settings
- [ ] Layout shells: borrower sidebar, lender sidebar, admin sidebar
- [ ] Role-based routing
- [ ] Wallet auto-creation on user registration

**Days 3–4: Borrower Application + Loan Engine**
- [ ] Multi-step loan application form with validation
- [ ] Save draft, resume, submit flow
- [ ] Application status tracker (timeline UI)
- [ ] AI credit assessment on submission
- [ ] Amortization schedule generator (standard formula, server-side)
- [ ] Loan lifecycle state machine (all status transitions)
- [ ] Borrower dashboard: my applications, active loans

**Day 5: Borrower Active Loans + Payments**
- [ ] Active loan detail: balance, schedule table, progress ring
- [ ] Principal vs interest chart over loan life
- [ ] Make payment: current installment, custom amount, early payoff
- [ ] Payment history with status badges
- [ ] Late fee calculation + grace period logic
- [ ] Early payoff quote with interest savings

### Week 2: Lender Flow + Admin

**Days 1–2: Opportunities Board + Funding**
- [ ] Opportunities board with filters and sort
- [ ] Opportunity detail: borrower summary, credit assessment, funding progress, yield calculator
- [ ] Fund opportunity flow: amount → confirm → wallet deduction
- [ ] Wallet: balance display, transaction history, deposit/withdraw (simulated)
- [ ] Funding completion detection (auto-transition when 100%)
- [ ] Commitment creation with share % calculation

**Days 3–4: Lender Portfolio + Admin Panel**
- [ ] Portfolio overview cards (committed, active, yield earned, projected)
- [ ] Performance charts: yield over time, diversification, status breakdown, monthly trend
- [ ] Commitment detail with yield distribution history
- [ ] Portfolio metrics: avg rate, avg term, NPL rate
- [ ] Admin application queue: review with AI context, approve/reject
- [ ] Admin platform dashboard: volume, NPL rate, fees, funding success
- [ ] Admin user management: list, search, suspend

**Day 5: Loan Lifecycle Automation**
- [ ] Disbursement flow: admin triggers → generates schedule → creates wallet transaction → notifies borrower
- [ ] Yield distribution engine: borrower payment → proportional split → credit to each lender wallet
- [ ] All financial operations in PostgreSQL transactions
- [ ] Late payment detection (scheduled job)
- [ ] Default detection after N missed payments
- [ ] Seed 25+ loans across all lifecycle states for demo

### Week 3: Notifications + Polish + Deploy

**Days 1–2: Notifications + Email + Reporting**
- [ ] In-app notification center (bell, dropdown, unread count)
- [ ] All notification types wired to lifecycle events
- [ ] Resend integration for real email delivery
- [ ] Notification preferences per user
- [ ] Payment due reminders (3 days before)
- [ ] Borrower: payment summary, interest saved
- [ ] Lender: yield history, annual interest income summary
- [ ] Admin: origination trends, NPL by grade, platform revenue
- [ ] CSV export on all reports

**Day 3: Polish**
- [ ] Loading skeletons on all pages
- [ ] Empty states for all lists
- [ ] Form validation with clear error messages
- [ ] Toast notifications for actions
- [ ] Error boundaries and 404/unauthorized pages
- [ ] Mobile-responsive: opportunities board, portfolio, loan detail, borrower dashboard

**Day 4: Admin Settings + Risk Monitoring**
- [ ] Platform settings page: all configurable values
- [ ] Risk monitoring page: loans approaching default, NPL trends
- [ ] Credit assessment accuracy report (predicted vs actual)
- [ ] Admin override audit log

**Day 5: Deploy + Documentation**
- [ ] Frontend → Vercel
- [ ] Express API → Railway
- [ ] Supabase production project configured
- [ ] Environment variables set
- [ ] README:
  - Screenshots: opportunities board, portfolio dashboard, admin panel, borrower flow
  - Architecture diagram showing Expo-ready API separation
  - Tech stack and schema overview
  - How to run locally (docker compose for dev)
  - Seed data description
  - Language/positioning guide
  - "Future: Expo mobile app" section
- [ ] Demo video walkthrough

---

## Amortization Formula

```
M = P × [r(1+r)^n] / [(1+r)^n - 1]

Where:
  M = monthly payment
  P = principal (loan amount minus origination fee)
  r = monthly interest rate (annual rate / 12)
  n = number of payments (term in months)

Each installment:
  Interest = remaining balance × r
  Principal = M - interest
  New balance = old balance - principal

Early/extra payments:
  Extra amount applied to principal
  Remaining schedule recalculated with new balance
  Interest savings = original total repayment - new total repayment
```

All calculations server-side. Frontend displays results only.

---

## Key Technical Decisions

**Why Supabase over Firebase?**
Financial data needs ACID transactions. When a borrower pays and we distribute yield to 5 lenders, that's 7+ operations (1 loan_schedule update, 1 borrower wallet debit, 5 lender wallet credits, 5 yield_distribution inserts). If any fail, all must roll back. PostgreSQL transactions guarantee this. Firestore cannot.

**Why Express over NestJS?**
Portfolio variety — NestJS in Pulse, Fastify in Tenant Portal. Express is also the most likely framework you'll encounter in existing codebases on Upwork.

**Why wallet system?**
Real lending platforms don't let lenders pay per loan. They deposit into an account and commit from their balance. This mirrors real-world architecture and shows domain understanding. The actual money movement (deposit/withdraw) is simulated — swap in Plaid or ACH when ready.

**Why "Capital Partner" not "Investor"?**
"Investor" + "returns" + public platform = securities regulation territory. "Lender" + "yield" + private network = commercial lending, which has a much lighter regulatory footprint. The product works the same; the language determines which regulators notice.

**Expo-ready:**
- Express API is fully decoupled
- Supabase Auth works in Expo (same JS client)
- Supabase Storage works in Expo
- JWT auth works on mobile
- All business logic server-side
- Pagination on all lists (mobile needs this)

---

## What This Proves to Clients

- **Financial domain depth:** Amortization, credit assessment, yield distribution, wallet ACID transactions — paired with coworking billing, makes you a fintech specialist
- **PostgreSQL mastery:** Complex schema, RLS policies, transactions, migrations
- **Multi-role platforms:** Borrower, lender, admin — three distinct experiences in one app
- **API-first architecture:** Clean separation designed for mobile expansion
- **AI integration:** Practical credit assessment, not a gimmick
- **Domain-aware positioning:** Shows you understand regulatory considerations, not just code

---

## Journey-to-Feature Map

Reference for which technical features fulfill which user journeys (see `LendFlow_User_Stories.md`).

| User Journey | Technical Features |
|---|---|
| J1: Borrower Signup | Auth & Onboarding, Supabase Auth, Supabase Storage (docs) |
| J2: Loan Application | Borrower: Loan Application, AI Credit Assessment |
| J3: Tracking Application | Loan Lifecycle Engine (status transitions), Notifications |
| J4: Making Repayments | Borrower: Active Loans, Amortization engine, Late fee logic, Wallet transactions |
| J5: Loan Completion | Loan Lifecycle Engine (completed state), Notifications |
| J6: Lender Signup | Auth & Onboarding, Supabase Auth, Supabase Storage |
| J7: Browsing Opportunities | Lender: Opportunities Board, AI Credit Assessment (display) |
| J8: Funding a Loan | Lender: Funding flow, Wallet (committed balance), Funding Commitments table |
| J9: Portfolio Tracking | Lender: Portfolio Dashboard, Recharts, Funding Commitments + Yield Distributions |
| J10: Receiving Yield | Yield distribution engine, Wallet credits, Notifications |
| J11: Wallet Management | Wallet system, Transactions table, Deposit/withdraw (simulated) |
| J12: Annual Summary | Reporting: income summary, CSV export |
| J13: Reviewing Applications | Admin: Application queue, AI Credit Assessment, Grade override |
| J14: Platform Health | Admin: Platform dashboard, Reporting |
| J15: Handling Defaults | Loan Lifecycle Engine (default detection), Risk monitoring, Notifications |
| J16: Disbursing Loans | Admin: Disbursement flow, Amortization generator, Wallet transactions |
| J17: Platform Settings | Admin: Settings CRUD, platform_settings table |
| J18: Notification Prefs | Notification preferences table, Resend integration |
| J19: Profile Management | User/profile CRUD, Supabase Storage |
| J20: First-Time Experience | Empty states, onboarding CTAs, tooltips |
| E1–E7: Edge Cases | Database-level locking, validation middleware, atomic transactions |

---

*Build the platform. Show the financial depth. Win the fintech contracts.*
