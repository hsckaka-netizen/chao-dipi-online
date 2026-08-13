UPDATE cdp_player_profiles
SET avatar_frame = '',
    updated_at = now()
WHERE avatar_frame = 'vip-legend';

UPDATE cdp_shop_products
SET is_listed = false,
    updated_at = now()
WHERE product_id = 'avatar-frame:vip-legend';

ALTER TABLE cdp_player_profiles
  DROP CONSTRAINT IF EXISTS cdp_player_profiles_avatar_frame_check;

ALTER TABLE cdp_player_profiles
  ADD CONSTRAINT cdp_player_profiles_avatar_frame_check
  CHECK (avatar_frame = '' OR avatar_frame ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$');
