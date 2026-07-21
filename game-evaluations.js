function cardPoints(cards) {
  return (cards || []).reduce((sum, card) => {
    if (card?.rank === "5") return sum + 5;
    if (card?.rank === "10" || card?.rank === "K") return sum + 10;
    return sum;
  }, 0);
}

function draggedFiveValue(card) {
  if (card?.rank !== "5") return 0;
  if (card.suit === "H") return 2;
  if (card.suit === "D") return 1;
  return 0;
}

function roundMetric(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function metricText(value) {
  const rounded = roundMetric(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function finalScoreWinnerTeam(idleEachScore) {
  const score = Number(idleEachScore) || 0;
  if (score > 0) return "idle";
  if (score < 0) return "banker";
  return null;
}

function selectMetric(items, fields) {
  if (!items.length) return null;
  return [...items].sort((a, b) => {
    for (const [field, direction] of fields) {
      const difference = (Number(a[field]) || 0) - (Number(b[field]) || 0);
      if (difference) return direction === "asc" ? difference : -difference;
    }
    return a.seatIndex - b.seatIndex;
  })[0];
}

function addTag(metric, code, label, title) {
  if (!metric) return;
  metric.tags.push({ code, label, title });
}

function contributionSummary(metric) {
  return `贡献 ${metricText(metric.contributionValue)} 积分：牌分折算 ${metricText(metric.capturedPointValue)}，拖对手 ${metricText(metric.enemyDragBenefit)}，保底 ${metricText(metric.bottomWinValue + metric.bottomPointValue)}，拖队友及甩牌扣 ${metricText(metric.teammateDragHarmValue + metric.throwFailures)}`;
}

function opponentContributionSummary(metric) {
  return `给对方贡献 ${metricText(metric.opponentContributionValue)} 积分：贴牌分 ${metricText(metric.opponentPointsFedValue)}，被拖 ${metricText(metric.enemyDragLoss)}，拖队友 ${metricText(metric.teammateDragHarmValue)}，其他损失 ${metricText(metric.throwFailures + metric.bottomLossValue + metric.bottomPointsFedValue)}`;
}

export function buildGameEvaluations({
  players = [],
  tricks = [],
  bankerTeamIds = [],
  winnerTeam = "idle",
  provisionalWinnerPlayerIds = null,
  finalSideSuitBottomWinnerId = null,
  bottom = null
} = {}) {
  const bankerIds = new Set(bankerTeamIds);
  const hasProvisionalWinnerData = Array.isArray(provisionalWinnerPlayerIds);
  const provisionalWinnerIds = new Set(provisionalWinnerPlayerIds || []);
  const teamByPlayerId = new Map(players.map((player) => [player.id, bankerIds.has(player.id) ? "banker" : "idle"]));
  const metrics = players.map((player, seatIndex) => ({
    playerId: player.id,
    team: teamByPlayerId.get(player.id),
    seatIndex,
    capturedPoints: Number(player.score) || 0,
    capturedPointValue: 0,
    wonTricks: 0,
    leadRounds: 0,
    teammateAssistPoints: 0,
    opponentPointsFed: 0,
    opponentPointsFedValue: 0,
    enemyDraggedRedFives: 0,
    enemyDraggedDiamondFives: 0,
    enemyDragBenefit: 0,
    teammateDraggedRedFives: 0,
    teammateDraggedDiamondFives: 0,
    teammateDragHarmValue: 0,
    draggedByOpponentRedFives: 0,
    draggedByOpponentDiamondFives: 0,
    enemyDragLoss: 0,
    draggedByTeammateRedFives: 0,
    draggedByTeammateDiamondFives: 0,
    bottomDragBenefit: 0,
    bottomDragLoss: 0,
    bottomWinValue: 0,
    bottomPointValue: 0,
    bottomLossValue: 0,
    bottomPointsFedValue: 0,
    throwFailures: Number(player.throwFailures) || 0,
    grossContributionValue: 0,
    mvpValue: 0,
    contributionValue: 0,
    opponentContributionValue: 0,
    harmValue: 0,
    thunderValue: 0,
    wasProvisionalWinner: provisionalWinnerIds.has(player.id),
    tags: []
  }));
  const metricByPlayerId = new Map(metrics.map((metric) => [metric.playerId, metric]));

  tricks.forEach((trick) => {
    const winner = metricByPlayerId.get(trick?.winnerId);
    const leader = metricByPlayerId.get(trick?.leaderId);
    if (winner) winner.wonTricks += 1;
    if (leader) leader.leadRounds += 1;
    const winnerTeam = teamByPlayerId.get(trick?.winnerId);

    (trick?.plays || []).forEach((play) => {
      const contributor = metricByPlayerId.get(play?.playerId);
      if (!contributor || !winner || play.playerId === trick.winnerId) return;
      const contributorTeam = teamByPlayerId.get(play.playerId);
      const points = cardPoints(play.cards);
      if (contributorTeam === winnerTeam) contributor.teammateAssistPoints += points;
      else contributor.opponentPointsFed += points;

      (play.cards || []).forEach((card) => {
        const value = draggedFiveValue(card);
        if (!value) return;
        const isRedFive = card.suit === "H";
        if (contributorTeam === winnerTeam) {
          winner.teammateDragHarmValue += value;
          if (isRedFive) {
            winner.teammateDraggedRedFives += 1;
            contributor.draggedByTeammateRedFives += 1;
          } else {
            winner.teammateDraggedDiamondFives += 1;
            contributor.draggedByTeammateDiamondFives += 1;
          }
          return;
        }
        winner.enemyDragBenefit += value;
        contributor.enemyDragLoss += value;
        if (isRedFive) {
          winner.enemyDraggedRedFives += 1;
          contributor.draggedByOpponentRedFives += 1;
        } else {
          winner.enemyDraggedDiamondFives += 1;
          contributor.draggedByOpponentDiamondFives += 1;
        }
      });
    });
  });

  const bottomWinner = metricByPlayerId.get(bottom?.winnerId);
  if (bottomWinner) {
    bottomWinner.bottomWinValue += 1;
    if (bottom?.winnerTeam === "banker") {
      bottomWinner.bottomPointValue += ((Number(bottom.points) || 0) * 2) / 40;
    }
  }

  if (bottom?.winnerTeam === "idle") {
    const winner = bottomWinner;
    const victim = metricByPlayerId.get(bottom.bankerId);
    if (winner && victim && winner.team !== victim.team) {
      const redFives = Number(bottom.draggedRedFives) || 0;
      const diamondFives = Number(bottom.draggedDiamondFives) || 0;
      const doubledValue = (redFives * 2 + diamondFives) * 2;
      winner.enemyDraggedRedFives += redFives;
      winner.enemyDraggedDiamondFives += diamondFives;
      winner.enemyDragBenefit += doubledValue;
      winner.bottomDragBenefit += doubledValue;
      victim.draggedByOpponentRedFives += redFives;
      victim.draggedByOpponentDiamondFives += diamondFives;
      victim.enemyDragLoss += doubledValue;
      victim.bottomDragLoss += doubledValue;
      victim.bottomLossValue += 1;
      victim.bottomPointsFedValue += ((Number(bottom.points) || 0) * 2) / 40;
    }
  }

  metrics.forEach((metric) => {
    metric.capturedPointValue = roundMetric(metric.capturedPoints / 40);
    metric.opponentPointsFedValue = roundMetric(metric.opponentPointsFed / 40);
    metric.grossContributionValue = roundMetric(
      metric.capturedPointValue + metric.enemyDragBenefit + metric.bottomWinValue + metric.bottomPointValue
    );
    metric.contributionValue = roundMetric(
      metric.grossContributionValue - metric.teammateDragHarmValue - metric.throwFailures
    );
    metric.opponentContributionValue = roundMetric(
      metric.opponentPointsFedValue
        + metric.enemyDragLoss
        + metric.teammateDragHarmValue
        + metric.throwFailures
        + metric.bottomLossValue
        + metric.bottomPointsFedValue
    );
    metric.mvpValue = metric.contributionValue;
    metric.harmValue = metric.opponentContributionValue;
    metric.thunderValue = roundMetric(metric.teammateDragHarmValue - metric.enemyDragBenefit);
  });

  const winningMetrics = metrics.filter((metric) => metric.team === winnerTeam);
  const mvp = selectMetric(winningMetrics, [
    ["mvpValue", "desc"],
    ["grossContributionValue", "desc"],
    ["enemyDragBenefit", "desc"],
    ["wonTricks", "desc"]
  ]);
  const couchPlayers = winningMetrics.filter((metric) => metric.contributionValue <= 0);
  const pit = selectMetric(metrics.filter((metric) => metric.opponentContributionValue >= 5), [
    ["opponentContributionValue", "desc"],
    ["opponentPointsFed", "desc"],
    ["enemyDragLoss", "desc"]
  ]);
  const support = selectMetric(metrics.filter((metric) => metric.teammateAssistPoints > 0), [
    ["teammateAssistPoints", "desc"],
    ["capturedPoints", "asc"]
  ]);
  const stiffPlayers = metrics.filter((metric) => metric.wonTricks === 0);
  const stiffestPlayers = hasProvisionalWinnerData
    ? metrics.filter((metric) => !metric.wasProvisionalWinner)
    : [];
  const thunderPlayers = metrics.filter((metric) => metric.thunderValue >= 4);
  const precision = metricByPlayerId.get(finalSideSuitBottomWinnerId) || null;
  const godPlayers = metrics.filter((metric) => metric.contributionValue >= 15);
  const heavenPlayers = metrics.filter((metric) => metric.contributionValue >= 20);
  const godPitPlayers = metrics.filter((metric) => metric.opponentContributionValue >= 10);
  const losingTeam = winnerTeam === "idle" ? "banker" : winnerTeam === "banker" ? "idle" : null;
  const globalContributionLeader = selectMetric(metrics, [
    ["contributionValue", "desc"],
    ["grossContributionValue", "desc"],
    ["capturedPoints", "desc"],
    ["wonTricks", "desc"]
  ]);
  const exhausted = globalContributionLeader?.team === losingTeam ? globalContributionLeader : null;
  const pillar = exhausted?.contributionValue >= 10 ? exhausted : null;

  addTag(
    mvp,
    "mvp",
    "MVP",
    mvp ? `最终积分胜方贡献最大；${contributionSummary(mvp)}` : ""
  );
  addTag(support, "support", "辅", support ? `全场给队友提供牌分最多：${support.teammateAssistPoints} 分` : "");
  couchPlayers.forEach((metric) => {
    addTag(metric, "couch", "躺", `最终积分胜方个人贡献不高于 0；${contributionSummary(metric)}`);
  });
  addTag(
    pit,
    "pit",
    "坑",
    pit ? `全场给对方贡献积分最多且不少于 5；${opponentContributionSummary(pit)}` : ""
  );
  stiffPlayers.forEach((metric) => {
    addTag(metric, "stiff", "僵", "本局没有获得过任意一轮的最终最大");
  });
  stiffestPlayers.forEach((metric) => {
    addTag(metric, "stiffest", "僵中僵", "本局每次出牌后都未曾成为当时全场最大");
  });
  thunderPlayers.forEach((metric) => {
    addTag(
      metric,
      "thunder",
      "雷",
      `拖队友红方五损失 ${metricText(metric.teammateDragHarmValue)}，扣除拖对手收益 ${metricText(metric.enemyDragBenefit)} 后，净损失 ${metricText(metric.thunderValue)} 积分`
    );
  });
  addTag(precision, "precision", "精", "最后一轮以副牌赢得本轮并成功保底");
  godPlayers.forEach((metric) => addTag(metric, "god", "神", `为本队贡献不少于 15 积分；${contributionSummary(metric)}`));
  heavenPlayers.forEach((metric) => addTag(metric, "heaven", "天之上", `为本队贡献不少于 20 积分；${contributionSummary(metric)}`));
  godPitPlayers.forEach((metric) => addTag(metric, "god-pit", "神坑", `为对方队伍贡献不少于 10 积分；${opponentContributionSummary(metric)}`));
  addTag(exhausted, "exhausted", "尽", exhausted ? `最终积分败方中出现全场贡献最高者；${contributionSummary(exhausted)}` : "");
  addTag(pillar, "pillar", "擎", pillar ? `最终积分败方的全场贡献最高者，且贡献不少于 10；${contributionSummary(pillar)}` : "");

  return {
    awards: {
      mvpPlayerId: mvp?.playerId || null,
      couchPlayerId: couchPlayers[0]?.playerId || null,
      couchPlayerIds: couchPlayers.map((metric) => metric.playerId),
      pitPlayerId: pit?.playerId || null,
      supportPlayerId: support?.playerId || null,
      stiffPlayerIds: stiffPlayers.map((metric) => metric.playerId),
      stiffestPlayerIds: stiffestPlayers.map((metric) => metric.playerId),
      thunderPlayerIds: thunderPlayers.map((metric) => metric.playerId),
      precisionPlayerId: precision?.playerId || null,
      godPlayerIds: godPlayers.map((metric) => metric.playerId),
      heavenPlayerIds: heavenPlayers.map((metric) => metric.playerId),
      godPitPlayerIds: godPitPlayers.map((metric) => metric.playerId),
      exhaustedPlayerId: exhausted?.playerId || null,
      pillarPlayerId: pillar?.playerId || null
    },
    byPlayerId: Object.fromEntries(metrics.map((metric) => [metric.playerId, metric]))
  };
}
