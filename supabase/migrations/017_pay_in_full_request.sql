ALTER TABLE borrower_requests DROP CONSTRAINT IF EXISTS borrower_requests_kind_check;
ALTER TABLE borrower_requests ADD CONSTRAINT borrower_requests_kind_check
  CHECK (kind IN ('extension', 'interest_only', 'pay_in_full'));
