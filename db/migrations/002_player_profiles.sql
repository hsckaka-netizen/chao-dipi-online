CREATE TABLE IF NOT EXISTS cdp_player_profiles (
  profile_id text PRIMARY KEY,
  account_id uuid UNIQUE,
  display_name varchar(64) NOT NULL,
  avatar_url text NOT NULL DEFAULT '',
  avatar_version integer NOT NULL DEFAULT 0,
  avatar_frame varchar(32) NOT NULL DEFAULT '',
  play_effect varchar(32) NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cdp_player_profiles_avatar_version_check CHECK (avatar_version >= 0),
  CONSTRAINT cdp_player_profiles_avatar_frame_check CHECK (avatar_frame IN ('', 'vip')),
  CONSTRAINT cdp_player_profiles_play_effect_check CHECK (play_effect IN ('', 'fireworks'))
);

CREATE INDEX IF NOT EXISTS cdp_player_profiles_account_idx
  ON cdp_player_profiles (account_id)
  WHERE account_id IS NOT NULL;

ALTER TABLE cdp_player_profiles ENABLE ROW LEVEL SECURITY;
