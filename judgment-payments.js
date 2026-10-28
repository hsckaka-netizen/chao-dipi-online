import { HERO_HOME_RULES } from './hero-home.js';

const fee = HERO_HOME_RULES.shenYingwuEntryFee;
const keyFor = (gameId, accountId) => `judgment_entry:${gameId}:${accountId}`;
const conflict = message => Object.assign(new Error(message), { status: 409 });

// The caller owns the transaction. Serialize on the wallet before checking the
// receipt so concurrent requests and other purchases cannot spend the same funds.
export async function chargeJudgmentEntryFromClient(client, { accountId, gameId, trialId, targetPlayerId }) {
  await client.query(`INSERT INTO cdp_diamond_wallets (account_id) VALUES ($1::uuid)
    ON CONFLICT (account_id) DO NOTHING`, [accountId]);
  await client.query(`SELECT balance FROM cdp_diamond_wallets WHERE account_id = $1::uuid FOR UPDATE`, [accountId]);
  const key = keyFor(gameId, accountId);
  const existing = await client.query(`SELECT amount, balance_after, detail FROM cdp_diamond_ledger
    WHERE idempotency_key = $1`, [key]);
  if (existing.rows[0]) {
    const receipt = existing.rows[0];
    if (receipt.detail.trialId !== trialId || receipt.detail.targetPlayerId !== targetPlayerId || Number(receipt.amount) !== -fee) {
      throw conflict('本局发起费已用于另一场审判');
    }
    return { cost: fee, balanceAfter: Number(receipt.balance_after), repeated: true };
  }
  const wallet = await client.query(`UPDATE cdp_diamond_wallets SET balance = balance - $2, updated_at = now()
    WHERE account_id = $1::uuid AND balance >= $2 RETURNING balance`, [accountId, fee]);
  if (!wallet.rows[0]) throw conflict(`发起审判需要${fee}钻石，当前余额不足`);
  const balanceAfter = Number(wallet.rows[0].balance);
  await client.query(`INSERT INTO cdp_diamond_ledger
    (account_id, amount, balance_after, reason, rules_version, idempotency_key, detail)
    VALUES ($1::uuid, $2, $3, 'judgment_entry', $4, $5, $6::jsonb)`,
    [accountId, -fee, balanceAfter, HERO_HOME_RULES.judgmentVersion, key, JSON.stringify({ gameId, trialId, targetPlayerId })]);
  return { cost: fee, balanceAfter };
}

// Principal is refunded in the final game transaction, independently of earned
// diamonds. It never raises lifetime_earned or receives any reward multiplier.
export async function refundSuccessfulJudgmentEntries(client, record) {
  for (const trial of record.result?.judgments?.trials || []) {
    if (!trial.passed || trial.entryFeePaid !== fee) continue;
    const player = record.players.find(player => player.roomPlayerId === trial.ownerId);
    if (!player?.accountId || player.isAi) throw conflict('审判发起人账号不存在');
    await client.query(`SELECT balance FROM cdp_diamond_wallets WHERE account_id = $1::uuid FOR UPDATE`, [player.accountId]);
    const entryKey = keyFor(record.gameId, player.accountId);
    const refundKey = `${entryKey}:refund`;
    const entry = await client.query(`SELECT amount, balance_after, detail FROM cdp_diamond_ledger
      WHERE idempotency_key = $1`, [entryKey]);
    const receipt = entry.rows[0];
    if (!receipt || Number(receipt.amount) !== -fee || receipt.detail.trialId !== trial.id || receipt.detail.targetPlayerId !== trial.targetId) {
      throw conflict('审判发起费记录不匹配，暂不能返还');
    }
    const existing = await client.query(`SELECT amount FROM cdp_diamond_ledger WHERE idempotency_key = $1`, [refundKey]);
    if (existing.rows[0]) continue;
    const wallet = await client.query(`UPDATE cdp_diamond_wallets SET balance = balance + $2, updated_at = now()
      WHERE account_id = $1::uuid RETURNING balance`, [player.accountId, fee]);
    if (!wallet.rows[0]) throw conflict('审判发起费返还失败');
    await client.query(`INSERT INTO cdp_diamond_ledger
      (account_id, amount, balance_after, reason, game_id, rules_version, idempotency_key, detail)
      VALUES ($1::uuid, $2, $3, 'judgment_entry_refund', $4::uuid, $5, $6, $7::jsonb)`,
      [player.accountId, fee, Number(wallet.rows[0].balance), record.gameId, HERO_HOME_RULES.judgmentVersion, refundKey,
        JSON.stringify({ trialId: trial.id, targetPlayerId: trial.targetId, entryKey })]);
  }
}
