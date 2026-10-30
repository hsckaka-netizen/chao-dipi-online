ALTER TABLE cdp_hero_advancements
  DROP CONSTRAINT IF EXISTS cdp_hero_advancements_sr_unit_id_check;
ALTER TABLE cdp_hero_advancements
  ADD CONSTRAINT cdp_hero_advancements_sr_unit_id_check
  CHECK (sr_unit_id IN ('jiang-zha', 'deng-huang', 'gelu', 'xiaoxu'));
