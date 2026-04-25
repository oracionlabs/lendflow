-- Lender listings: lenders post their available capital and terms
-- Borrowers browse and apply to specific lenders

CREATE TABLE lender_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  available_amount INTEGER NOT NULL,
  min_loan INTEGER DEFAULT 10000,
  max_loan INTEGER,
  interest_rate DECIMAL(6,4) NOT NULL,
  rate_period TEXT NOT NULL CHECK (rate_period IN ('per_15_days', 'per_30_days', 'monthly', 'annually', 'flat')),
  accepted_purposes TEXT[] DEFAULT '{}',
  max_term_months INTEGER,
  description TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER lender_listings_updated_at BEFORE UPDATE ON lender_listings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Add listing_id to loans so we know which listing a borrower applied to
ALTER TABLE loans ADD COLUMN IF NOT EXISTS listing_id UUID REFERENCES lender_listings(id);

-- RLS
ALTER TABLE lender_listings ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read active listings
CREATE POLICY "listings_read" ON lender_listings
  FOR SELECT TO authenticated
  USING (status = 'active' OR lender_id = auth.uid());

-- Lenders can insert/update their own listing
CREATE POLICY "listings_write" ON lender_listings
  FOR ALL TO authenticated
  USING (lender_id = auth.uid())
  WITH CHECK (lender_id = auth.uid());

CREATE INDEX idx_lender_listings_status ON lender_listings(status);
CREATE INDEX idx_lender_listings_lender ON lender_listings(lender_id);
CREATE INDEX idx_loans_listing ON loans(listing_id) WHERE listing_id IS NOT NULL;
