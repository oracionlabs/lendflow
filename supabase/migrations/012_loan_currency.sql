-- Migration 012: Per-loan currency set by lender
ALTER TABLE lender_listings
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';
