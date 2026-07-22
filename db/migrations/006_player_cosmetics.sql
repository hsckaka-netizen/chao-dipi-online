ALTER TABLE cdp_player_profiles
  ADD COLUMN IF NOT EXISTS card_skin varchar(32) NOT NULL DEFAULT '';

ALTER TABLE cdp_player_profiles
  DROP CONSTRAINT IF EXISTS cdp_player_profiles_avatar_frame_check;

ALTER TABLE cdp_player_profiles
  ADD CONSTRAINT cdp_player_profiles_avatar_frame_check
  CHECK (avatar_frame IN ('', 'vip', 'emerald', 'champion', 'violet', 'stormwind', 'idol', 'hellfire', 'blood-elf'));

ALTER TABLE cdp_player_profiles
  DROP CONSTRAINT IF EXISTS cdp_player_profiles_card_skin_check;

ALTER TABLE cdp_player_profiles
  ADD CONSTRAINT cdp_player_profiles_card_skin_check
  CHECK (card_skin IN ('', 'emerald', 'champion', 'violet', 'stormwind', 'idol', 'hellfire', 'blood-elf'));
