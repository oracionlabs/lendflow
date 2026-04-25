CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) UNIQUE,
  available_balance INTEGER DEFAULT 0,
  committed_balance INTEGER DEFAULT 0,
  pending_balance INTEGER DEFAULT 0,
  total_yield_earned INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER wallets_updated_at BEFORE UPDATE ON wallets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  wallet_id UUID REFERENCES wallets(id),
  type TEXT NOT NULL CHECK (type IN (
    'deposit', 'withdrawal', 'funding_commitment', 'yield_distribution',
    'disbursement', 'repayment', 'origination_fee', 'late_fee', 'refund'
  )),
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  related_loan_id UUID REFERENCES loans(id),
  related_commitment_id UUID REFERENCES funding_commitments(id),
  description TEXT,
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'reversed')),
  created_at TIMESTAMPTZ DEFAULT now()
);
