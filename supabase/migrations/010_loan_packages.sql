-- Migration 010: Loan Packages
-- Lenders can now create named packages on their listing with different repayment types.
-- Borrowers pick a package when applying.

-- 1. Extend rate_period check to allow 'daily'
ALTER TABLE lender_listings
  DROP CONSTRAINT IF EXISTS lender_listings_rate_period_check;
ALTER TABLE lender_listings ADD CONSTRAINT lender_listings_rate_period_check
  CHECK (rate_period IN ('per_15_days','per_30_days','monthly','annually','flat','daily'));

-- 2. New listing_packages table
CREATE TABLE listing_packages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id       UUID NOT NULL REFERENCES lender_listings(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  repayment_type   TEXT NOT NULL CHECK (repayment_type IN (
                     'installments','lump_sum','interest_only','daily_interest','custom_schedule')),
  interest_rate    DECIMAL(6,4) NOT NULL,
  rate_period      TEXT NOT NULL CHECK (rate_period IN (
                     'per_15_days','per_30_days','monthly','annually','flat','daily')),
  term_months      INTEGER,
  max_term_days    INTEGER,
  payment_frequency TEXT CHECK (payment_frequency IN ('weekly','bi_weekly','monthly','quarterly')),
  min_loan         INTEGER,
  max_loan         INTEGER,
  sort_order       INTEGER DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER listing_packages_updated_at BEFORE UPDATE ON listing_packages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_listing_packages_listing ON listing_packages(listing_id);

ALTER TABLE listing_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY packages_read ON listing_packages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM lender_listings ll
    WHERE ll.id = listing_packages.listing_id
      AND (ll.status = 'active' OR ll.lender_id = auth.uid())
  ));

CREATE POLICY packages_write ON listing_packages FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM lender_listings ll
    WHERE ll.id = listing_packages.listing_id AND ll.lender_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM lender_listings ll
    WHERE ll.id = listing_packages.listing_id AND ll.lender_id = auth.uid()
  ));

-- 3. Extend loans table
ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS repayment_type TEXT
    CHECK (repayment_type IN ('installments','lump_sum','interest_only','daily_interest','custom_schedule')),
  ADD COLUMN IF NOT EXISTS package_id UUID REFERENCES listing_packages(id),
  ADD COLUMN IF NOT EXISTS payment_frequency TEXT
    CHECK (payment_frequency IN ('weekly','bi_weekly','monthly','quarterly')),
  ADD COLUMN IF NOT EXISTS max_term_days INTEGER;

CREATE INDEX idx_loans_package ON loans(package_id) WHERE package_id IS NOT NULL;
