CREATE TABLE borrower_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  borrower_id UUID NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('extension', 'interest_only')),
  requested_due_date DATE,
  amount INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX borrower_requests_loan_status ON borrower_requests (loan_id, status);

ALTER TABLE borrower_requests ENABLE ROW LEVEL SECURITY;
