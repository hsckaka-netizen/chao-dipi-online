ALTER TABLE cdp_games
  ALTER COLUMN winner_team DROP NOT NULL;

ALTER TABLE cdp_game_players
  ALTER COLUMN won DROP NOT NULL;

ALTER TABLE cdp_games
  DROP CONSTRAINT IF EXISTS cdp_games_winner_team_check;

ALTER TABLE cdp_games
  ADD CONSTRAINT cdp_games_winner_team_check
  CHECK (winner_team IS NULL OR winner_team IN ('banker', 'idle'));
