ALTER TABLE cdp_shop_products
  ADD COLUMN IF NOT EXISTS asset_url text NOT NULL DEFAULT '';

ALTER TABLE cdp_shop_products
  ADD COLUMN IF NOT EXISTS asset_version varchar(64) NOT NULL DEFAULT '';

ALTER TABLE cdp_player_profiles
  DROP CONSTRAINT IF EXISTS cdp_player_profiles_avatar_frame_check;

ALTER TABLE cdp_player_profiles
  ADD CONSTRAINT cdp_player_profiles_avatar_frame_check
  CHECK (avatar_frame = '' OR avatar_frame ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$');
