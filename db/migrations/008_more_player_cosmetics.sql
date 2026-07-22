ALTER TABLE cdp_player_profiles
  DROP CONSTRAINT IF EXISTS cdp_player_profiles_avatar_frame_check;

ALTER TABLE cdp_player_profiles
  ADD CONSTRAINT cdp_player_profiles_avatar_frame_check
  CHECK (avatar_frame IN ('', 'vip', 'emerald', 'champion', 'violet', 'stormwind', 'idol', 'hellfire', 'blood-elf', 'endless-winter', 'cr7', 'paladin', 'vip-legend'));

ALTER TABLE cdp_player_profiles
  DROP CONSTRAINT IF EXISTS cdp_player_profiles_card_skin_check;

ALTER TABLE cdp_player_profiles
  ADD CONSTRAINT cdp_player_profiles_card_skin_check
  CHECK (card_skin IN ('', 'emerald', 'champion', 'violet', 'stormwind', 'idol', 'hellfire', 'blood-elf', 'endless-winter', 'cr7', 'paladin', 'vip-legend'));
