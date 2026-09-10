export const ACHIEVEMENT_RULES = Object.freeze({
  version: "2026-09-10-v2"
});

export const ACHIEVEMENT_CATEGORIES = Object.freeze([
  { id: "pvp-career", name: "PVP 征途" },
  { id: "pvp-performance", name: "PVP 高光" },
  { id: "pvp-special", name: "PVP 挑战" },
  { id: "pvp-collection", name: "PVP 收藏" },
  { id: "pve-career", name: "PVE 征途" },
  { id: "pve-performance", name: "PVE 高光" },
  { id: "pve-special", name: "PVE 挑战" },
  { id: "pve-collection", name: "PVE 收藏" }
]);

function achievementSeries(category, idPrefix, metric, rows) {
  return rows.map(([target, name, description, rewardDiamonds, title]) => ({
    id: `${idPrefix}-${target}`,
    category,
    name,
    description,
    metric,
    target,
    rewardDiamonds,
    ...(title ? { title: { id: title[0], name: title[1] } } : {})
  }));
}

export const ACHIEVEMENTS = Object.freeze([
  ...achievementSeries("pvp-career", "pvp-games", "pvpGamesPlayed", [
    [1, "初登竞技场", "完成 1 局 PVP", 50, ["pvp-rookie", "牌桌新秀"]],
    [10, "小试锋芒", "累计完成 10 局 PVP", 100],
    [50, "渐入佳境", "累计完成 50 局 PVP", 200],
    [200, "久经牌桌", "累计完成 200 局 PVP", 400, ["pvp-seasoned", "久经牌桌"]],
    [500, "牌坛老将", "累计完成 500 局 PVP", 700, ["pvp-veteran", "牌坛老将"]],
    [1000, "千局名宿", "累计完成 1000 局 PVP", 1200, ["pvp-master", "千局名宿"]],
    [2000, "不灭牌魂", "累计完成 2000 局 PVP", 2000, ["pvp-legend", "不灭牌魂"]]
  ]),
  ...achievementSeries("pvp-career", "pvp-wins", "pvpWins", [
    [1, "竞技首胜", "赢得 1 局 PVP", 50],
    [10, "胜者之路", "累计赢得 10 局 PVP", 100],
    [50, "常胜将军", "累计赢得 50 局 PVP", 250, ["pvp-winner", "常胜将军"]],
    [200, "百胜名将", "累计赢得 200 局 PVP", 500, ["pvp-hundred-wins", "百胜名将"]],
    [500, "胜局宗师", "累计赢得 500 局 PVP", 1000, ["pvp-win-master", "胜局宗师"]],
    [1000, "千胜王者", "累计赢得 1000 局 PVP", 1800, ["pvp-win-legend", "千胜王者"]]
  ]),
  ...achievementSeries("pvp-career", "pvp-win-streak", "pvpMaxWinStreak", [
    [3, "三连捷", "PVP 生涯最高连胜达到 3 局", 100],
    [5, "势如破竹", "PVP 生涯最高连胜达到 5 局", 300, ["pvp-streak-five", "连战连捷"]],
    [10, "十连冠", "PVP 生涯最高连胜达到 10 局", 800, ["pvp-streak-ten", "十连冠"]]
  ]),
  ...achievementSeries("pvp-career", "pvp-loss-streak", "pvpMaxLossStreak", [
    [5, "愈挫愈勇", "PVP 生涯经历过 5 连败", 0, ["pvp-resilient", "越挫越勇"]],
    [10, "百折不挠", "PVP 生涯经历过 10 连败", 0, ["pvp-unyielding", "百折不挠"]]
  ]),
  ...achievementSeries("pvp-career", "pvp-banker-games", "pvpBankerGames", [
    [20, "稳坐庄位", "PVP 累计以庄家身份完成 20 局", 100],
    [100, "坐庄专家", "PVP 累计以庄家身份完成 100 局", 300, ["pvp-banker-expert", "坐庄专家"]],
    [500, "庄位宗师", "PVP 累计以庄家身份完成 500 局", 800, ["pvp-banker-master", "庄位宗师"]]
  ]),

  ...achievementSeries("pve-career", "pve-games", "pveGamesPlayed", [
    [1, "初入试炼", "完成 1 局有效 PVE", 50, ["pve-rookie", "初入试炼"]],
    [10, "熟悉阵型", "累计完成 10 局有效 PVE", 100],
    [50, "破阵渐熟", "累计完成 50 局有效 PVE", 200],
    [200, "百阵先锋", "累计完成 200 局有效 PVE", 400, ["pve-seasoned", "百阵先锋"]],
    [500, "智械猎手", "累计完成 500 局有效 PVE", 700, ["pve-veteran", "智械猎手"]],
    [1000, "千阵名宿", "累计完成 1000 局有效 PVE", 1200, ["pve-master", "千阵名宿"]],
    [2000, "人机传说", "累计完成 2000 局有效 PVE", 2000, ["pve-legend", "人机传说"]]
  ]),
  ...achievementSeries("pve-career", "pve-wins", "pveWins", [
    [1, "破阵首胜", "赢得 1 局有效 PVE", 50],
    [10, "机器克星", "累计赢得 10 局有效 PVE", 100],
    [50, "破阵名将", "累计赢得 50 局有效 PVE", 250, ["pve-winner", "破阵名将"]],
    [200, "百阵百胜", "累计赢得 200 局有效 PVE", 500, ["pve-hundred-wins", "百阵统领"]],
    [500, "破阵宗师", "累计赢得 500 局有效 PVE", 1000, ["pve-win-master", "破阵宗师"]],
    [1000, "智械终结者", "累计赢得 1000 局有效 PVE", 1800, ["pve-win-legend", "智械终结者"]]
  ]),
  ...achievementSeries("pve-career", "pve-win-streak", "pveMaxWinStreak", [
    [3, "连破三阵", "PVE 生涯最高连胜达到 3 局", 100],
    [10, "连破十阵", "PVE 生涯最高连胜达到 10 局", 300, ["pve-streak-ten", "连破十阵"]],
    [20, "不败演算", "PVE 生涯最高连胜达到 20 局", 800, ["pve-streak-twenty", "不败演算"]]
  ]),
  ...achievementSeries("pve-career", "pve-loss-streak", "pveMaxLossStreak", [
    [5, "重新演算", "PVE 生涯经历过 5 连败", 0, ["pve-resilient", "再来一局"]],
    [10, "不屈试炼", "PVE 生涯经历过 10 连败", 0, ["pve-unyielding", "不屈试炼者"]]
  ]),
  ...achievementSeries("pve-career", "pve-banker-games", "pveBankerGames", [
    [20, "初掌阵眼", "PVE 累计以庄家身份完成 20 局", 100],
    [100, "试炼主将", "PVE 累计以庄家身份完成 100 局", 300, ["pve-banker-expert", "试炼主将"]],
    [500, "破阵主帅", "PVE 累计以庄家身份完成 500 局", 800, ["pve-banker-master", "破阵主帅"]]
  ]),

  ...achievementSeries("pvp-performance", "pvp-red-five-total", "pvpTotalEnemyRedFives", [
    [10, "初识红五", "PVP 累计拖下 10 张对方红五", 100],
    [50, "红五猎手", "PVP 累计拖下 50 张对方红五", 300, ["pvp-red-hunter", "红五猎手"]],
    [200, "红五收割者", "PVP 累计拖下 200 张对方红五", 800, ["pvp-red-reaper", "红五收割者"]]
  ]),
  ...achievementSeries("pvp-performance", "pvp-bottom-wins", "pvpBottomWins", [
    [10, "初守底牌", "PVP 累计赢得 10 次最后一轮", 100],
    [50, "守底专家", "PVP 累计赢得 50 次最后一轮", 300, ["pvp-bottom-expert", "守底专家"]],
    [200, "镇底宗师", "PVP 累计赢得 200 次最后一轮", 800, ["pvp-bottom-master", "镇底宗师"]]
  ]),
  ...achievementSeries("pvp-performance", "pvp-mvp", "pvpMvpCount", [
    [10, "崭露头角", "PVP 累计获得 10 次 MVP", 100],
    [50, "全场核心", "PVP 累计获得 50 次 MVP", 300, ["pvp-core", "全场核心"]],
    [200, "牌桌主宰", "PVP 累计获得 200 次 MVP", 800, ["pvp-dominator", "牌桌主宰"]]
  ]),
  ...achievementSeries("pvp-performance", "pvp-support", "pvpSupportCount", [
    [10, "默契初成", "PVP 累计获得 10 次“辅”", 100],
    [50, "最佳拍档", "PVP 累计获得 50 次“辅”", 300, ["pvp-partner", "最佳拍档"]],
    [200, "团队脊梁", "PVP 累计获得 200 次“辅”", 800, ["pvp-backbone", "团队脊梁"]]
  ]),
  ...achievementSeries("pvp-performance", "pvp-trick-score", "pvpTotalTrickScore", [
    [1000, "聚沙成塔", "PVP 累计获得 1000 牌分", 100],
    [10000, "牌分能手", "PVP 累计获得 10000 牌分", 300, ["pvp-score-expert", "牌分能手"]],
    [50000, "牌分巨匠", "PVP 累计获得 50000 牌分", 800, ["pvp-score-master", "牌分巨匠"]]
  ]),
  ...achievementSeries("pvp-performance", "pvp-fry-total", "pvpTotalFryActions", [
    [20, "初炒地皮", "PVP 累计由自己成功炒底 20 次", 100],
    [100, "炒底专家", "PVP 累计由自己成功炒底 100 次", 300, ["pvp-fry-expert", "炒底专家"]],
    [500, "地皮宗师", "PVP 累计由自己成功炒底 500 次", 800, ["pvp-fry-master", "地皮宗师"]]
  ]),

  ...achievementSeries("pve-performance", "pve-red-five-total", "pveTotalEnemyRedFives", [
    [10, "初破红五", "PVE 累计拖下 10 张电脑方红五", 100],
    [50, "机器猎手", "PVE 累计拖下 50 张电脑方红五", 300, ["pve-red-hunter", "机器猎手"]],
    [200, "智械收割者", "PVE 累计拖下 200 张电脑方红五", 800, ["pve-red-reaper", "智械收割者"]]
  ]),
  ...achievementSeries("pve-performance", "pve-bottom-wins", "pveBottomWins", [
    [10, "初破底阵", "PVE 累计赢得 10 次最后一轮", 100],
    [50, "破阵守底", "PVE 累计赢得 50 次最后一轮", 300, ["pve-bottom-expert", "破阵守底"]],
    [200, "镇阵宗师", "PVE 累计赢得 200 次最后一轮", 800, ["pve-bottom-master", "镇阵宗师"]]
  ]),
  ...achievementSeries("pve-performance", "pve-mvp", "pveMvpCount", [
    [10, "演算新星", "PVE 累计获得 10 次 MVP", 100],
    [50, "演算核心", "PVE 累计获得 50 次 MVP", 300, ["pve-core", "演算核心"]],
    [200, "试炼主宰", "PVE 累计获得 200 次 MVP", 800, ["pve-dominator", "试炼主宰"]]
  ]),
  ...achievementSeries("pve-performance", "pve-support", "pveSupportCount", [
    [10, "协同初成", "PVE 累计获得 10 次“辅”", 100],
    [50, "协同专家", "PVE 累计获得 50 次“辅”", 300, ["pve-partner", "协同专家"]],
    [200, "人机军师", "PVE 累计获得 200 次“辅”", 800, ["pve-backbone", "人机军师"]]
  ]),
  ...achievementSeries("pve-performance", "pve-trick-score", "pveTotalTrickScore", [
    [1000, "试炼取分", "PVE 累计获得 1000 牌分", 100],
    [10000, "取分专家", "PVE 累计获得 10000 牌分", 300, ["pve-score-expert", "取分专家"]],
    [50000, "破阵得分王", "PVE 累计获得 50000 牌分", 800, ["pve-score-master", "破阵得分王"]]
  ]),
  ...achievementSeries("pve-performance", "pve-fry-total", "pveTotalFryActions", [
    [20, "初炒试炼", "PVE 累计由自己成功炒底 20 次", 100],
    [100, "试炼炒手", "PVE 累计由自己成功炒底 100 次", 300, ["pve-fry-expert", "试炼炒手"]],
    [500, "智械炒宗", "PVE 累计由自己成功炒底 500 次", 800, ["pve-fry-master", "智械炒宗"]]
  ]),

  { id: "pvp-lead-21", category: "pvp-special", name: "一手遮天", description: "PVP 单次主动领出超过 20 张实际生效的牌", metric: "pvpMaxLeadPlayCards", target: 21, rewardDiamonds: 800, title: { id: "pvp-twenty-one", name: "二十一响" } },
  { id: "pvp-dragged-red-five-5", category: "pvp-special", name: "五红临门", description: "PVP 单局被拖 5 张或更多红五", metric: "pvpMaxDraggedRedFives", target: 5, rewardDiamonds: 0, title: { id: "pvp-red-magnet", name: "红五磁王" } },
  { id: "pvp-enemy-red-five-5", category: "pvp-special", name: "一网打尽", description: "PVP 单局拖下 5 张或更多对方红五", metric: "pvpMaxEnemyRedFives", target: 5, rewardDiamonds: 1000, title: { id: "pvp-red-terminator", name: "红五终结者" } },
  { id: "pvp-evaluation-4", category: "pvp-special", name: "光环加身", description: "PVP 单局获得 4 个或更多牌局表现称号", metric: "pvpMaxEvaluationTitlesInGame", target: 4, rewardDiamonds: 600, title: { id: "pvp-four-crowns", name: "四冠加身" } },
  { id: "pvp-fry-5", category: "pvp-special", name: "地皮炒穿", description: "PVP 单局由自己成功炒底 5 次或更多", metric: "pvpMaxFryActions", target: 5, rewardDiamonds: 800, title: { id: "pvp-fry-king", name: "炒底狂人" } },
  { id: "pvp-zero-score-win", category: "pvp-special", name: "躺赢也是赢", description: "PVP 单局个人牌分为 0 且最终获胜", metric: "pvpZeroTrickScoreWins", target: 1, rewardDiamonds: 0, title: { id: "pvp-chosen-couch", name: "天选躺家" } },
  { id: "pve-lead-21", category: "pve-special", name: "牌海破阵", description: "PVE 单次主动领出超过 20 张实际生效的牌", metric: "pveMaxLeadPlayCards", target: 21, rewardDiamonds: 800, title: { id: "pve-twenty-one", name: "清场专家" } },
  { id: "pve-dragged-red-five-5", category: "pve-special", name: "重点照顾", description: "PVE 单局被拖 5 张或更多红五", metric: "pveMaxDraggedRedFives", target: 5, rewardDiamonds: 0, title: { id: "pve-red-target", name: "红五靶心" } },
  { id: "pve-enemy-red-five-5", category: "pve-special", name: "机器清零", description: "PVE 单局拖下 5 张或更多电脑方红五", metric: "pveMaxEnemyRedFives", target: 5, rewardDiamonds: 1000, title: { id: "pve-red-terminator", name: "智械克星" } },
  { id: "pve-evaluation-4", category: "pve-special", name: "全能演算", description: "PVE 单局获得 4 个或更多牌局表现称号", metric: "pveMaxEvaluationTitlesInGame", target: 4, rewardDiamonds: 600, title: { id: "pve-four-crowns", name: "试炼全能" } },
  { id: "pve-fry-5", category: "pve-special", name: "人机炒王", description: "PVE 单局由自己成功炒底 5 次或更多", metric: "pveMaxFryActions", target: 5, rewardDiamonds: 800, title: { id: "pve-fry-king", name: "试炼炒王" } },
  { id: "pve-zero-score-win", category: "pve-special", name: "运筹帷幄", description: "PVE 单局个人牌分为 0 且最终获胜", metric: "pveZeroTrickScoreWins", target: 1, rewardDiamonds: 0, title: { id: "pve-backline-strategist", name: "后排军师" } },

  ...achievementSeries("pvp-collection", "pvp-evaluation-total", "pvpEvaluationTitleCount", [
    [50, "称号成册", "PVP 累计获得 50 次牌局表现称号", 200],
    [200, "称号满柜", "PVP 累计获得 200 次牌局表现称号", 600, ["pvp-title-collector", "称号收藏家"]],
    [1000, "千枚勋章", "PVP 累计获得 1000 次牌局表现称号", 1500, ["pvp-title-archivist", "称号典藏家"]]
  ]),
  ...achievementSeries("pvp-collection", "pvp-evaluation-distinct", "pvpDistinctEvaluationTitles", [
    [8, "百变牌手", "PVP 获得过 8 种不同牌局表现称号", 400],
    [13, "全称号制霸", "PVP 获得过全部 13 种牌局表现称号", 1000, ["pvp-versatile", "百变牌王"]]
  ]),
  ...achievementSeries("pve-collection", "pve-evaluation-total", "pveEvaluationTitleCount", [
    [50, "试炼成册", "PVE 累计获得 50 次牌局表现称号", 200],
    [200, "试炼满柜", "PVE 累计获得 200 次牌局表现称号", 600, ["pve-title-collector", "试炼收藏家"]],
    [1000, "千枚试炼章", "PVE 累计获得 1000 次牌局表现称号", 1500, ["pve-title-archivist", "试炼典藏家"]]
  ]),
  ...achievementSeries("pve-collection", "pve-evaluation-distinct", "pveDistinctEvaluationTitles", [
    [8, "百变破阵者", "PVE 获得过 8 种不同牌局表现称号", 400],
    [13, "试炼全称号", "PVE 获得过全部 13 种牌局表现称号", 1000, ["pve-versatile", "全能破阵者"]]
  ])
]);

export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((item) => [item.id, item]));
export const ACHIEVEMENT_TITLE_BY_ID = new Map(
  ACHIEVEMENTS.filter((item) => item.title).map((item) => [item.title.id, item.title])
);

export function calculateStreaks(results = []) {
  let currentWin = 0;
  let currentLoss = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  results.forEach((won) => {
    if (won) {
      currentWin += 1;
      currentLoss = 0;
      maxWinStreak = Math.max(maxWinStreak, currentWin);
    } else {
      currentLoss += 1;
      currentWin = 0;
      maxLossStreak = Math.max(maxLossStreak, currentLoss);
    }
  });
  return { maxWinStreak, maxLossStreak };
}

export function maximumLeadPlayCards(trickHistory = [], roomPlayerId = "") {
  return Math.max(0, ...(trickHistory || []).map((trick) => {
    if (trick?.leaderId !== roomPlayerId) return 0;
    const leadPlay = (trick.plays || []).find((play) => play?.playerId === roomPlayerId);
    return Array.isArray(leadPlay?.cards) ? leadPlay.cards.length : 0;
  }));
}

export function fryActionCount(setupData = {}, roomPlayerId = "") {
  return (setupData?.fry?.history || [])
    .filter((action) => action?.playerId === roomPlayerId)
    .length;
}

export function buildModeAchievementMetrics(games = [], tags = [], mode = "pvp") {
  const modeGames = games.filter((game) => game.game_mode === mode);
  const modeTags = tags.filter((tag) => tag.game_mode === mode);
  const streaks = calculateStreaks(modeGames.map((game) => Boolean(game.won)));
  const evaluationCountsByGame = new Map();
  modeTags.forEach((tag) => {
    evaluationCountsByGame.set(tag.game_id, (evaluationCountsByGame.get(tag.game_id) || 0) + 1);
  });
  return {
    [`${mode}GamesPlayed`]: modeGames.length,
    [`${mode}Wins`]: modeGames.filter((game) => game.won).length,
    [`${mode}MaxWinStreak`]: streaks.maxWinStreak,
    [`${mode}MaxLossStreak`]: streaks.maxLossStreak,
    [`${mode}BankerGames`]: modeGames.filter((game) => game.role === "庄家").length,
    [`${mode}BottomWins`]: modeGames.filter((game) => game.bottom_win).length,
    [`${mode}TotalTrickScore`]: modeGames.reduce(
      (total, game) => total + (Number(game.trick_score) || 0),
      0
    ),
    [`${mode}TotalEnemyRedFives`]: modeGames.reduce(
      (total, game) => total + (Number(game.enemy_red_fives) || 0),
      0
    ),
    [`${mode}MaxEnemyRedFives`]: Math.max(
      0,
      ...modeGames.map((game) => Number(game.enemy_red_fives) || 0)
    ),
    [`${mode}MaxDraggedRedFives`]: Math.max(
      0,
      ...modeGames.map((game) => Number(game.dragged_red_fives) || 0)
    ),
    [`${mode}MvpCount`]: modeTags.filter((tag) => tag.tag_code === "mvp").length,
    [`${mode}SupportCount`]: modeTags.filter((tag) => tag.tag_code === "support").length,
    [`${mode}EvaluationTitleCount`]: modeTags.length,
    [`${mode}DistinctEvaluationTitles`]: new Set(modeTags.map((tag) => tag.tag_code)).size,
    [`${mode}MaxEvaluationTitlesInGame`]: Math.max(0, ...evaluationCountsByGame.values()),
    [`${mode}MaxLeadPlayCards`]: Math.max(
      0,
      ...modeGames.map((game) => Math.max(
        Number(game.max_lead_play_cards) || 0,
        maximumLeadPlayCards(game.trick_history, game.room_player_id)
      ))
    ),
    [`${mode}MaxFryActions`]: Math.max(
      0,
      ...modeGames.map((game) => Math.max(
        Number(game.fry_actions) || 0,
        fryActionCount(game.setup_data, game.room_player_id)
      ))
    ),
    [`${mode}TotalFryActions`]: modeGames.reduce(
      (total, game) => total + Math.max(
        Number(game.fry_actions) || 0,
        fryActionCount(game.setup_data, game.room_player_id)
      ),
      0
    ),
    [`${mode}ZeroTrickScoreWins`]: modeGames.filter(
      (game) => game.won && (Number(game.trick_score) || 0) === 0
    ).length
  };
}

export function buildAchievementState(metrics = {}, claimedRows = [], equippedTitleId = "") {
  const claimedById = new Map(claimedRows.map((row) => [row.achievementId, row]));
  const achievements = ACHIEVEMENTS.map((definition) => {
    const progress = Math.max(0, Math.trunc(Number(metrics[definition.metric]) || 0));
    const claimed = claimedById.get(definition.id) || null;
    return {
      ...definition,
      progress,
      completed: progress >= definition.target,
      claimed: Boolean(claimed),
      claimedAt: claimed?.claimedAt || null
    };
  });
  const ownedTitles = achievements
    .filter((item) => item.claimed && item.title)
    .map((item) => item.title);
  const validEquipped = ownedTitles.some((title) => title.id === equippedTitleId) ? equippedTitleId : "";
  return {
    rulesVersion: ACHIEVEMENT_RULES.version,
    categories: ACHIEVEMENT_CATEGORIES,
    achievements,
    ownedTitles,
    equippedTitleId: validEquipped,
    equippedTitle: validEquipped ? ACHIEVEMENT_TITLE_BY_ID.get(validEquipped) || null : null,
    totalCount: achievements.length,
    claimedCount: achievements.filter((item) => item.claimed).length,
    claimableCount: achievements.filter((item) => item.completed && !item.claimed).length
  };
}
