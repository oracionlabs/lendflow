-- Migration 011: Add currency setting to platform_settings
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';
