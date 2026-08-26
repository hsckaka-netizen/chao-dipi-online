ALTER TABLE cdp_game_hero_skill_uses
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

CREATE INDEX IF NOT EXISTS cdp_game_hero_skill_uses_game_refund_idx
  ON cdp_game_hero_skill_uses (game_id, refunded_at);
