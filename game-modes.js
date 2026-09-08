export const GAME_MODE_PVP = "pvp";
export const GAME_MODE_PVE = "pve";

export const PLAY_MODE_BRAWL = "brawl";
export const PLAY_MODE_TEAM = "team";

export const TEAM_A = "a";
export const TEAM_B = "b";

export const PVP_BRAWL_MIN_PLAYERS = 5;
export const PVP_TEAM_MIN_PLAYERS = 4;
export const MAX_GAME_PLAYERS = 9;
export const PVE_HUMAN_COUNTS = new Set([2, 3, 4]);

export function normalizeGameMode(value) {
  return value === GAME_MODE_PVE ? GAME_MODE_PVE : GAME_MODE_PVP;
}

export function normalizePlayMode(value, gameMode = GAME_MODE_PVP) {
  if (normalizeGameMode(gameMode) === GAME_MODE_PVE) return PLAY_MODE_TEAM;
  return value === PLAY_MODE_TEAM ? PLAY_MODE_TEAM : PLAY_MODE_BRAWL;
}

export function gameModeName(value) {
  return normalizeGameMode(value) === GAME_MODE_PVE ? "PVE" : "PVP";
}

export function playModeName(value, gameMode = GAME_MODE_PVP) {
  return normalizePlayMode(value, gameMode) === PLAY_MODE_TEAM ? "战队模式" : "乱斗模式";
}

export function isFixedTeamGame(room) {
  return normalizePlayMode(room?.playMode, room?.gameMode) === PLAY_MODE_TEAM;
}

export function oppositeTeam(team) {
  return team === TEAM_A ? TEAM_B : TEAM_A;
}

export function normalizedPveHumanCount(value) {
  const parsed = Number(value);
  return PVE_HUMAN_COUNTS.has(parsed) ? parsed : 2;
}

export function humanPlayers(room) {
  return (room?.players || []).filter((player) => !player.test);
}

export function pveRobotPlayers(room) {
  return (room?.players || []).filter((player) => player.test && player.pveRobot);
}

export function roomPlayerLimits(room) {
  if (normalizeGameMode(room?.gameMode) === GAME_MODE_PVE) {
    const humans = normalizedPveHumanCount(room?.pveHumanCount);
    return { minPlayers: humans * 2, maxPlayers: humans * 2, humanTarget: humans };
  }
  if (normalizePlayMode(room?.playMode, room?.gameMode) === PLAY_MODE_TEAM) {
    return { minPlayers: PVP_TEAM_MIN_PLAYERS, maxPlayers: MAX_GAME_PLAYERS, humanTarget: null };
  }
  return { minPlayers: PVP_BRAWL_MIN_PLAYERS, maxPlayers: MAX_GAME_PLAYERS, humanTarget: null };
}

export function teamCounts(players) {
  return (players || []).reduce((counts, player) => {
    if (player.squad === TEAM_A) counts.a += 1;
    if (player.squad === TEAM_B) counts.b += 1;
    return counts;
  }, { a: 0, b: 0 });
}

export function validateFixedTeams(room) {
  if (!isFixedTeamGame(room)) return { valid: true, error: "" };
  const players = room?.players || [];
  const counts = teamCounts(players);
  if (counts.a + counts.b !== players.length) return { valid: false, error: "请先为所有玩家分队" };
  if (Math.abs(counts.a - counts.b) > 1 || Math.min(counts.a, counts.b) < 2) {
    return { valid: false, error: "两队人数需相等或只相差 1 人，且每队至少 2 人" };
  }
  if (normalizeGameMode(room?.gameMode) === GAME_MODE_PVE) {
    const target = normalizedPveHumanCount(room?.pveHumanCount);
    const humans = humanPlayers(room);
    const robots = pveRobotPlayers(room);
    if (humans.length !== target || robots.length !== target || players.length !== target * 2) {
      return { valid: false, error: `需要 ${target} 名真人玩家对战 ${target} 名电脑` };
    }
    const humanTeams = new Set(humans.map((player) => player.squad));
    const robotTeams = new Set(robots.map((player) => player.squad));
    if (humanTeams.size !== 1 || robotTeams.size !== 1 || [...humanTeams][0] === [...robotTeams][0]) {
      return { valid: false, error: "真人玩家必须同队，并与电脑队对阵" };
    }
  }
  return { valid: true, error: "" };
}

function shuffled(values, random = Math.random) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

export function assignBalancedTeams(players, random = Math.random) {
  const randomized = shuffled(players || [], random);
  const firstTeamSize = Math.ceil(randomized.length / 2);
  randomized.forEach((player, index) => {
    player.squad = index < firstTeamSize ? TEAM_A : TEAM_B;
  });
  return randomized;
}

function cyclicDistance(index, size) {
  return Math.min(index, size - index);
}

function sameTeamEdges(pattern) {
  const edges = [];
  for (let index = 0; index < pattern.length; index += 1) {
    const next = (index + 1) % pattern.length;
    if (pattern[index] === pattern[next]) edges.push([index, next]);
  }
  return edges;
}

function teamPatterns(team, otherTeam, ownCount, otherCount) {
  const length = ownCount + otherCount;
  const results = [];
  function visit(pattern, remainingOwn, remainingOther) {
    if (pattern.length === length) {
      results.push(pattern);
      return;
    }
    if (remainingOwn) visit([...pattern, team], remainingOwn - 1, remainingOther);
    if (remainingOther) visit([...pattern, otherTeam], remainingOwn, remainingOther - 1);
  }
  visit([team], ownCount - 1, otherCount);
  return results;
}

export function arrangeFixedTeamSeats(players, bankerId, random = Math.random) {
  const banker = (players || []).find((player) => player.id === bankerId);
  if (!banker || (banker.squad !== TEAM_A && banker.squad !== TEAM_B)) return [...(players || [])];
  const otherTeam = oppositeTeam(banker.squad);
  const ownPlayers = (players || []).filter((player) => player.id !== bankerId && player.squad === banker.squad);
  const otherPlayers = (players || []).filter((player) => player.squad === otherTeam);
  const patterns = teamPatterns(banker.squad, otherTeam, ownPlayers.length + 1, otherPlayers.length);
  const ranked = patterns.map((pattern) => {
    const edges = sameTeamEdges(pattern);
    const edgeDistance = edges.length
      ? Math.max(...edges.map(([left, right]) => Math.min(cyclicDistance(left, pattern.length), cyclicDistance(right, pattern.length))))
      : pattern.length;
    return { pattern, sameEdges: edges.length, edgeDistance };
  });
  const fewestEdges = Math.min(...ranked.map((item) => item.sameEdges));
  const candidatesByEdges = ranked.filter((item) => item.sameEdges === fewestEdges);
  const farthestEdge = Math.max(...candidatesByEdges.map((item) => item.edgeDistance));
  const candidates = candidatesByEdges.filter((item) => item.edgeDistance === farthestEdge);
  const selected = candidates[Math.floor(random() * candidates.length)].pattern;
  const teamQueues = {
    [banker.squad]: shuffled(ownPlayers, random),
    [otherTeam]: shuffled(otherPlayers, random)
  };
  return selected.map((team, index) => index === 0 ? banker : teamQueues[team].shift());
}

export function idleTargetPercent(room) {
  if (!isFixedTeamGame(room)) return null;
  const counts = teamCounts(room.players);
  return counts.a === counts.b ? 40 : 50;
}
