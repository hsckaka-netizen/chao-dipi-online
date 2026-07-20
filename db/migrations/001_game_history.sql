CREATE TABLE IF NOT EXISTS cdp_schema_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cdp_games (
  game_id uuid PRIMARY KEY,
  room_code varchar(12) NOT NULL,
  started_at timestamptz,
  finished_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  rules_version varchar(32) NOT NULL,
  player_count smallint NOT NULL,
  call_mode varchar(32) NOT NULL,
  call_mode_name varchar(64) NOT NULL,
  banker_bid_score integer,
  total_game_points integer NOT NULL,
  trump_suit varchar(8),
  banker_room_player_id text,
  banker_profile_id text,
  dogleg_card jsonb,
  dogleg_profile_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  threshold integer NOT NULL,
  idle_score integer NOT NULL,
  score_diff integer NOT NULL,
  winner_team varchar(16) NOT NULL,
  bottom_winner_room_player_id text,
  bottom_winner_profile_id text,
  bottom_winner_team varchar(16),
  bottom_points integer NOT NULL DEFAULT 0,
  bottom_cards jsonb NOT NULL DEFAULT '[]'::jsonb,
  removed_cards jsonb NOT NULL DEFAULT '[]'::jsonb,
  setup_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  trick_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT cdp_games_winner_team_check CHECK (winner_team IN ('banker', 'idle'))
);

CREATE INDEX IF NOT EXISTS cdp_games_finished_at_idx ON cdp_games (finished_at DESC);
CREATE INDEX IF NOT EXISTS cdp_games_room_code_idx ON cdp_games (room_code, finished_at DESC);

CREATE TABLE IF NOT EXISTS cdp_game_players (
  game_id uuid NOT NULL REFERENCES cdp_games(game_id) ON DELETE CASCADE,
  room_player_id text NOT NULL,
  profile_id text,
  account_id uuid,
  seat_index smallint NOT NULL,
  is_ai boolean NOT NULL DEFAULT false,
  name_snapshot varchar(64) NOT NULL,
  avatar_url_snapshot text NOT NULL DEFAULT '',
  role varchar(32) NOT NULL,
  team varchar(16) NOT NULL,
  won boolean NOT NULL,
  trick_score integer NOT NULL DEFAULT 0,
  game_score numeric(10, 2) NOT NULL DEFAULT 0,
  dragged_red_fives integer NOT NULL DEFAULT 0,
  dragged_diamond_fives integer NOT NULL DEFAULT 0,
  throw_failures integer NOT NULL DEFAULT 0,
  evaluation_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (game_id, room_player_id),
  CONSTRAINT cdp_game_players_team_check CHECK (team IN ('banker', 'idle'))
);

CREATE INDEX IF NOT EXISTS cdp_game_players_profile_idx
  ON cdp_game_players (profile_id, game_id)
  WHERE profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cdp_game_players_account_idx
  ON cdp_game_players (account_id, game_id)
  WHERE account_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS cdp_game_tags (
  game_id uuid NOT NULL,
  room_player_id text NOT NULL,
  tag_code varchar(32) NOT NULL,
  tag_label varchar(32) NOT NULL,
  tag_title text NOT NULL DEFAULT '',
  PRIMARY KEY (game_id, room_player_id, tag_code),
  FOREIGN KEY (game_id, room_player_id)
    REFERENCES cdp_game_players(game_id, room_player_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS cdp_game_tags_code_idx ON cdp_game_tags (tag_code, game_id);

DROP VIEW IF EXISTS cdp_player_statistics;
CREATE VIEW cdp_player_statistics WITH (security_invoker = true) AS
WITH latest_profile AS (
  SELECT DISTINCT ON (player.profile_id)
    player.profile_id,
    player.name_snapshot,
    player.avatar_url_snapshot
  FROM cdp_game_players player
  JOIN cdp_games game ON game.game_id = player.game_id
  WHERE player.profile_id IS NOT NULL AND NOT player.is_ai
  ORDER BY player.profile_id, game.finished_at DESC
),
base AS (
  SELECT
    player.profile_id,
    count(*)::integer AS games_played,
    count(*) FILTER (WHERE player.won)::integer AS wins,
    count(*) FILTER (WHERE NOT player.won)::integer AS losses,
    coalesce(sum(player.game_score), 0)::numeric(12, 2) AS total_score,
    coalesce(avg(player.game_score), 0)::numeric(12, 2) AS average_score,
    coalesce(sum(player.trick_score), 0)::integer AS total_trick_score,
    count(*) FILTER (WHERE player.team = 'banker')::integer AS banker_games,
    count(*) FILTER (WHERE player.team = 'banker' AND player.won)::integer AS banker_wins,
    count(*) FILTER (WHERE player.team = 'idle')::integer AS idle_games,
    count(*) FILTER (WHERE player.team = 'idle' AND player.won)::integer AS idle_wins,
    coalesce(sum(player.dragged_red_fives), 0)::integer AS dragged_red_fives,
    coalesce(sum(player.dragged_diamond_fives), 0)::integer AS dragged_diamond_fives,
    coalesce(sum(player.throw_failures), 0)::integer AS throw_failures
  FROM cdp_game_players player
  WHERE player.profile_id IS NOT NULL AND NOT player.is_ai
  GROUP BY player.profile_id
),
tag_totals AS (
  SELECT
    player.profile_id,
    count(*) FILTER (WHERE tag.tag_code = 'mvp')::integer AS mvp_count,
    count(*) FILTER (WHERE tag.tag_code = 'couch')::integer AS couch_count,
    count(*) FILTER (WHERE tag.tag_code = 'pit')::integer AS pit_count,
    count(*) FILTER (WHERE tag.tag_code = 'support')::integer AS support_count,
    count(*) FILTER (WHERE tag.tag_code = 'stiff')::integer AS stiff_count,
    count(*) FILTER (WHERE tag.tag_code = 'stiffest')::integer AS stiffest_count,
    count(*) FILTER (WHERE tag.tag_code = 'thunder')::integer AS thunder_count,
    count(*) FILTER (WHERE tag.tag_code = 'precision')::integer AS precision_count
  FROM cdp_game_tags tag
  JOIN cdp_game_players player
    ON player.game_id = tag.game_id AND player.room_player_id = tag.room_player_id
  WHERE player.profile_id IS NOT NULL AND NOT player.is_ai
  GROUP BY player.profile_id
)
SELECT
  base.profile_id,
  latest.name_snapshot AS latest_name,
  latest.avatar_url_snapshot AS latest_avatar_url,
  base.games_played,
  base.wins,
  base.losses,
  CASE WHEN base.games_played > 0
    THEN round(base.wins::numeric * 100 / base.games_played, 2)
    ELSE 0
  END AS win_rate,
  base.total_score,
  base.average_score,
  base.total_trick_score,
  base.banker_games,
  base.banker_wins,
  base.idle_games,
  base.idle_wins,
  base.dragged_red_fives,
  base.dragged_diamond_fives,
  base.throw_failures,
  coalesce(tags.mvp_count, 0) AS mvp_count,
  coalesce(tags.couch_count, 0) AS couch_count,
  coalesce(tags.pit_count, 0) AS pit_count,
  coalesce(tags.support_count, 0) AS support_count,
  coalesce(tags.stiff_count, 0) AS stiff_count,
  coalesce(tags.stiffest_count, 0) AS stiffest_count,
  coalesce(tags.thunder_count, 0) AS thunder_count,
  coalesce(tags.precision_count, 0) AS precision_count
FROM base
JOIN latest_profile latest ON latest.profile_id = base.profile_id
LEFT JOIN tag_totals tags ON tags.profile_id = base.profile_id;

ALTER TABLE cdp_schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_game_tags ENABLE ROW LEVEL SECURITY;
