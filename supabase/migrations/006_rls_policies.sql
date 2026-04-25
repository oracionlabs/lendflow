-- Users: own row only
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_select_own ON users FOR SELECT USING (id = auth.uid());
CREATE POLICY users_update_own ON users FOR UPDATE USING (id = auth.uid());

-- Borrower profiles: owner only (lenders never query this)
ALTER TABLE borrower_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY borrower_profile_own ON borrower_profiles FOR ALL USING (user_id = auth.uid());

-- Lender profiles: owner only
ALTER TABLE lender_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY lender_profile_own ON lender_profiles FOR ALL USING (user_id = auth.uid());

-- Documents: owner only
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY documents_own ON documents FOR ALL USING (user_id = auth.uid());

-- Loans: borrowers see own; lenders see funding+ status (no PII exposed here)
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY loans_borrower_own ON loans FOR ALL USING (borrower_id = auth.uid());
CREATE POLICY loans_lender_browse ON loans FOR SELECT
  USING (status IN ('funding', 'fully_funded', 'active', 'repaying', 'completed', 'defaulted'));

-- Loan schedule: borrowers see own; lenders see for their committed loans
ALTER TABLE loan_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY schedule_borrower ON loan_schedule FOR SELECT
  USING (EXISTS (SELECT 1 FROM loans WHERE loans.id = loan_schedule.loan_id AND loans.borrower_id = auth.uid()));
CREATE POLICY schedule_lender ON loan_schedule FOR SELECT
  USING (EXISTS (SELECT 1 FROM funding_commitments WHERE funding_commitments.loan_id = loan_schedule.loan_id AND funding_commitments.lender_id = auth.uid()));

-- Funding commitments: lenders see own only
ALTER TABLE funding_commitments ENABLE ROW LEVEL SECURITY;
CREATE POLICY commitments_own ON funding_commitments FOR SELECT USING (lender_id = auth.uid());

-- Yield distributions: lenders via own commitments
ALTER TABLE yield_distributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY yield_own ON yield_distributions FOR SELECT
  USING (EXISTS (SELECT 1 FROM funding_commitments WHERE funding_commitments.id = yield_distributions.commitment_id AND funding_commitments.lender_id = auth.uid()));

-- Wallets: owner only
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY wallet_own ON wallets FOR ALL USING (user_id = auth.uid());

-- Transactions: owner only
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY transactions_own ON transactions FOR SELECT USING (user_id = auth.uid());

-- Notifications: owner only
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_own ON notifications FOR ALL USING (user_id = auth.uid());

-- Notification preferences: owner only
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY notif_prefs_own ON notification_preferences FOR ALL USING (user_id = auth.uid());

-- Platform settings: read-only for authenticated users
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_settings_read ON platform_settings FOR SELECT USING (auth.uid() IS NOT NULL);

-- NOTE: All server-side mutations use service_role key which bypasses RLS entirely.
-- RLS is a safety net for any direct Supabase client access.
