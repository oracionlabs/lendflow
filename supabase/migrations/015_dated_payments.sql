-- Payments that fall on chosen dates, not on a monthly cycle.

ALTER TABLE loans DROP CONSTRAINT IF EXISTS loans_repayment_type_check;
ALTER TABLE loans ADD CONSTRAINT loans_repayment_type_check
  CHECK (repayment_type IN (
    'installments', 'lump_sum', 'interest_only', 'daily_interest', 'custom_schedule', 'dated'
  ));

ALTER TABLE listing_packages DROP CONSTRAINT IF EXISTS listing_packages_repayment_type_check;
ALTER TABLE listing_packages ADD CONSTRAINT listing_packages_repayment_type_check
  CHECK (repayment_type IN (
    'installments', 'lump_sum', 'interest_only', 'daily_interest', 'custom_schedule', 'dated'
  ));

-- Product loans that already have several dated rows were stored as a single lump sum.
UPDATE loans
SET repayment_type = 'dated'
WHERE loan_kind = 'product'
  AND repayment_type = 'lump_sum'
  AND (SELECT COUNT(*) FROM loan_schedule WHERE loan_schedule.loan_id = loans.id) > 1;
