-- Direct loans can waive documents, be shared by link, and record InstaPay payments.

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS verification_mode TEXT NOT NULL DEFAULT 'formal';

ALTER TABLE loans
  DROP CONSTRAINT IF EXISTS loans_verification_mode_check;

ALTER TABLE loans
  ADD CONSTRAINT loans_verification_mode_check
  CHECK (verification_mode IN ('formal', 'manual'));

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS payment_channel TEXT NOT NULL DEFAULT 'wallet';

ALTER TABLE loans
  DROP CONSTRAINT IF EXISTS loans_payment_channel_check;

ALTER TABLE loans
  ADD CONSTRAINT loans_payment_channel_check
  CHECK (payment_channel IN ('wallet', 'instapay'));

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS verification_note TEXT;

ALTER TABLE loan_schedule
  ADD COLUMN IF NOT EXISTS payment_note TEXT;

ALTER TABLE lender_profiles
  ADD COLUMN IF NOT EXISTS instapay_qr TEXT;

CREATE TABLE IF NOT EXISTS loan_access (
  token TEXT PRIMARY KEY,
  borrower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (borrower_id, lender_id)
);

ALTER TABLE loan_access ENABLE ROW LEVEL SECURITY;
