-- A tracked loan can be cash or a product, and payments can be partial.

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS loan_kind TEXT NOT NULL DEFAULT 'cash';

ALTER TABLE loans
  DROP CONSTRAINT IF EXISTS loans_loan_kind_check;

ALTER TABLE loans
  ADD CONSTRAINT loans_loan_kind_check
  CHECK (loan_kind IN ('cash', 'product'));

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS product_name TEXT;
