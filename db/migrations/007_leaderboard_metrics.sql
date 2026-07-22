DROP VIEW IF EXISTS cdp_player_statistics;
CREATE VIEW cdp_player_statistics WITH (security_invoker = true) AS
WITH identified_players AS (
  SELECT
    player.*,
    coalesce(player.account_id::text, 'profile:' || player.profile_id) AS identity_key
  FROM cdp_game_players player
  WHERE NOT player.is_ai
    AND (player.account_id IS NOT NULL OR player.profile_id IS NOT NULL)
),
latest_identity AS (
  SELECT DISTINCT ON (player.identity_key)
    player.identity_key,
    player.account_id,
    player.profile_id,
    player.name_snapshot,
    player.avatar_url_snapshot
  FROM identified_players player
  JOIN cdp_games game ON game.game_id = player.game_id
  ORDER BY player.identity_key, game.finished_at DESC
),
base AS (
  SELECT
    player.identity_key,
    count(*)::integer AS games_played,
    count(*) FILTER (WHERE player.won)::integer AS wins,
    count(*) FILTER (WHERE NOT player.won)::integer AS losses,
    coalesce(sum(player.game_score), 0)::numeric(12, 2) AS total_score,
    coalesce(avg(player.game_score), 0)::numeric(12, 2) AS average_score,
    coalesce(sum(player.trick_score), 0)::integer AS total_trick_score,
    count(*) FILTER (WHERE player.role = '庄家')::integer AS banker_games,
    count(*) FILTER (WHERE player.role = '庄家' AND player.won)::integer AS banker_wins,
    coalesce(sum(player.game_score) FILTER (WHERE player.role = '庄家'), 0)::numeric(12, 2) AS banker_score,
    count(*) FILTER (WHERE player.role = '狗腿')::integer AS dogleg_games,
    count(*) FILTER (WHERE player.role = '狗腿' AND player.won)::integer AS dogleg_wins,
    coalesce(sum(player.game_score) FILTER (WHERE player.role = '狗腿'), 0)::numeric(12, 2) AS dogleg_score,
    count(*) FILTER (WHERE player.role = '闲家')::integer AS idle_games,
    count(*) FILTER (WHERE player.role = '闲家' AND player.won)::integer AS idle_wins,
    coalesce(sum(player.game_score) FILTER (WHERE player.role = '闲家'), 0)::numeric(12, 2) AS idle_score,
    coalesce(sum(player.dragged_red_fives), 0)::integer AS dragged_red_fives,
    coalesce(sum(player.dragged_diamond_fives), 0)::integer AS dragged_diamond_fives,
    coalesce(sum(player.throw_failures), 0)::integer AS throw_failures,
    coalesce(sum(coalesce(nullif(player.evaluation_data ->> 'enemyDraggedRedFives', '')::numeric, 0)), 0)::integer AS opponent_dragged_red_fives,
    coalesce(sum(coalesce(nullif(player.evaluation_data ->> 'enemyDraggedDiamondFives', '')::numeric, 0)), 0)::integer AS opponent_dragged_diamond_fives,
    coalesce(sum(coalesce(nullif(player.evaluation_data ->> 'teammateDraggedRedFives', '')::numeric, 0)), 0)::integer AS teammate_dragged_red_fives,
    coalesce(sum(coalesce(nullif(player.evaluation_data ->> 'teammateDraggedDiamondFives', '')::numeric, 0)), 0)::integer AS teammate_dragged_diamond_fives,
    coalesce(sum(coalesce(nullif(player.evaluation_data ->> 'wonTricks', '')::numeric, 0)), 0)::integer AS won_tricks,
    coalesce(sum(jsonb_array_length(game.trick_history)), 0)::integer AS total_tricks,
    count(*) FILTER (WHERE game.bottom_winner_room_player_id = player.room_player_id)::integer AS bottom_wins
  FROM identified_players player
  JOIN cdp_games game ON game.game_id = player.game_id
  GROUP BY player.identity_key
),
tag_totals AS (
  SELECT
    player.identity_key,
    count(*) FILTER (WHERE tag.tag_code = 'mvp')::integer AS mvp_count,
    count(*) FILTER (WHERE tag.tag_code = 'couch')::integer AS couch_count,
    count(*) FILTER (WHERE tag.tag_code = 'pit')::integer AS pit_count,
    count(*) FILTER (WHERE tag.tag_code = 'support')::integer AS support_count,
    count(*) FILTER (WHERE tag.tag_code = 'stiff')::integer AS stiff_count,
    count(*) FILTER (WHERE tag.tag_code = 'stiffest')::integer AS stiffest_count,
    count(*) FILTER (WHERE tag.tag_code = 'thunder')::integer AS thunder_count,
    count(*) FILTER (WHERE tag.tag_code = 'precision')::integer AS precision_count,
    count(*) FILTER (WHERE tag.tag_code = 'god')::integer AS god_count,
    count(*) FILTER (WHERE tag.tag_code = 'heaven')::integer AS heaven_count,
    count(*) FILTER (WHERE tag.tag_code = 'god-pit')::integer AS god_pit_count,
    count(*) FILTER (WHERE tag.tag_code = 'exhausted')::integer AS exhausted_count,
    count(*) FILTER (WHERE tag.tag_code = 'pillar')::integer AS pillar_count
  FROM cdp_game_tags tag
  JOIN identified_players player
    ON player.game_id = tag.game_id AND player.room_player_id = tag.room_player_id
  GROUP BY player.identity_key
)
SELECT
  latest.account_id,
  latest.profile_id,
  account.username,
  latest.name_snapshot AS latest_name,
  latest.avatar_url_snapshot AS latest_avatar_url,
  profile.avatar_frame,
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
  base.banker_score,
  base.dogleg_games,
  base.dogleg_wins,
  base.dogleg_score,
  base.idle_games,
  base.idle_wins,
  base.idle_score,
  base.dragged_red_fives,
  base.dragged_diamond_fives,
  base.throw_failures,
  base.opponent_dragged_red_fives,
  base.opponent_dragged_diamond_fives,
  base.teammate_dragged_red_fives,
  base.teammate_dragged_diamond_fives,
  base.won_tricks,
  base.total_tricks,
  base.bottom_wins,
  coalesce(tags.mvp_count, 0) AS mvp_count,
  coalesce(tags.couch_count, 0) AS couch_count,
  coalesce(tags.pit_count, 0) AS pit_count,
  coalesce(tags.support_count, 0) AS support_count,
  coalesce(tags.stiff_count, 0) AS stiff_count,
  coalesce(tags.stiffest_count, 0) AS stiffest_count,
  coalesce(tags.thunder_count, 0) AS thunder_count,
  coalesce(tags.precision_count, 0) AS precision_count,
  coalesce(tags.god_count, 0) AS god_count,
  coalesce(tags.heaven_count, 0) AS heaven_count,
  coalesce(tags.god_pit_count, 0) AS god_pit_count,
  coalesce(tags.exhausted_count, 0) AS exhausted_count,
  coalesce(tags.pillar_count, 0) AS pillar_count
FROM base
JOIN latest_identity latest ON latest.identity_key = base.identity_key
LEFT JOIN cdp_accounts account ON account.account_id = latest.account_id
LEFT JOIN cdp_player_profiles profile ON profile.profile_id = latest.profile_id
LEFT JOIN tag_totals tags ON tags.identity_key = base.identity_key;
