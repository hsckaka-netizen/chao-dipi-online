ALTER TABLE cdp_games
  ADD COLUMN IF NOT EXISTS game_mode varchar(16) NOT NULL DEFAULT 'pvp',
  ADD COLUMN IF NOT EXISTS play_mode varchar(16) NOT NULL DEFAULT 'brawl';

UPDATE cdp_games
SET game_mode = 'pvp', play_mode = 'brawl'
WHERE game_mode IS NULL OR play_mode IS NULL;

ALTER TABLE cdp_games
  DROP CONSTRAINT IF EXISTS cdp_games_game_mode_check,
  DROP CONSTRAINT IF EXISTS cdp_games_play_mode_check;

ALTER TABLE cdp_games
  ADD CONSTRAINT cdp_games_game_mode_check CHECK (game_mode IN ('pvp', 'pve')),
  ADD CONSTRAINT cdp_games_play_mode_check CHECK (play_mode IN ('brawl', 'team'));

CREATE INDEX IF NOT EXISTS cdp_games_mode_season_idx
  ON cdp_games (game_mode, play_mode, player_count, finished_at DESC);
