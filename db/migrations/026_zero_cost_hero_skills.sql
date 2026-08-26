ALTER TABLE cdp_game_hero_skill_uses
  DROP CONSTRAINT IF EXISTS cdp_game_hero_skill_uses_cost_check;

ALTER TABLE cdp_game_hero_skill_uses
  ADD CONSTRAINT cdp_game_hero_skill_uses_cost_check CHECK (cost >= 0);
