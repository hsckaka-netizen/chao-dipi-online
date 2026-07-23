-- Leaderboard wins follow the final settlement score, including dragged fives,
-- bottom cards, throw failures, and other score adjustments.
UPDATE cdp_game_players
SET won = (game_score > 0)
WHERE won IS DISTINCT FROM (game_score > 0);
