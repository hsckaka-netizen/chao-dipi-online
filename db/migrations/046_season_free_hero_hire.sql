-- Free hires retain their one-game receipt, but do not create zero-value diamond ledgers.
ALTER TABLE cdp_game_hero_hires DROP CONSTRAINT IF EXISTS cdp_game_hero_hires_cost_check;
ALTER TABLE cdp_game_hero_hires
  ADD CONSTRAINT cdp_game_hero_hires_cost_check CHECK (cost IN (0, 300));
