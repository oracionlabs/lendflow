CREATE TABLE funding_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_id UUID REFERENCES users(id),
  loan_id UUID REFERENCES loans(id),
  amount INTEGER NOT NULL,
  share_percent DECIMAL(7,4),
  expected_yield INTEGER DEFAULT 0,
  actual_yield INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'repaying', 'completed', 'non_performing')),
  funded_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE(lender_id, loan_id)
);

CREATE TABLE yield_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commitment_id UUID REFERENCES funding_commitments(id),
  schedule_id UUID REFERENCES loan_schedule(id),
  principal_return INTEGER NOT NULL,
  interest_return INTEGER NOT NULL,
  total_return INTEGER NOT NULL,
  distributed_at TIMESTAMPTZ DEFAULT now()
);
