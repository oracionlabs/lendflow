CREATE TABLE platform_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origination_fee_percent DECIMAL(5,4) DEFAULT 0.0200,
  late_fee_flat INTEGER DEFAULT 2500,
  late_fee_daily_percent DECIMAL(7,6) DEFAULT 0.000500,
  grace_period_days INTEGER DEFAULT 5,
  default_threshold_missed INTEGER DEFAULT 3,
  min_loan_amount INTEGER DEFAULT 100000,
  max_loan_amount INTEGER DEFAULT 5000000,
  min_commitment_amount INTEGER DEFAULT 2500,
  supported_terms INTEGER[] DEFAULT '{6,12,18,24,36,48,60}',
  credit_grade_rates JSONB DEFAULT '{"A":0.0550,"B":0.0850,"C":0.1200,"D":0.1650,"E":0.2100}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER platform_settings_updated_at BEFORE UPDATE ON platform_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Insert single default settings row
INSERT INTO platform_settings DEFAULT VALUES;

-- Audit log for settings changes
CREATE TABLE settings_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_by UUID REFERENCES users(id),
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN (
    'loan_status', 'payment_due', 'payment_received', 'commitment_funded',
    'yield_received', 'loan_completed', 'loan_non_performing', 'badge', 'system'
  )),
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  channel TEXT DEFAULT 'both' CHECK (channel IN ('in_app', 'email', 'both')),
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  email_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) UNIQUE,
  loan_status_in_app BOOLEAN DEFAULT TRUE,
  loan_status_email BOOLEAN DEFAULT TRUE,
  payment_due_in_app BOOLEAN DEFAULT TRUE,
  payment_due_email BOOLEAN DEFAULT TRUE,
  yield_received_in_app BOOLEAN DEFAULT TRUE,
  yield_received_email BOOLEAN DEFAULT TRUE,
  system_in_app BOOLEAN DEFAULT TRUE,
  system_email BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER notification_preferences_updated_at BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
