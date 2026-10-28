import { HERO_HOME_RULES } from './hero-home.js';
import { isDiamondEligibleGame, isDiamondEligiblePlayer } from './diamond-rewards.js';

const round = value => Math.round((Number(value) || 0) * 100) / 100;
const pending = trial => trial.status === 'choosing' || trial.status === 'voting';

export function createJudgmentSession(room, at = Date.now()) {
  if (room.gameMode !== 'pvp' || !room.result?.winnerTeam || !isDiamondEligibleGame(room)
      || !room.players.every(player => isDiamondEligiblePlayer(room, player))) return null;
  const participants = room.players.map(player => ({ id: player.id, name: player.name }));
  const trials = room.players.flatMap(player => {
    const result = room.result.playerResults.find(item => item.playerId === player.id);
    if (player.battleHeroSnapshot?.heroId !== 'shen-yingwu' || !result?.team || result.team === room.result.winnerTeam) return [];
    const stars = Math.max(1, Math.min(5, Math.trunc(Number(player.battleHeroSnapshot.stars) || 1)));
    return [{ id: `${room.gameRecordId}:${player.id}`, ownerId: player.id, ownerName: player.name,
      stars, reductionRate: HERO_HOME_RULES.shenYingwuReductionRates[stars - 1],
      successDiamonds: HERO_HOME_RULES.shenYingwuSuccessDiamonds[stars - 1],
      loss: Math.max(0, -round(result.gameScore)), status: 'choosing',
      deadlineAt: new Date(at + 20000).toISOString(), targetId: null, voterIds: [], votes: {} }];
  });
  return trials.length ? { gameId: room.gameRecordId, participants, trials, complete: false } : null;
}

function closeTrial(trial, at) {
  const supportIds = trial.voterIds.filter(id => trial.votes[id] === 'support');
  const opposeIds = trial.voterIds.filter(id => trial.votes[id] === 'oppose');
  trial.status = 'completed';
  trial.supportIds = supportIds;
  trial.opposeIds = opposeIds;
  trial.abstainCount = trial.voterIds.length - supportIds.length - opposeIds.length;
  trial.passed = trial.voterIds.length > 0 && supportIds.length * 2 >= trial.voterIds.length;
  trial.rewardedVoterIds = supportIds.length > opposeIds.length ? supportIds
    : opposeIds.length > supportIds.length ? opposeIds : [];
  trial.scoreReduction = trial.passed ? Math.min(trial.loss, round(trial.loss * trial.reductionRate)) : 0;
  trial.closedAt = new Date(at).toISOString();
}

export function advanceJudgments(session, at = Date.now()) {
  if (!session || session.complete) return false;
  let changed = false;
  for (const trial of session.trials) {
    if (!pending(trial)) continue;
    const expired = Date.parse(trial.deadlineAt) <= at;
    if (trial.status === 'choosing' && expired) {
      trial.status = 'skipped'; trial.closedAt = new Date(at).toISOString(); changed = true;
    } else if (trial.status === 'voting' && (expired || trial.voterIds.every(id => Object.hasOwn(trial.votes, id)))) {
      closeTrial(trial, at); changed = true;
    }
  }
  session.complete = session.trials.every(trial => !pending(trial));
  return changed;
}

export function submitJudgment(session, actorId, { trialId, action, targetPlayerId, choice } = {}, at = Date.now()) {
  if (!session) return { error: '本局没有可操作的战犯审判', status: 409 };
  advanceJudgments(session, at);
  const trial = session.trials.find(item => item.id === trialId);
  if (!trial) return { error: '审判不存在或已失效', status: 404 };
  if (action === 'target' || action === 'pass') {
    if (trial.ownerId !== actorId) return { error: '只有该神鹦鹉可以发起或放弃审判', status: 403 };
    if (action === 'target' && trial.targetId === targetPlayerId) return { ok: true };
    if (action === 'pass' && trial.status === 'skipped') return { ok: true };
    if (trial.status !== 'choosing') return { error: '选择时间已结束，不能再次发起审判', status: 409 };
    if (action === 'pass') {
      trial.status = 'skipped'; trial.closedAt = new Date(at).toISOString();
    } else {
      if (targetPlayerId === actorId || !session.participants.some(player => player.id === targetPlayerId)) {
        return { error: '请选择本局另一名玩家', status: 400 };
      }
      trial.targetId = targetPlayerId;
      trial.targetName = session.participants.find(player => player.id === targetPlayerId).name;
      trial.voterIds = session.participants.map(player => player.id).filter(id => id !== actorId && id !== targetPlayerId);
      trial.status = 'voting'; trial.deadlineAt = new Date(at + 30000).toISOString();
    }
  } else if (action === 'vote') {
    if (!trial.voterIds.includes(actorId)) return { error: '你没有本次审判的投票资格', status: 403 };
    if (!['support', 'oppose', 'abstain'].includes(choice)) return { error: '请选择支持、反对或弃权', status: 400 };
    if (Object.hasOwn(trial.votes, actorId)) return trial.votes[actorId] === choice
      ? { ok: true } : { error: '本次投票已提交，不能修改', status: 409 };
    if (trial.status !== 'voting') return { error: '投票已结束，未投票按弃权处理', status: 409 };
    trial.votes[actorId] = choice;
  } else return { error: '未知的审判操作', status: 400 };
  advanceJudgments(session, at);
  return { ok: true };
}

export function judgmentSnapshot(session, viewerId) {
  if (!session) return null;
  return { gameId: session.gameId, complete: session.complete, participants: session.participants,
    trials: session.trials.map(trial => ({
      id: trial.id, ownerId: trial.ownerId, ownerName: trial.ownerName, targetId: trial.targetId,
      targetName: trial.targetName, status: trial.status, deadlineAt: trial.deadlineAt,
      reductionRate: trial.reductionRate, successDiamonds: trial.successDiamonds,
      eligibleCount: trial.voterIds.length, requiredSupport: Math.ceil(trial.voterIds.length / 2),
      castCount: Object.keys(trial.votes).length,
      canChoose: trial.status === 'choosing' && trial.ownerId === viewerId,
      canVote: trial.status === 'voting' && trial.voterIds.includes(viewerId) && !Object.hasOwn(trial.votes, viewerId),
      viewerVote: trial.votes[viewerId] || null,
      ...(trial.status === 'completed' ? { passed: trial.passed, supportCount: trial.supportIds.length,
        opposeCount: trial.opposeIds.length, abstainCount: trial.abstainCount, scoreReduction: trial.scoreReduction,
        rewardedVoterIds: trial.rewardedVoterIds } : {})
    })) };
}

export function applyJudgmentOutcomes(result, session) {
  result.judgmentAppliedIds ||= [];
  for (const trial of session.trials) {
    if (trial.status !== 'completed' || result.judgmentAppliedIds.includes(trial.id)) continue;
    result.judgmentAppliedIds.push(trial.id);
    const owner = result.playerResults.find(player => player.playerId === trial.ownerId);
    if (owner && trial.passed) {
      const delta = trial.scoreReduction;
      owner.gameScore = round(owner.gameScore + delta);
      owner.heroScoreDelta = round((owner.heroScoreDelta || 0) + delta);
      owner.gameScoreText = String(owner.gameScore);
      owner.heroScoreDeltaText = String(owner.heroScoreDelta);
      result.heroScoreAdjustments ||= [];
      if (delta) result.heroScoreAdjustments.push({ sourcePlayerId: trial.ownerId, recipientPlayerId: trial.ownerId,
        adjustmentType: 'hero-judgment-reduction', delta, trialId: trial.id });
    }
    const add = (playerId, amount, kind) => {
      const player = result.playerResults.find(item => item.playerId === playerId);
      if (!player) return;
      player.judgmentReward ||= { amount: 0, entries: [] };
      player.judgmentReward.amount += amount;
      player.judgmentReward.entries.push({ trialId: trial.id, kind, amount });
    };
    if (trial.passed) add(trial.ownerId, trial.successDiamonds, 'judgment');
    trial.rewardedVoterIds.forEach(playerId => add(playerId, 50, 'vote'));
  }
  result.judgments = judgmentSnapshot(session, null);
  result.judgmentPending = !session.complete;
}
