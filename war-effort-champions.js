import { WAR_EFFORT_CHAMPION, WAR_EFFORT_RULES } from "./server-war-effort.js";

// The caller owns the transaction. Freeze the result only after donations close.
export async function awardWarEffortChampions(client) {
  const campaignResult = await client.query(`SELECT completed_at, champion_settled_at
    FROM cdp_war_effort_campaigns WHERE campaign_id = $1 FOR UPDATE`, [WAR_EFFORT_RULES.campaignId]);
  const campaign = campaignResult.rows[0];
  if (!campaign?.completed_at || campaign.champion_settled_at) return;
  await client.query(`INSERT INTO cdp_war_effort_champions
    (campaign_id, account_id, contribution, frame_key, title_id)
    SELECT player.campaign_id, player.account_id, player.contribution, $2, $3
    FROM cdp_war_effort_players player
    JOIN cdp_accounts account ON account.account_id = player.account_id AND account.role = 'player'
    WHERE player.campaign_id = $1 AND player.contribution > 0
      AND player.contribution = (
        SELECT max(candidate.contribution) FROM cdp_war_effort_players candidate
        JOIN cdp_accounts eligible ON eligible.account_id = candidate.account_id AND eligible.role = 'player'
        WHERE candidate.campaign_id = $1
      )
    ON CONFLICT (campaign_id, account_id) DO NOTHING`, [
    WAR_EFFORT_RULES.campaignId, WAR_EFFORT_CHAMPION.frameKey, WAR_EFFORT_CHAMPION.title.id
  ]);
  await client.query(`INSERT INTO cdp_cosmetic_entitlements
    (account_id, cosmetic_type, cosmetic_key, source, source_id)
    SELECT account_id, 'avatar_frame', frame_key, 'war_effort', campaign_id || ':champion'
    FROM cdp_war_effort_champions WHERE campaign_id = $1
    ON CONFLICT DO NOTHING`, [WAR_EFFORT_RULES.campaignId]);
  await client.query(`UPDATE cdp_war_effort_campaigns SET champion_settled_at = now(), updated_at = now()
    WHERE campaign_id = $1`, [WAR_EFFORT_RULES.campaignId]);
}
