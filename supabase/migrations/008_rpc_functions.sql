-- ─────────────────────────────────────────────────────────────────────────────
-- register_user: atomically creates app user row + profile + wallet + notif prefs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION register_user(
  p_auth_id UUID,
  p_email TEXT,
  p_name TEXT,
  p_role TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID;
  v_wallet_id UUID;
BEGIN
  INSERT INTO users(id, email, name, role, email_verified)
  VALUES (p_auth_id, p_email, p_name, p_role, FALSE)
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO v_user_id;

  IF v_user_id IS NULL THEN
    v_user_id := p_auth_id;
  END IF;

  -- Create role-specific profile
  IF p_role = 'borrower' THEN
    INSERT INTO borrower_profiles(user_id) VALUES (v_user_id) ON CONFLICT DO NOTHING;
  ELSIF p_role = 'lender' THEN
    INSERT INTO lender_profiles(user_id) VALUES (v_user_id) ON CONFLICT DO NOTHING;
  END IF;

  -- Create wallet
  INSERT INTO wallets(user_id) VALUES (v_user_id)
  ON CONFLICT (user_id) DO NOTHING
  RETURNING id INTO v_wallet_id;

  -- Create notification preferences
  INSERT INTO notification_preferences(user_id) VALUES (v_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN jsonb_build_object('user_id', v_user_id);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- process_wallet_deposit
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION process_wallet_deposit(
  p_user_id UUID,
  p_amount INTEGER
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_wallet wallets%ROWTYPE;
  v_new_balance INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  SELECT * INTO v_wallet FROM wallets WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND';
  END IF;

  v_new_balance := v_wallet.available_balance + p_amount;

  UPDATE wallets SET available_balance = v_new_balance, updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO transactions(user_id, wallet_id, type, amount, balance_after, description)
  VALUES (p_user_id, v_wallet.id, 'deposit', p_amount, v_new_balance, 'Wallet deposit');

  RETURN jsonb_build_object('available_balance', v_new_balance);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- process_wallet_withdrawal
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION process_wallet_withdrawal(
  p_user_id UUID,
  p_amount INTEGER
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_wallet wallets%ROWTYPE;
  v_new_balance INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  SELECT * INTO v_wallet FROM wallets WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND';
  END IF;

  IF v_wallet.available_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  v_new_balance := v_wallet.available_balance - p_amount;

  UPDATE wallets SET available_balance = v_new_balance, updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO transactions(user_id, wallet_id, type, amount, balance_after, description)
  VALUES (p_user_id, v_wallet.id, 'withdrawal', -p_amount, v_new_balance, 'Wallet withdrawal');

  RETURN jsonb_build_object('available_balance', v_new_balance);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- create_funding_commitment: atomic commit with overcommitment prevention
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_funding_commitment(
  p_lender_id UUID,
  p_loan_id UUID,
  p_amount INTEGER
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_loan loans%ROWTYPE;
  v_wallet wallets%ROWTYPE;
  v_remaining INTEGER;
  v_share_percent DECIMAL(7,4);
  v_commitment_id UUID;
  v_expected_yield INTEGER;
BEGIN
  -- Lock both rows to prevent concurrent races
  SELECT * INTO v_loan FROM loans WHERE id = p_loan_id FOR UPDATE;
  SELECT * INTO v_wallet FROM wallets WHERE user_id = p_lender_id FOR UPDATE;

  IF v_loan.status != 'funding' THEN
    RAISE EXCEPTION 'LOAN_NOT_FUNDING';
  END IF;

  IF v_wallet.available_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  v_remaining := v_loan.approved_amount - v_loan.amount_funded;
  IF p_amount > v_remaining THEN
    RAISE EXCEPTION 'EXCEEDS_REMAINING:%', v_remaining;
  END IF;

  IF p_amount < 2500 THEN
    RAISE EXCEPTION 'BELOW_MINIMUM';
  END IF;

  v_share_percent := (p_amount::DECIMAL / v_loan.approved_amount) * 100;

  -- Estimate expected yield (simple estimate based on rate and term)
  v_expected_yield := ROUND(p_amount * v_loan.interest_rate * v_loan.term_months / 12);

  INSERT INTO funding_commitments(lender_id, loan_id, amount, share_percent, expected_yield, status)
  VALUES (p_lender_id, p_loan_id, p_amount, v_share_percent, v_expected_yield, 'active')
  RETURNING id INTO v_commitment_id;

  -- Move available → committed
  UPDATE wallets SET
    available_balance = available_balance - p_amount,
    committed_balance = committed_balance + p_amount,
    updated_at = now()
  WHERE user_id = p_lender_id;

  INSERT INTO transactions(user_id, wallet_id, type, amount, balance_after, related_loan_id, related_commitment_id, description)
  VALUES (
    p_lender_id, v_wallet.id, 'funding_commitment', -p_amount,
    v_wallet.available_balance - p_amount,
    p_loan_id, v_commitment_id,
    'Funding commitment'
  );

  -- Update loan funding progress
  UPDATE loans SET
    amount_funded = amount_funded + p_amount,
    funding_percent = ROUND(((amount_funded + p_amount)::DECIMAL / approved_amount) * 100, 2),
    lender_count = lender_count + 1,
    status = CASE WHEN (amount_funded + p_amount) >= approved_amount THEN 'fully_funded' ELSE status END,
    fully_funded_at = CASE WHEN (amount_funded + p_amount) >= approved_amount THEN now() ELSE fully_funded_at END,
    updated_at = now()
  WHERE id = p_loan_id;

  RETURN jsonb_build_object(
    'commitment_id', v_commitment_id,
    'share_percent', v_share_percent,
    'expected_yield', v_expected_yield,
    'fully_funded', (v_loan.amount_funded + p_amount) >= v_loan.approved_amount
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- disburse_loan: admin triggers disbursement after full funding
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION disburse_loan(
  p_loan_id UUID,
  p_admin_id UUID,
  p_first_payment_date DATE
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_loan loans%ROWTYPE;
  v_settings platform_settings%ROWTYPE;
  v_origination_fee INTEGER;
  v_net_disbursement INTEGER;
  v_borrower_wallet wallets%ROWTYPE;
  v_commitment RECORD;
  v_lender_wallet wallets%ROWTYPE;
BEGIN
  SELECT * INTO v_loan FROM loans WHERE id = p_loan_id FOR UPDATE;
  SELECT * INTO v_settings FROM platform_settings LIMIT 1;

  IF v_loan.status != 'fully_funded' THEN
    RAISE EXCEPTION 'LOAN_NOT_FULLY_FUNDED';
  END IF;

  v_origination_fee := ROUND(v_loan.approved_amount * v_settings.origination_fee_percent);
  v_net_disbursement := v_loan.approved_amount - v_origination_fee;

  -- Credit borrower wallet
  SELECT * INTO v_borrower_wallet FROM wallets WHERE user_id = v_loan.borrower_id FOR UPDATE;

  UPDATE wallets SET
    available_balance = available_balance + v_net_disbursement,
    updated_at = now()
  WHERE user_id = v_loan.borrower_id;

  INSERT INTO transactions(user_id, wallet_id, type, amount, balance_after, related_loan_id, description)
  VALUES (
    v_loan.borrower_id, v_borrower_wallet.id, 'disbursement', v_net_disbursement,
    v_borrower_wallet.available_balance + v_net_disbursement,
    p_loan_id, 'Loan disbursement'
  );

  -- Debit each lender committed balance (funds have been sent to borrower)
  FOR v_commitment IN
    SELECT fc.*, w.id AS wallet_id FROM funding_commitments fc
    JOIN wallets w ON w.user_id = fc.lender_id
    WHERE fc.loan_id = p_loan_id
  LOOP
    SELECT * INTO v_lender_wallet FROM wallets WHERE user_id = v_commitment.lender_id FOR UPDATE;

    UPDATE wallets SET
      committed_balance = committed_balance - v_commitment.amount,
      updated_at = now()
    WHERE user_id = v_commitment.lender_id;
  END LOOP;

  -- Origination fee transaction (platform revenue)
  INSERT INTO transactions(user_id, wallet_id, type, amount, balance_after, related_loan_id, description)
  VALUES (
    v_loan.borrower_id, v_borrower_wallet.id, 'origination_fee', -v_origination_fee,
    v_borrower_wallet.available_balance + v_net_disbursement,
    p_loan_id, 'Origination fee'
  );

  -- Activate loan
  UPDATE loans SET
    status = 'active',
    disbursed_at = now(),
    first_payment_date = p_first_payment_date,
    maturity_date = p_first_payment_date + INTERVAL '1 month' * (term_months - 1),
    origination_fee = v_origination_fee,
    origination_fee_percent = v_settings.origination_fee_percent,
    updated_at = now()
  WHERE id = p_loan_id;

  RETURN jsonb_build_object(
    'disbursed_amount', v_net_disbursement,
    'origination_fee', v_origination_fee
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- process_borrower_payment: handles repayment + distributes yield to all lenders
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION process_borrower_payment(
  p_loan_id UUID,
  p_schedule_id UUID,
  p_amount INTEGER
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_loan loans%ROWTYPE;
  v_schedule loan_schedule%ROWTYPE;
  v_borrower_wallet wallets%ROWTYPE;
  v_commitment RECORD;
  v_lender_wallet wallets%ROWTYPE;
  v_lender_principal INTEGER;
  v_lender_interest INTEGER;
  v_lender_total INTEGER;
  v_dist_id UUID;
  v_settings platform_settings%ROWTYPE;
  v_late_fee INTEGER := 0;
  v_total_paid INTEGER;
BEGIN
  SELECT * INTO v_loan FROM loans WHERE id = p_loan_id FOR UPDATE;
  SELECT * INTO v_schedule FROM loan_schedule WHERE id = p_schedule_id FOR UPDATE;
  SELECT * INTO v_settings FROM platform_settings LIMIT 1;
  SELECT * INTO v_borrower_wallet FROM wallets WHERE user_id = v_loan.borrower_id FOR UPDATE;

  IF v_schedule.status IN ('paid', 'waived') THEN
    RAISE EXCEPTION 'ALREADY_PAID';
  END IF;

  IF v_borrower_wallet.available_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  -- Add late fee if applicable
  v_late_fee := v_schedule.late_fee;

  v_total_paid := LEAST(p_amount, v_schedule.total_due + v_late_fee);

  -- Debit borrower
  UPDATE wallets SET
    available_balance = available_balance - v_total_paid,
    updated_at = now()
  WHERE user_id = v_loan.borrower_id;

  INSERT INTO transactions(user_id, wallet_id, type, amount, balance_after, related_loan_id, description)
  VALUES (
    v_loan.borrower_id, v_borrower_wallet.id, 'repayment', -v_total_paid,
    v_borrower_wallet.available_balance - v_total_paid,
    p_loan_id, 'Loan repayment installment #' || v_schedule.installment_number
  );

  -- Mark schedule paid
  UPDATE loan_schedule SET
    principal_paid = v_schedule.principal_due,
    interest_paid = v_schedule.interest_due,
    total_paid = v_total_paid,
    status = 'paid',
    paid_at = now()
  WHERE id = p_schedule_id;

  -- Distribute to each lender proportionally
  FOR v_commitment IN
    SELECT fc.* FROM funding_commitments fc
    WHERE fc.loan_id = p_loan_id AND fc.status IN ('active', 'repaying')
  LOOP
    SELECT * INTO v_lender_wallet FROM wallets WHERE user_id = v_commitment.lender_id FOR UPDATE;

    v_lender_principal := ROUND(v_schedule.principal_due * v_commitment.share_percent / 100);
    v_lender_interest := ROUND(v_schedule.interest_due * v_commitment.share_percent / 100);
    v_lender_total := v_lender_principal + v_lender_interest;

    -- Credit lender wallet
    UPDATE wallets SET
      available_balance = available_balance + v_lender_total,
      total_yield_earned = total_yield_earned + v_lender_interest,
      updated_at = now()
    WHERE user_id = v_commitment.lender_id;

    INSERT INTO transactions(user_id, wallet_id, type, amount, balance_after, related_loan_id, related_commitment_id, description)
    VALUES (
      v_commitment.lender_id, v_lender_wallet.id, 'yield_distribution', v_lender_total,
      v_lender_wallet.available_balance + v_lender_total,
      p_loan_id, v_commitment.id, 'Yield distribution'
    );

    INSERT INTO yield_distributions(commitment_id, schedule_id, principal_return, interest_return, total_return)
    VALUES (v_commitment.id, p_schedule_id, v_lender_principal, v_lender_interest, v_lender_total)
    RETURNING id INTO v_dist_id;

    -- Update actual yield on commitment
    UPDATE funding_commitments SET
      actual_yield = actual_yield + v_lender_interest,
      status = 'repaying'
    WHERE id = v_commitment.id;
  END LOOP;

  -- Check if all installments are paid → complete the loan
  IF NOT EXISTS (
    SELECT 1 FROM loan_schedule
    WHERE loan_id = p_loan_id AND status NOT IN ('paid', 'waived')
  ) THEN
    UPDATE loans SET status = 'completed', updated_at = now() WHERE id = p_loan_id;
    UPDATE funding_commitments SET status = 'completed', completed_at = now()
    WHERE loan_id = p_loan_id;
  END IF;

  RETURN jsonb_build_object('total_paid', v_total_paid, 'late_fee', v_late_fee);
END;
$$;
