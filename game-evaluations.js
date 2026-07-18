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

function dragSummary(metric, mode) {
  const benefit = mode === "gain" ? metric.enemyDragBenefit : metric.enemyDragLoss;
  const red = mode === "gain" ? metric.enemyDraggedRedFives : metric.draggedByOpponentRedFives;
  const diamond = mode === "gain" ? metric.enemyDraggedDiamondFives : metric.draggedByOpponentDiamondFives;
  return `红五 ${red}、方五 ${diamond}（折算 ${benefit} 积分）`;
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
    wonTricks: 0,
    leadRounds: 0,
    teammateAssistPoints: 0,
    opponentPointsFed: 0,
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
    mvpValue: 0,
    contributionValue: 0,
    harmValue: 0,
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

  if (bottom?.winnerTeam === "idle") {
    const winner = metricByPlayerId.get(bottom.winnerId);
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
    }
  }

  metrics.forEach((metric) => {
    metric.mvpValue = metric.capturedPoints + metric.enemyDragBenefit * 40;
    metric.contributionValue = metric.mvpValue + metric.teammateAssistPoints;
    metric.harmValue = metric.opponentPointsFed + metric.enemyDragLoss * 40;
  });

  const winningMetrics = metrics.filter((metric) => metric.team === winnerTeam);
  const mvp = selectMetric(winningMetrics, [
    ["mvpValue", "desc"],
    ["capturedPoints", "desc"],
    ["enemyDragBenefit", "desc"],
    ["wonTricks", "desc"]
  ]);
  const couch = winningMetrics.length > 1
    ? selectMetric(winningMetrics, [
      ["contributionValue", "asc"],
      ["capturedPoints", "asc"],
      ["teammateAssistPoints", "asc"],
      ["wonTricks", "asc"]
    ])
    : null;
  const pit = selectMetric(metrics.filter((metric) => metric.harmValue > 0), [
    ["harmValue", "desc"],
    ["opponentPointsFed", "desc"],
    ["enemyDragLoss", "desc"]
  ]);
  const support = selectMetric(metrics.filter((metric) => metric.teammateAssistPoints > 0), [
    ["teammateAssistPoints", "desc"],
    ["capturedPoints", "asc"]
  ]);
  const stiffPlayers = metrics.filter((metric) => metric.leadRounds === 0 && metric.wonTricks === 0);
  const stiffestPlayers = hasProvisionalWinnerData
    ? metrics.filter((metric) => !metric.wasProvisionalWinner)
    : [];
  const thunderPlayers = metrics.filter((metric) => metric.teammateDragHarmValue >= 4);
  const precision = metricByPlayerId.get(finalSideSuitBottomWinnerId) || null;

  addTag(
    mvp,
    "mvp",
    "MVP",
    mvp ? `牌局胜方核心：获得 ${mvp.capturedPoints} 分，拖对手${dragSummary(mvp, "gain")}` : ""
  );
  addTag(
    couch,
    "couch",
    "躺",
    couch ? `牌局胜方贡献较少：获得 ${couch.capturedPoints} 分，给队友贴 ${couch.teammateAssistPoints} 分，拖对手${dragSummary(couch, "gain")}` : ""
  );
  addTag(
    pit,
    "pit",
    "坑",
    pit ? `负面贡献较高：给对手贴 ${pit.opponentPointsFed} 分，被对手拖${dragSummary(pit, "loss")}` : ""
  );
  addTag(
    support,
    "support",
    "辅",
    support ? `给队友贴分最多：${support.teammateAssistPoints} 分` : ""
  );
  stiffPlayers.forEach((metric) => {
    addTag(metric, "stiff", "僵", "本局没有首出，也没有赢得过下一轮出牌权");
  });
  stiffestPlayers.forEach((metric) => {
    addTag(metric, "stiffest", "僵中僵", "本局每次出牌后都未曾成为当时全场最大");
  });
  thunderPlayers.forEach((metric) => {
    addTag(
      metric,
      "thunder",
      "雷",
      `拖到队友红五 ${metric.teammateDraggedRedFives}、方五 ${metric.teammateDraggedDiamondFives}（折算 ${metric.teammateDragHarmValue} 积分）`
    );
  });
  addTag(precision, "precision", "精", "最后一轮以副牌赢得本轮并成功保底");

  return {
    awards: {
      mvpPlayerId: mvp?.playerId || null,
      couchPlayerId: couch?.playerId || null,
      pitPlayerId: pit?.playerId || null,
      supportPlayerId: support?.playerId || null,
      stiffPlayerIds: stiffPlayers.map((metric) => metric.playerId),
      stiffestPlayerIds: stiffestPlayers.map((metric) => metric.playerId),
      thunderPlayerIds: thunderPlayers.map((metric) => metric.playerId),
      precisionPlayerId: precision?.playerId || null
    },
    byPlayerId: Object.fromEntries(metrics.map((metric) => [metric.playerId, metric]))
  };
}
