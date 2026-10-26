import { HERO_HOME_RULES, HERO_UNITS, HOME_UNIT_BY_ID } from "./hero-home.js";
import { WAR_EFFORT_RULES, validateWarEffortExchange } from "./server-war-effort.js";
import { randomUUID } from "node:crypto";

// Caller owns the transaction. Lock campaign before the account, as donations do.
export async function mutateWarEffort(client, accountId, input) {
  const campaignResult = await client.query(
    `SELECT * FROM cdp_war_effort_campaigns WHERE campaign_id = $1 FOR SHARE`,
    [WAR_EFFORT_RULES.campaignId]
  );
  const campaign = campaignResult.rows[0];
  if (!campaign?.completed_at) throw Object.assign(new Error("七项目标全部完成后才能领奖和兑换"), { status: 409 });
  await client.query(`SELECT account_id FROM cdp_hero_profiles WHERE account_id = $1::uuid FOR UPDATE`, [accountId]);
  await client.query(
    `INSERT INTO cdp_war_effort_players (campaign_id, account_id) VALUES ($1, $2::uuid)
     ON CONFLICT (campaign_id, account_id) DO NOTHING`, [WAR_EFFORT_RULES.campaignId, accountId]
  );
  const playerResult = await client.query(
    `SELECT * FROM cdp_war_effort_players WHERE campaign_id = $1 AND account_id = $2::uuid FOR UPDATE`,
    [WAR_EFFORT_RULES.campaignId, accountId]
  );
  const player = playerResult.rows[0];
  if (input.action === "claim") {
    if (player.reward_claimed_at) return { repeated: true };
    await client.query(`UPDATE cdp_war_effort_players SET reward_claimed_at = now(), reward_contribution = $3, updated_at = now()
      WHERE campaign_id = $1 AND account_id = $2::uuid`, [WAR_EFFORT_RULES.campaignId, accountId, WAR_EFFORT_RULES.completionContribution]);
    return { repeated: false };
  }
  const productId = String(input.productId || "").trim();
  const heroId = String(input.heroId || "").trim();
  const quantity = Number(input.quantity ?? 1);
  const requestId = String(input.requestId || "").trim();
  if (!requestId || requestId.length > 120) throw Object.assign(new Error("兑换请求编号无效"), { status: 400 });
  const repeated = await client.query(`SELECT product_id, hero_id, quantity, result_data
    FROM cdp_war_effort_exchanges WHERE account_id = $1::uuid AND request_id = $2`, [accountId, requestId]);
  if (repeated.rows[0]) {
    const previous = repeated.rows[0];
    if (previous.product_id !== productId || (previous.hero_id || "") !== heroId || Number(previous.quantity) !== quantity) {
      throw Object.assign(new Error("此请求编号已用于其他兑换，请刷新后重试"), { status: 409 });
    }
    return { repeated: true, exchange: previous.result_data };
  }
  const frame = await client.query(`SELECT 1 FROM cdp_cosmetic_entitlements
    WHERE account_id = $1::uuid AND cosmetic_type = 'avatar_frame' AND cosmetic_key = 'blackstone-vanguard'`, [accountId]);
  const { product, cost } = validateWarEffortExchange({
    campaign, player, productId, quantity, heroId, heroes: HERO_UNITS, frameOwned: Boolean(frame.rows[0])
  });
  const exchangeId = randomUUID();
  let received = `${product.name} ×${quantity}`;
  if (product.type === "hero") {
    const owned = await client.query(`SELECT stars FROM cdp_hero_units
      WHERE account_id = $1::uuid AND unit_id = $2 FOR UPDATE`, [accountId, heroId]);
    const unit = HOME_UNIT_BY_ID.get(heroId);
    if (!owned.rows[0]) {
      const fragments = (quantity - 1) * HERO_HOME_RULES.ssrDuplicateFragments;
      await client.query(`INSERT INTO cdp_hero_units (account_id, unit_id, exclusive_fragments)
        VALUES ($1::uuid, $2, $3)`, [accountId, heroId, fragments]);
      received = `${unit.name}（1星）${fragments ? `，另获 ${fragments} 专属碎片` : ""}`;
    } else if (Number(owned.rows[0].stars) < 5) {
      const fragments = quantity * HERO_HOME_RULES.ssrDuplicateFragments;
      await client.query(`UPDATE cdp_hero_units SET exclusive_fragments = exclusive_fragments + $3, updated_at = now()
        WHERE account_id = $1::uuid AND unit_id = $2`, [accountId, heroId, fragments]);
      received = `${unit.name}专属碎片 ×${fragments}`;
    } else {
      const fragments = quantity * HERO_HOME_RULES.maxSsrDuplicateUniversalFragments;
      await client.query(`UPDATE cdp_hero_profiles SET universal_fragments = universal_fragments + $2, updated_at = now()
        WHERE account_id = $1::uuid`, [accountId, fragments]);
      received = `通用碎片 ×${fragments}（${unit.name}已满星）`;
    }
  } else if (product.type === "item") {
    const inventory = await client.query(`INSERT INTO cdp_consumable_inventory (account_id, item_id, available_quantity)
      VALUES ($1::uuid, $2, $3) ON CONFLICT (account_id, item_id) DO UPDATE SET
      available_quantity = cdp_consumable_inventory.available_quantity + $3, updated_at = now()
      RETURNING available_quantity, reserved_quantity`, [accountId, product.id, quantity]);
    await client.query(`INSERT INTO cdp_consumable_ledger (
      account_id, item_id, available_delta, reserved_delta, available_after, reserved_after, reason, idempotency_key, detail
    ) VALUES ($1::uuid, $2, $3, 0, $4, $5, 'war_effort_exchange', $6, $7::jsonb)`, [
      accountId, product.id, quantity, inventory.rows[0].available_quantity, inventory.rows[0].reserved_quantity,
      `war_effort_exchange:${exchangeId}`, JSON.stringify({ campaignId: WAR_EFFORT_RULES.campaignId, exchangeId, cost })
    ]);
  } else {
    const granted = await client.query(`INSERT INTO cdp_cosmetic_entitlements
      (account_id, cosmetic_type, cosmetic_key, source, source_id)
      VALUES ($1::uuid, 'avatar_frame', $2, 'war_effort', $3)
      ON CONFLICT DO NOTHING RETURNING cosmetic_key`, [accountId, product.id, exchangeId]);
    if (!granted.rows[0]) throw Object.assign(new Error("已经拥有此头像框"), { status: 409 });
  }
  await client.query(`UPDATE cdp_war_effort_players SET spent_contribution = spent_contribution + $3,
    ssr_exchange_count = ssr_exchange_count + $4, updated_at = now()
    WHERE campaign_id = $1 AND account_id = $2::uuid`, [
    WAR_EFFORT_RULES.campaignId, accountId, cost, product.type === "hero" ? quantity : 0
  ]);
  const exchange = { id: exchangeId, productId, heroId: heroId || null, quantity, cost, received };
  await client.query(`INSERT INTO cdp_war_effort_exchanges
    (exchange_id, campaign_id, account_id, request_id, product_id, hero_id, quantity, cost, result_data)
    VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, $7, $8, $9::jsonb)`, [
    exchangeId, WAR_EFFORT_RULES.campaignId, accountId, requestId, productId, heroId || null, quantity, cost, JSON.stringify(exchange)
  ]);
  return { repeated: false, exchange };
}
