-- Keep historical skill-use/payment facts intact; retire only live cooldown state.
UPDATE cdp_hero_units SET skill_cooldown = 0, updated_at = now() WHERE skill_cooldown <> 0;
UPDATE cdp_game_hero_hires SET skill_cooldown = 0 WHERE skill_cooldown <> 0;
