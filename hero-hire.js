import { HERO_HIRE_COST } from "./hero-draft.js";
import { HERO_HOME_RULES, HERO_UNITS } from "./hero-home.js";

function hireError(message, status = 409) {
  return Object.assign(new Error(message), { status });
}

// The caller validates the private draft. The account lock serializes payment retries.
export async function chargeHeroHire(client, accountId, gameId, unitId) {
  if (!HERO_UNITS.some((hero) => hero.id === unitId)) throw hireError("候选英雄不存在", 404);
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL statement_timeout = '2000ms'");
    await client.query("INSERT INTO cdp_hero_profiles (account_id) VALUES ($1::uuid) ON CONFLICT (account_id) DO NOTHING", [accountId]);
    await client.query("SELECT account_id FROM cdp_hero_profiles WHERE account_id = $1::uuid FOR UPDATE", [accountId]);
    const existing = await client.query(
      "SELECT unit_id, cost, balance_after, refunded_at FROM cdp_game_hero_hires WHERE game_id = $1::uuid AND account_id = $2::uuid FOR UPDATE",
      [gameId, accountId]
    );
    if (existing.rows[0]) {
      const row = existing.rows[0];
      if (row.unit_id !== unitId || row.refunded_at) throw hireError("本局雇佣记录已锁定");
      await client.query("COMMIT");
      return { cost: Number(row.cost), balanceAfter: Number(row.balance_after), repeated: true };
    }
    const wallet = await client.query(
      `UPDATE cdp_diamond_wallets SET balance = balance - $2, updated_at = now()
       WHERE account_id = $1::uuid AND balance >= $2 RETURNING balance`, [accountId, HERO_HIRE_COST]
    );
    if (!wallet.rows[0]) throw hireError("钻石不足，需要300钻石才能雇佣");
    const balanceAfter = Number(wallet.rows[0].balance);
    await client.query(
      `INSERT INTO cdp_game_hero_hires (game_id, account_id, unit_id, cost, balance_after)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5)`, [gameId, accountId, unitId, HERO_HIRE_COST, balanceAfter]
    );
    await client.query(
      `INSERT INTO cdp_diamond_ledger (account_id, amount, balance_after, reason, rules_version, idempotency_key, detail)
       VALUES ($1::uuid, $2, $3, 'hero_hire', $4, $5, $6::jsonb)`,
      [accountId, -HERO_HIRE_COST, balanceAfter, HERO_HOME_RULES.version, `hero_hire:${gameId}:${accountId}`, JSON.stringify({ gameId, unitId, stars: 1 })]
    );
    await client.query("COMMIT");
    return { cost: HERO_HIRE_COST, balanceAfter };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function refundHeroHires(client, gameId) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL statement_timeout = '2000ms'");
    const hires = await client.query(
      `SELECT account_id, unit_id, cost FROM cdp_game_hero_hires
       WHERE game_id = $1::uuid AND refunded_at IS NULL ORDER BY account_id FOR UPDATE`, [gameId]
    );
    for (const hire of hires.rows) {
      const wallet = await client.query(
        `UPDATE cdp_diamond_wallets SET balance = balance + $2, updated_at = now()
         WHERE account_id = $1::uuid RETURNING balance`, [hire.account_id, Number(hire.cost)]
      );
      if (!wallet.rows[0]) throw hireError("雇佣费用返还失败");
      await client.query(
        `INSERT INTO cdp_diamond_ledger (account_id, amount, balance_after, reason, rules_version, idempotency_key, detail)
         VALUES ($1::uuid, $2, $3, 'hero_hire_refund', $4, $5, $6::jsonb)`,
        [hire.account_id, Number(hire.cost), Number(wallet.rows[0].balance), HERO_HOME_RULES.version,
          `hero_hire_refund:${gameId}:${hire.account_id}`, JSON.stringify({ gameId, unitId: hire.unit_id })]
      );
      await client.query(
        "UPDATE cdp_game_hero_hires SET refunded_at = now() WHERE game_id = $1::uuid AND account_id = $2::uuid", [gameId, hire.account_id]
      );
    }
    await client.query("COMMIT");
    return { refunded: hires.rows.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function hiredSkillOwnership(client, accountId, gameId, unitId) {
  const result = await client.query(
    `SELECT skill_cooldown FROM cdp_game_hero_hires
     WHERE game_id = $1::uuid AND account_id = $2::uuid AND unit_id = $3 AND refunded_at IS NULL FOR UPDATE`,
    [gameId, accountId, unitId]
  );
  if (!result.rows[0]) throw hireError("本局雇佣资格已失效", 403);
  return { stars: 1, skill_cooldown: result.rows[0].skill_cooldown };
}
