ALTER TABLE cdp_player_profiles
  ADD COLUMN IF NOT EXISTS avatar_updated_at timestamptz;

CREATE TABLE IF NOT EXISTS cdp_accounts (
  account_id uuid PRIMARY KEY,
  username varchar(32) NOT NULL,
  auth_email text NOT NULL UNIQUE,
  role varchar(16) NOT NULL,
  profile_id text UNIQUE REFERENCES cdp_player_profiles(profile_id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  CONSTRAINT cdp_accounts_role_check CHECK (role IN ('admin', 'player')),
  CONSTRAINT cdp_accounts_player_profile_check CHECK (role = 'admin' OR profile_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS cdp_accounts_username_key
  ON cdp_accounts (lower(username));

CREATE INDEX IF NOT EXISTS cdp_accounts_profile_idx
  ON cdp_accounts (profile_id)
  WHERE profile_id IS NOT NULL;

ALTER TABLE cdp_accounts ENABLE ROW LEVEL SECURITY;
