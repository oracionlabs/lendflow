CREATE TABLE loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  borrower_id UUID REFERENCES users(id),

  -- Application details
  amount_requested INTEGER NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('debt_consolidation', 'business', 'education', 'medical', 'home_improvement', 'auto', 'personal', 'other')),
  purpose_description TEXT,
  term_months INTEGER NOT NULL,

  -- Credit assessment
  ai_credit_grade TEXT CHECK (ai_credit_grade IN ('A', 'B', 'C', 'D', 'E')),
  ai_confidence DECIMAL(5,4),
  ai_reasoning TEXT,
  ai_risk_factors TEXT[],
  admin_override_grade TEXT CHECK (admin_override_grade IN ('A', 'B', 'C', 'D', 'E')),
  admin_override_reason TEXT,
  debt_to_income_ratio DECIMAL(5,2),

  -- Approved terms
  approved_amount INTEGER,
  interest_rate DECIMAL(5,4),
  monthly_payment INTEGER,
  total_repayment INTEGER,
  origination_fee INTEGER,
  origination_fee_percent DECIMAL(5,4),

  -- Funding tracking
  amount_funded INTEGER DEFAULT 0,
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

CREATE TRIGGER loans_updated_at BEFORE UPDATE ON loans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Amortization schedule
CREATE TABLE loan_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID REFERENCES loans(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL,
  due_date DATE NOT NULL,
  principal_due INTEGER NOT NULL,
  interest_due INTEGER NOT NULL,
  total_due INTEGER NOT NULL,
  principal_paid INTEGER DEFAULT 0,
  interest_paid INTEGER DEFAULT 0,
  total_paid INTEGER DEFAULT 0,
  late_fee INTEGER DEFAULT 0,
  status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'due', 'paid', 'partial', 'late', 'missed', 'waived')),
  paid_at TIMESTAMPTZ,
  days_late INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(loan_id, installment_number)
);
