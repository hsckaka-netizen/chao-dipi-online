import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomInt } from "node:crypto";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT || 3000);

const MIN_PLAYERS = 5;
const MAX_PLAYERS = 7;
const HAND_SIZE = 53;

const suits = [
  { id: "S", name: "黑桃", symbol: "♠", color: "black", sort: 0 },
  { id: "H", name: "红桃", symbol: "♥", color: "red", sort: 1 },
  { id: "C", name: "草花", symbol: "♣", color: "black", sort: 2 },
  { id: "D", name: "方块", symbol: "♦", color: "red", sort: 3 }
];

const rankOrder = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"];
const rankSort = new Map(rankOrder.map((rank, index) => [rank, index]));
const suitById = new Map(suits.map((suit) => [suit.id, suit]));
const suitStrength = new Map([
  ["D", 0],
  ["C", 1],
  ["H", 2],
  ["S", 3]
]);
const rooms = new Map();
const initialPlayerProfiles = [
  { id: "player-benlei", name: "奔雷" },
  { id: "player-biesan", name: "瘪三" },
  { id: "player-denghuang", name: "登黄" },
  { id: "player-diaonan", name: "吊男" },
  { id: "player-gelu", name: "格鲁" },
  { id: "player-hanya", name: "寒鸭" },
  { id: "player-haohao", name: "浩浩" },
  { id: "player-jiangmen", name: "姜门" },
  { id: "player-jiangzha", name: "蒋渣" },
  { id: "player-lafang", name: "拉芳" },
  { id: "player-nanju", name: "楠局" },
  { id: "player-shuainan", name: "耍男" },
  { id: "player-tieniu", name: "铁牛" },
  { id: "player-zhengwei", name: "政委" },
  { id: "player-chenran", name: "陈然" }
];
const playerProfiles = new Map(initialPlayerProfiles.map((profile) => [
  profile.id,
  {
    id: profile.id,
    name: profile.name,
    avatarUrl: profile.avatarUrl || "",
    builtIn: true,
    updatedAt: now()
  }
]));

function id(size = 8) {
  return randomBytes(size).toString("base64url");
}

function roomId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i += 1) out += alphabet[randomInt(alphabet.length)];
  return out;
}

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 16);
}

function now() {
  return new Date().toISOString();
}

function addEvent(room, text) {
  room.events.unshift({ id: id(6), at: now(), text });
  room.events = room.events.slice(0, 30);
}

function publicProfile(profile) {
  return {
    id: profile.id,
    name: profile.name,
    avatarUrl: profile.avatarUrl || "",
    builtIn: Boolean(profile.builtIn),
    updatedAt: profile.updatedAt
  };
}

function profileNameTaken(name, exceptId = "") {
  return [...playerProfiles.values()].some((profile) => profile.id !== exceptId && profile.name === name);
}

function profilesList() {
  return [...playerProfiles.values()]
    .map(publicProfile)
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
}

function profileForId(profileId) {
  return playerProfiles.get(String(profileId || ""));
}

function createPlayer(profileOrName, host = false, test = false) {
  const profile = typeof profileOrName === "object" ? profileOrName : null;
  const name = profile ? profile.name : profileOrName;
  return {
    id: id(9),
    token: id(18),
    name,
    profileId: profile?.id || null,
    avatarUrl: profile?.avatarUrl || "",
    host,
    test,
    connected: false,
    ready: Boolean(test),
    score: 0,
    draggedRedFives: 0,
    draggedDiamondFives: 0,
    hand: []
  };
}

function syncProfileToRooms(profile) {
  for (const room of rooms.values()) {
    let changed = false;
    room.players.forEach((player) => {
      if (player.profileId !== profile.id) return;
      player.name = profile.name;
      player.avatarUrl = profile.avatarUrl || "";
      changed = true;
    });
    if (changed) broadcast(room);
  }
}

function playerProfileFromBody(body) {
  const profile = profileForId(body.profileId);
  if (!profile) return { error: "请选择玩家列表里的玩家", status: 400 };
  return { profile };
}

function createEmptyTrick(number = 1, leaderId = null) {
  return {
    number,
    leaderId,
    winnerId: null,
    winnerName: null,
    points: 0,
    winningPlayIndex: null,
    plays: []
  };
}

function createDeck(deckCount) {
  const deck = [];
  for (let deckIndex = 1; deckIndex <= deckCount; deckIndex += 1) {
    for (const suit of suits) {
      for (const rank of rankOrder) {
        deck.push({
          id: `${deckIndex}-${suit.id}-${rank}`,
          deck: deckIndex,
          type: "normal",
          suit: suit.id,
          suitName: suit.name,
          symbol: suit.symbol,
          color: suit.color,
          rank,
          label: `${suit.symbol}${rank}`,
          sort: suit.sort * 100 + rankSort.get(rank)
        });
      }
    }
    deck.push({
      id: `${deckIndex}-JOKER-BIG`,
      deck: deckIndex,
      type: "joker",
      joker: "big",
      color: "red",
      rank: "JOKER",
      label: "JOKER",
      sort: 500
    });
    deck.push({
      id: `${deckIndex}-JOKER-SMALL`,
      deck: deckIndex,
      type: "joker",
      joker: "small",
      color: "black",
      rank: "JOKER",
      label: "JOKER",
      sort: 501
    });
  }
  return deck;
}

function shuffle(cards) {
  const copy = [...cards];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function sortHand(hand) {
  return [...hand].sort((a, b) => a.sort - b.sort || a.deck - b.deck || a.id.localeCompare(b.id));
}

function deal(room) {
  const count = room.players.length;
  const deck = shuffle(createDeck(count));
  room.players.forEach((player, playerIndex) => {
    const start = playerIndex * HAND_SIZE;
    player.hand = sortHand(deck.slice(start, start + HAND_SIZE));
    player.score = 0;
    player.draggedRedFives = 0;
    player.draggedDiamondFives = 0;
    player.ready = false;
  });
  room.kitty = deck.slice(count * HAND_SIZE, count * HAND_SIZE + count);
  room.status = "dealt";
  room.stage = "bidding";
  room.phase = "叫主/抢主";
  room.startedAt = now();
  room.kittySize = count;
  room.bankerId = null;
  room.trumpSuit = null;
  room.doglegCard = null;
  room.doglegPlayerIds = [];
  room.doglegNeeded = count >= 7 ? 2 : 1;
  room.result = null;
  room.setup = {
    bid: null,
    biddingTurnPlayerId: null,
    passIds: [],
    fry: null
  };
  room.currentTrick = null;
  room.trickHistory = [];
}

function readyPlayerCount(room) {
  return room.players.filter((player) => player.ready).length;
}

function allPlayersReady(room) {
  return room.players.length > 0 && room.players.every((player) => player.ready);
}

function resetRoomToLobby(room, options = {}) {
  const readyPlayerId = options.readyPlayerId || null;
  const previousReady = new Map(room.players.map((player) => [player.id, Boolean(player.ready)]));
  room.status = "lobby";
  room.stage = "lobby";
  room.phase = "等待玩家加入";
  room.startedAt = null;
  room.kitty = [];
  room.kittySize = room.players.length;
  room.bankerId = null;
  room.trumpSuit = null;
  room.doglegCard = null;
  room.doglegPlayerIds = [];
  room.doglegNeeded = room.players.length >= 7 ? 2 : 1;
  room.result = null;
  room.setup = { bid: null, biddingTurnPlayerId: null, passIds: [], fry: null };
  room.currentTrick = null;
  room.trickHistory = [];
  room.players.forEach((player) => {
    player.hand = [];
    player.score = 0;
    player.draggedRedFives = 0;
    player.draggedDiamondFives = 0;
    player.ready = player.test || player.id === readyPlayerId || (options.preserveReady && previousReady.get(player.id));
  });
}

function publicCard(card) {
  return {
    id: card.id,
    label: card.label,
    suit: card.suit || null,
    suitName: card.suitName || null,
    symbol: card.symbol || "",
    color: card.color,
    rank: card.rank,
    deck: card.deck,
    type: card.type,
    joker: card.joker || null
  };
}

function playerFor(room, playerId, token) {
  return room.players.find((player) => player.id === playerId && player.token === token) || null;
}

function playerName(room, playerId) {
  return room.players.find((player) => player.id === playerId)?.name || "玩家";
}

function suitName(suitId) {
  return suitById.get(suitId)?.name || "";
}

function publicBid(room, bid) {
  if (!bid) return null;
  return {
    playerId: bid.playerId,
    playerName: playerName(room, bid.playerId),
    count: bid.count,
    suit: bid.suit,
    suitName: suitName(bid.suit),
    random: Boolean(bid.random)
  };
}

function currentTrumpSuit(room) {
  const fry = room.setup?.fry || null;
  if (room.trumpSuit) return room.trumpSuit;
  if (room.stage === "fry-burying" && fry?.pendingBid?.suit) return fry.pendingBid.suit;
  if (fry?.lastBid?.suit) return fry.lastBid.suit;
  return room.setup?.bid?.suit || null;
}

function setupSnapshot(room) {
  const fry = room.setup?.fry || null;
  const currentSuit = currentTrumpSuit(room);
  return {
    stage: room.stage,
    bankerId: room.bankerId,
    bankerName: room.bankerId ? playerName(room, room.bankerId) : "",
    trumpSuit: room.trumpSuit,
    trumpSuitName: room.trumpSuit ? suitName(room.trumpSuit) : "",
    currentTrumpSuit: currentSuit,
    currentTrumpSuitName: currentSuit ? suitName(currentSuit) : "",
    doglegCard: room.doglegCard,
    doglegPlayerIds: room.doglegPlayerIds || [],
    doglegPlayerNames: (room.doglegPlayerIds || []).map((playerId) => playerName(room, playerId)),
    doglegNeeded: room.doglegNeeded || 0,
    bid: publicBid(room, room.setup?.bid),
    bidPassIds: room.setup?.passIds || [],
    biddingTurnPlayerId: room.setup?.biddingTurnPlayerId || null,
    biddingTurnPlayerName: room.setup?.biddingTurnPlayerId ? playerName(room, room.setup.biddingTurnPlayerId) : "",
    fry: fry
      ? {
          currentPlayerId: fry.currentPlayerId,
          currentPlayerName: fry.currentPlayerId ? playerName(room, fry.currentPlayerId) : "",
          lastFryerId: fry.lastFryerId,
          lastFryerName: fry.lastFryerId ? playerName(room, fry.lastFryerId) : "",
          lastBid: publicBid(room, fry.lastBid),
          pendingBid: publicBid(room, fry.pendingBid),
          passesSinceLast: fry.passesSinceLast,
          passIds: fry.passIds || []
        }
      : null
  };
}

function playerRole(room, playerId) {
  if (room.bankerId === playerId) return "主";
  if ((room.doglegPlayerIds || []).includes(playerId)) return "狗腿";
  if (room.bankerId) return "闲家";
  return "";
}

function trickSnapshot(room, trick) {
  if (!trick) return null;
  const currentTurnPlayerId = trick === room.currentTrick ? expectedPlayerId(room) : null;
  const turnIndexByPlayerId = new Map(playOrder(room, trick.leaderId || room.hostId).map((player, index) => [player.id, index]));
  return {
    number: trick.number,
    leaderId: trick.leaderId,
    leaderName: trick.leaderId ? playerName(room, trick.leaderId) : "",
    currentTurnPlayerId,
    currentTurnPlayerName: currentTurnPlayerId ? playerName(room, currentTurnPlayerId) : "",
    winnerId: trick.winnerId,
    winnerName: trick.winnerName,
    points: trick.points || 0,
    winningPlayIndex: trick.winningPlayIndex,
    plays: room.players.map((player) => {
      const rawPlayIndex = trick.plays.findIndex((item) => item.playerId === player.id);
      const play = rawPlayIndex >= 0 ? trick.plays[rawPlayIndex] : null;
      return {
        playerId: player.id,
        playerName: player.name,
        avatarUrl: player.avatarUrl || "",
        role: playerRole(room, player.id),
        played: Boolean(play),
        winning: rawPlayIndex >= 0 && rawPlayIndex === trick.winningPlayIndex,
        turnIndex: turnIndexByPlayerId.get(player.id) ?? null,
        at: play?.at || null,
        cards: play ? play.cards.map(publicCard) : []
      };
    })
  };
}

function roomSnapshot(room, viewer = null) {
  const canViewKitty = Boolean(viewer && room.kitty.length && room.setup?.fry?.lastFryerId === viewer.id);
  const kittyViewerId = room.setup?.fry?.lastFryerId || null;
  const readyCount = readyPlayerCount(room);
  const allReady = allPlayersReady(room);
  return {
    roomId: room.id,
    status: room.status,
    stage: room.stage,
    phase: room.phase,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    handSize: HAND_SIZE,
    kittyCount: room.kitty.length,
    kittySize: room.kittySize || room.players.length,
    canViewKitty,
    kittyViewerId,
    kittyViewerName: kittyViewerId ? playerName(room, kittyViewerId) : "",
    kitty: canViewKitty ? room.kitty.map(publicCard) : [],
    createdAt: room.createdAt,
    startedAt: room.startedAt,
    readyCount,
    allReady,
    hostId: room.hostId,
    setup: setupSnapshot(room),
    viewer: viewer ? { id: viewer.id, name: viewer.name, avatarUrl: viewer.avatarUrl || "", host: viewer.host, ready: Boolean(viewer.ready) } : null,
    players: room.players.map((player) => ({
      id: player.id,
      profileId: player.profileId || null,
      name: player.name,
      avatarUrl: player.avatarUrl || "",
      host: player.host,
      test: player.test,
      role: playerRole(room, player.id),
      connected: player.connected,
      ready: Boolean(player.ready),
      score: player.score || 0,
      draggedRedFives: player.draggedRedFives || 0,
      draggedDiamondFives: player.draggedDiamondFives || 0,
      cardCount: player.hand.length
    })),
    hand: viewer ? viewer.hand.map(publicCard) : [],
    currentTrick: trickSnapshot(room, room.currentTrick),
    trickHistory: room.trickHistory.map((trick) => trickSnapshot(room, trick)),
    result: room.result,
    events: room.events
  };
}

function requirePlayer(res, room, playerId, token) {
  const viewer = playerFor(room, playerId, token);
  if (!viewer) writeJson(res, 401, { error: "玩家身份已失效" });
  return viewer;
}

function updateDraggedFiveStats(room, trick, winnerId) {
  trick.plays.forEach((play) => {
    if (play.playerId === winnerId) return;
    const player = playerById(room, play.playerId);
    if (!player) return;
    play.cards.forEach((card) => {
      if (card.type !== "normal" || card.rank !== "5") return;
      if (card.suit === "H") player.draggedRedFives = (player.draggedRedFives || 0) + 1;
      if (card.suit === "D") player.draggedDiamondFives = (player.draggedDiamondFives || 0) + 1;
    });
  });
}

function bankerTeamIds(room) {
  return [room.bankerId, ...(room.doglegPlayerIds || [])].filter(Boolean);
}

function idleTeamIds(room) {
  const bankerIds = new Set(bankerTeamIds(room));
  return room.players.filter((player) => !bankerIds.has(player.id)).map((player) => player.id);
}

function winThreshold(playerCount) {
  if (playerCount === 5) return 250;
  if (playerCount === 6) return 360;
  if (playerCount === 7) return 350;
  return Math.round(playerCount * 100 * 0.5);
}

function roundGameScore(value) {
  return Math.round(value * 100) / 100;
}

function gameScoreText(value) {
  const rounded = roundGameScore(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function teamName(team) {
  return team === "idle" ? "闲家" : "庄家";
}

function finishGame(room, completedTrick) {
  if (room.result) return;

  const bankerIds = bankerTeamIds(room);
  const bankerIdSet = new Set(bankerIds);
  const idleIds = idleTeamIds(room);
  const bottomWinnerId = completedTrick.winnerId;
  const bottomWinnerTeam = bankerIdSet.has(bottomWinnerId) ? "banker" : "idle";
  const bottomPoints = cardsPoint(room.kitty);
  const bottomCards = room.kitty.map(publicCard);
  const bottomDraggedRedFives = bottomWinnerTeam === "idle"
    ? room.kitty.filter((card) => card.type === "normal" && card.rank === "5" && card.suit === "H").length
    : 0;
  const bottomDraggedDiamondFives = bottomWinnerTeam === "idle"
    ? room.kitty.filter((card) => card.type === "normal" && card.rank === "5" && card.suit === "D").length
    : 0;

  if (bottomWinnerTeam === "idle" && bottomPoints) {
    const winner = playerById(room, bottomWinnerId);
    if (winner) winner.score = (winner.score || 0) + bottomPoints * 2;
  }

  if (bottomDraggedRedFives || bottomDraggedDiamondFives) {
    const banker = playerById(room, room.bankerId);
    if (banker) {
      banker.draggedRedFives = (banker.draggedRedFives || 0) + bottomDraggedRedFives;
      banker.draggedDiamondFives = (banker.draggedDiamondFives || 0) + bottomDraggedDiamondFives;
    }
  }

  const threshold = winThreshold(room.players.length);
  const idleScore = idleIds.reduce((sum, playerId) => sum + (playerById(room, playerId)?.score || 0), 0);
  const scoreDiff = idleScore - threshold;
  const baseScore = idleScore >= threshold ? 2 : -2;
  const scoreStep = scoreDiff >= 0 ? Math.floor(scoreDiff / 40) : -Math.floor(Math.abs(scoreDiff) / 40);
  const bottomDelta = bottomWinnerTeam === "idle" ? 1 : -1;

  let bankerDraggedValue = 0;
  let idleDraggedValue = 0;
  room.players.forEach((player) => {
    const value = (player.draggedRedFives || 0) * 2 + (player.draggedDiamondFives || 0);
    if (bankerIdSet.has(player.id)) bankerDraggedValue += value;
    else idleDraggedValue += value;
  });
  const bottomDraggedExtra = bottomDraggedRedFives * 2 + bottomDraggedDiamondFives;
  const draggedDelta = bankerDraggedValue - idleDraggedValue + bottomDraggedExtra;

  const idleEachScore = baseScore + scoreStep + bottomDelta + draggedDelta;
  const bankerEachScore = bankerIds.length ? -idleEachScore * idleIds.length / bankerIds.length : 0;
  const winnerTeam = idleScore >= threshold ? "idle" : "banker";

  room.status = "finished";
  room.stage = "finished";
  room.phase = `本局结束：${teamName(winnerTeam)}获胜`;
  room.currentTrick = null;
  room.players.forEach((player) => {
    player.ready = Boolean(player.test);
  });
  room.result = {
    finishedAt: now(),
    playerCount: room.players.length,
    bankerTeamIds: bankerIds,
    bankerTeamNames: bankerIds.map((playerId) => playerName(room, playerId)),
    idleTeamIds: idleIds,
    idleTeamNames: idleIds.map((playerId) => playerName(room, playerId)),
    threshold,
    idleScore,
    scoreDiff,
    winnerTeam,
    winnerTeamName: teamName(winnerTeam),
    bottomWinnerId,
    bottomWinnerName: playerName(room, bottomWinnerId),
    bottomWinnerTeam,
    bottomWinnerTeamName: teamName(bottomWinnerTeam),
    bottomPoints,
    bottomScoreAddedToIdle: bottomWinnerTeam === "idle" ? bottomPoints * 2 : 0,
    bottomCards,
    bottomDraggedRedFives,
    bottomDraggedDiamondFives,
    baseScore,
    scoreStep,
    bottomDelta,
    bankerDraggedValue,
    idleDraggedValue,
    bottomDraggedExtra,
    draggedDelta,
    idleEachScore: roundGameScore(idleEachScore),
    bankerEachScore: roundGameScore(bankerEachScore),
    idleEachScoreText: gameScoreText(idleEachScore),
    bankerEachScoreText: gameScoreText(bankerEachScore),
    playerResults: room.players.map((player) => {
      const isBankerTeam = bankerIdSet.has(player.id);
      return {
        playerId: player.id,
        name: player.name,
        role: playerRole(room, player.id),
        team: isBankerTeam ? "banker" : "idle",
        teamName: isBankerTeam ? "庄家" : "闲家",
        trickScore: player.score || 0,
        draggedRedFives: player.draggedRedFives || 0,
        draggedDiamondFives: player.draggedDiamondFives || 0,
        gameScore: roundGameScore(isBankerTeam ? bankerEachScore : idleEachScore),
        gameScoreText: gameScoreText(isBankerTeam ? bankerEachScore : idleEachScore)
      };
    })
  };

  addEvent(room, `本局结束：${teamName(winnerTeam)}获胜，闲家 ${idleScore}/${threshold} 分，闲家每人 ${room.result.idleEachScoreText} 分，庄家每人 ${room.result.bankerEachScoreText} 分`);
}

function completeCurrentTrick(room) {
  const completed = room.currentTrick;
  const outcome = settleTrick(room, completed);
  Object.assign(completed, outcome);
  updateDraggedFiveStats(room, completed, outcome.winnerId);
  const winner = room.players.find((player) => player.id === outcome.winnerId);
  if (winner) winner.score = (winner.score || 0) + outcome.points;
  room.trickHistory.push(completed);
  addEvent(room, `第 ${completed.number} 轮结束：${outcome.winnerName} 获得 ${outcome.points} 分，下轮先出`);
  if (room.players.every((player) => player.hand.length === 0)) {
    finishGame(room, completed);
    return;
  }
  room.currentTrick = createEmptyTrick(completed.number + 1, outcome.winnerId);
}

function followSuit(card) {
  return card.type === "joker" ? "JOKER" : card.suit;
}

function followSuitName(suit) {
  if (suit === "TRUMP") return "主牌";
  if (suit === "JOKER") return "王";
  return suitById.get(suit)?.name || "该花色";
}

function uniqueFollowSuits(cards) {
  return [...new Set(cards.map(followSuit).filter(Boolean))];
}

function isMainPlayCard(card, trumpSuit) {
  if (!card) return false;
  if (isCompareCard(card, trumpSuit)) return true;
  return card.type === "normal" && trumpSuit && card.suit === trumpSuit;
}

function playSuit(card, trumpSuit) {
  if (isMainPlayCard(card, trumpSuit)) return "TRUMP";
  return followSuit(card);
}

function uniquePlaySuits(cards, trumpSuit) {
  return [...new Set(cards.map((card) => playSuit(card, trumpSuit)).filter(Boolean))];
}

function mainCardPower(card, trumpSuit) {
  if (card.type === "normal" && card.suit === "H" && card.rank === "5") return 0;
  if (card.type === "normal" && card.suit === "D" && card.rank === "5") return 1;
  if (card.joker === "big") return 2;
  if (card.joker === "small") return 3;
  if (card.type === "normal" && card.rank === "3" && trumpSuit) {
    if (card.suit === trumpSuit) return 4;
    if (cardColor(card) === suitById.get(trumpSuit)?.color) return 5;
  }
  if (card.type === "normal" && card.rank === "2") {
    if (card.suit === trumpSuit) return 6;
    return 7;
  }
  if (card.type === "normal" && trumpSuit && card.suit === trumpSuit) {
    return 8 + (rankSort.get(card.rank) ?? 99);
  }
  return 99;
}

function patternValue(card, trumpSuit) {
  if (isMainPlayCard(card, trumpSuit)) return mainCardPower(card, trumpSuit);
  return rankSort.get(card.rank) ?? 99;
}

function patternKey(card, trumpSuit) {
  return `${playSuit(card, trumpSuit)}:${patternValue(card, trumpSuit)}`;
}

function leadInfo(trick, trumpSuit) {
  const lead = trick.plays[0];
  if (!lead) return null;
  const suitsInLead = uniquePlaySuits(lead.cards, trumpSuit);
  const pattern = detectPlayPattern(lead.cards, trumpSuit);
  return {
    count: lead.cards.length,
    suit: suitsInLead.length === 1 ? suitsInLead[0] : null,
    pattern
  };
}

function orderedPlayersFrom(room, leaderId) {
  if (!room.players.length) return [];
  const start = Math.max(0, room.players.findIndex((player) => player.id === leaderId));
  return [...room.players.slice(start), ...room.players.slice(0, start)];
}

function expectedPlayerId(room) {
  if (room.stage !== "playing") return null;
  const trick = room.currentTrick;
  if (!trick) return null;
  const leaderId = trick.leaderId || room.hostId || room.players[0]?.id || null;
  const playedIds = new Set(trick.plays.map((play) => play.playerId));
  const nextPlayer = orderedPlayersFrom(room, leaderId).find((player) => player.hand.length && !playedIds.has(player.id));
  return nextPlayer?.id || null;
}

function nextPlayerId(room, playerId) {
  const ordered = orderedPlayersFrom(room, playerId);
  return ordered[1]?.id || ordered[0]?.id || null;
}

function playerById(room, playerId) {
  return room.players.find((player) => player.id === playerId) || null;
}

function selectedCardsFromHand(player, cardIds) {
  if (!Array.isArray(cardIds) || !cardIds.length) {
    return { error: "请选择牌", status: 400 };
  }
  const uniqueCardIds = [...new Set(cardIds.map(String))];
  if (uniqueCardIds.length !== cardIds.length) {
    return { error: "不能重复选择同一张牌", status: 400 };
  }
  const cards = player.hand.filter((card) => uniqueCardIds.includes(card.id));
  if (cards.length !== uniqueCardIds.length) {
    return { error: "选择的牌不在你的手牌中", status: 400 };
  }
  return { cards, cardIds: uniqueCardIds };
}

function removeCardsFromHand(player, cardIds) {
  const selectedIds = new Set(cardIds);
  player.hand = player.hand.filter((card) => !selectedIds.has(card.id));
}

function isTwoCard(card) {
  return card.type === "normal" && card.rank === "2";
}

function bidFromCards(room, player, cardIds) {
  const selected = selectedCardsFromHand(player, cardIds);
  if (selected.error) return selected;
  if (!selected.cards.every(isTwoCard)) {
    return { error: "叫主/炒底只能选择 2", status: 400 };
  }
  const suitsInBid = uniqueFollowSuits(selected.cards);
  if (suitsInBid.length !== 1) {
    return { error: "叫主/炒底需要选择同一花色的 2", status: 400 };
  }
  return {
    playerId: player.id,
    count: selected.cards.length,
    suit: suitsInBid[0],
    random: false,
    at: now()
  };
}

function bidBeats(current, next) {
  if (!current) return next.count >= 1;
  if (current.count === 1) return next.count >= 2;
  if (next.count > current.count) return true;
  if (next.count < current.count) return false;
  return (suitStrength.get(next.suit) ?? -1) > (suitStrength.get(current.suit) ?? -1);
}

function randomSuitId() {
  return suits[randomInt(suits.length)].id;
}

function randomPlayer(room) {
  return room.players[randomInt(room.players.length)];
}

function beginBurying(room) {
  const banker = playerById(room, room.bankerId);
  if (!banker) return;
  banker.hand = sortHand([...banker.hand, ...room.kitty]);
  room.kitty = [];
  room.stage = "burying";
  room.phase = `${banker.name} 拿底，等待贴底`;
  addEvent(room, `${banker.name} 成为主，拿入 ${room.kittySize} 张底牌`);
}

function finishBidding(room) {
  const bid = room.setup.bid;
  if (!bid) return { error: "还没有玩家叫主", status: 409 };
  room.bankerId = bid.playerId;
  room.trumpSuit = null;
  room.setup.biddingTurnPlayerId = null;
  room.setup.passIds = [];
  beginBurying(room);
  return { ok: true };
}

function submitBid(room, player, cardIds) {
  if (room.stage !== "bidding") return { error: "当前不能叫主/抢主", status: 409 };
  if (room.setup.bid && room.setup.biddingTurnPlayerId !== player.id) {
    return { error: `现在轮到 ${playerName(room, room.setup.biddingTurnPlayerId)} 抢主或过`, status: 409 };
  }
  const bid = bidFromCards(room, player, cardIds);
  if (bid.error) return bid;
  if (!bidBeats(room.setup.bid, bid)) {
    return { error: "选择的 2 不能压过当前叫主", status: 400 };
  }

  room.setup.bid = bid;
  room.setup.passIds = [];
  room.setup.biddingTurnPlayerId = nextPlayerId(room, player.id);
  room.phase = `${player.name} 亮 ${bid.count} 张${suitName(bid.suit)}2，等待抢主`;
  addEvent(room, `${player.name} 亮 ${bid.count} 张${suitName(bid.suit)}2 叫/抢主`);
  return { ok: true };
}

function passBid(room, player) {
  if (room.stage !== "bidding") return { error: "当前不能过叫主", status: 409 };
  if (!room.setup.bid) return { error: "还没有玩家叫主，暂不能过", status: 409 };
  if (room.setup.biddingTurnPlayerId !== player.id) {
    return { error: `现在轮到 ${playerName(room, room.setup.biddingTurnPlayerId)} 抢主或过`, status: 409 };
  }

  if (!room.setup.passIds.includes(player.id)) room.setup.passIds.push(player.id);
  addEvent(room, `${player.name} 选择不抢主`);
  if (room.setup.passIds.length >= room.players.length - 1) {
    return finishBidding(room);
  }
  room.setup.biddingTurnPlayerId = nextPlayerId(room, player.id);
  room.phase = `等待 ${playerName(room, room.setup.biddingTurnPlayerId)} 抢主或过`;
  return { ok: true };
}

function randomDeclare(room) {
  if (room.stage !== "bidding") return { error: "当前不能随机指定主", status: 409 };
  if (room.setup.bid) return { error: "已经有人叫主，不能随机指定", status: 409 };
  const player = randomPlayer(room);
  const suit = randomSuitId();
  room.setup.bid = {
    playerId: player.id,
    count: 1,
    suit,
    random: true,
    at: now()
  };
  addEvent(room, `无人叫主，系统随机指定 ${player.name} 为主，临时花色为${suitName(suit)}`);
  return finishBidding(room);
}

function startFrying(room) {
  room.stage = "frying";
  room.phase = "炒底";
  room.setup.fry = {
    currentPlayerId: nextPlayerId(room, room.bankerId),
    lastFryerId: room.bankerId,
    lastBid: room.setup.bid,
    pendingBid: null,
    passesSinceLast: 0,
    passIds: []
  };
  addEvent(room, `开始炒底，当前底牌 ${room.kitty.length} 张`);
}

function continueFryingAfterBury(room, player) {
  const fry = room.setup.fry;
  fry.lastBid = fry.pendingBid;
  fry.lastFryerId = player.id;
  fry.pendingBid = null;
  fry.passesSinceLast = 0;
  fry.passIds = [];
  fry.currentPlayerId = nextPlayerId(room, player.id);
  room.stage = "frying";
  room.phase = `等待 ${playerName(room, fry.currentPlayerId)} 炒底或不炒`;
  addEvent(room, `${player.name} 完成炒底贴底，继续下一家`);
}

function finishFrying(room) {
  const lastBid = room.setup.fry?.lastBid || room.setup.bid;
  room.trumpSuit = lastBid?.suit || randomSuitId();
  room.stage = "dogleg";
  room.phase = `主牌为${suitName(room.trumpSuit)}，等待主选择狗腿牌`;
  addEvent(room, `炒底结束，主牌确定为${suitName(room.trumpSuit)}`);
}

function buryCards(room, player, cardIds) {
  if (room.stage !== "burying" && room.stage !== "fry-burying") {
    return { error: "当前不能贴底", status: 409 };
  }
  const ownerId = room.stage === "burying" ? room.bankerId : room.setup.fry?.currentPlayerId;
  if (player.id !== ownerId) return { error: `现在轮到 ${playerName(room, ownerId)} 贴底`, status: 409 };

  const selected = selectedCardsFromHand(player, cardIds);
  if (selected.error) return selected;
  if (selected.cards.length !== room.kittySize) {
    return { error: `需要选择 ${room.kittySize} 张牌贴到底里`, status: 400 };
  }

  removeCardsFromHand(player, selected.cardIds);
  room.kitty = selected.cards;
  addEvent(room, `${player.name} 贴入 ${selected.cards.length} 张底牌`);
  if (room.stage === "burying") {
    startFrying(room);
  } else {
    continueFryingAfterBury(room, player);
  }
  return { ok: true };
}

function passFry(room, player) {
  if (room.stage !== "frying") return { error: "当前不能选择不炒", status: 409 };
  const fry = room.setup.fry;
  if (fry.currentPlayerId !== player.id) {
    return { error: `现在轮到 ${playerName(room, fry.currentPlayerId)} 炒底或不炒`, status: 409 };
  }
  fry.passesSinceLast += 1;
  if (!fry.passIds) fry.passIds = [];
  if (!fry.passIds.includes(player.id)) fry.passIds.push(player.id);
  addEvent(room, `${player.name} 选择不炒底`);
  if (fry.passesSinceLast >= room.players.length - 1) {
    finishFrying(room);
    return { ok: true };
  }
  fry.currentPlayerId = nextPlayerId(room, player.id);
  room.phase = `等待 ${playerName(room, fry.currentPlayerId)} 炒底或不炒`;
  return { ok: true };
}

function submitFry(room, player, cardIds) {
  if (room.stage !== "frying") return { error: "当前不能炒底", status: 409 };
  const fry = room.setup.fry;
  if (fry.currentPlayerId !== player.id) {
    return { error: `现在轮到 ${playerName(room, fry.currentPlayerId)} 炒底或不炒`, status: 409 };
  }
  const bid = bidFromCards(room, player, cardIds);
  if (bid.error) return bid;
  if (!bidBeats(fry.lastBid, bid)) {
    return { error: "选择的 2 不能压过当前炒底", status: 400 };
  }

  player.hand = sortHand([...player.hand, ...room.kitty]);
  room.kitty = [];
  fry.pendingBid = bid;
  room.stage = "fry-burying";
  room.phase = `${player.name} 炒底，等待贴底`;
  addEvent(room, `${player.name} 用 ${bid.count} 张${suitName(bid.suit)}2 炒底并拿入底牌`);
  return { ok: true };
}

function cardColor(card) {
  return suitById.get(card.suit)?.color || "";
}

function isCompareCard(card, trumpSuit) {
  if (card.type === "joker") return true;
  if (card.rank === "2") return true;
  if ((card.suit === "H" || card.suit === "D") && card.rank === "5") return true;
  if (card.rank === "3" && trumpSuit && cardColor(card) === suitById.get(trumpSuit)?.color) return true;
  return false;
}

function sameDoglegCard(card, doglegCard) {
  if (!card || !doglegCard) return false;
  return card.type === "normal" && card.suit === doglegCard.suit && card.rank === doglegCard.rank;
}

function revealDoglegIfNeeded(room, player, selected) {
  if (!room.doglegCard || player.id === room.bankerId) return;
  if ((room.doglegPlayerIds || []).includes(player.id)) return;
  if ((room.doglegPlayerIds || []).length >= (room.doglegNeeded || 0)) return;
  if (!selected.some((card) => sameDoglegCard(card, room.doglegCard))) return;
  if (!room.doglegPlayerIds) room.doglegPlayerIds = [];
  room.doglegPlayerIds.push(player.id);
  addEvent(room, `${player.name} 打出狗腿牌 ${room.doglegCard.label}，身份变为狗腿`);
}

function selectDogleg(room, player, cardIds) {
  if (room.stage !== "dogleg") return { error: "当前不能选择狗腿牌", status: 409 };
  if (player.id !== room.bankerId) return { error: "只有主可以选择狗腿牌", status: 403 };
  const selected = selectedCardsFromHand(player, cardIds);
  if (selected.error) return selected;
  if (selected.cards.length !== 1) return { error: "请选择 1 张牌作为狗腿牌", status: 400 };
  const card = selected.cards[0];
  if (isCompareCard(card, room.trumpSuit)) {
    return { error: "狗腿牌不能选择比牌", status: 400 };
  }
  room.doglegCard = {
    type: card.type,
    color: card.color,
    suit: card.suit,
    suitName: card.suitName,
    symbol: card.symbol,
    rank: card.rank,
    label: card.label
  };
  room.stage = "playing";
  room.phase = `打牌中，主牌为${suitName(room.trumpSuit)}`;
  room.currentTrick = createEmptyTrick(1, room.bankerId);
  room.doglegPlayerIds = [];
  addEvent(room, `${player.name} 选择 ${card.label} 为狗腿牌，开始打牌`);
  return { ok: true };
}

function autoBuryCardIds(player, count) {
  return sortHand(player.hand).slice(-count).map((card) => card.id);
}

function autoDoglegCardId(room, player) {
  const card = sortHand(player.hand).find((item) => !isCompareCard(item, room.trumpSuit));
  return card?.id || player.hand[0]?.id || null;
}

function autoProgressTestSetup(room) {
  let actions = 0;
  let safety = room.players.length * 8;
  while (safety > 0) {
    safety -= 1;
    if (room.stage === "bidding" && room.setup.bid) {
      const player = playerById(room, room.setup.biddingTurnPlayerId);
      if (!player?.test) break;
      const result = passBid(room, player);
      if (result.error) break;
      actions += 1;
      continue;
    }

    if (room.stage === "burying") {
      const player = playerById(room, room.bankerId);
      if (!player?.test) break;
      const result = buryCards(room, player, autoBuryCardIds(player, room.kittySize));
      if (result.error) break;
      actions += 1;
      continue;
    }

    if (room.stage === "frying") {
      const player = playerById(room, room.setup.fry?.currentPlayerId);
      if (!player?.test) break;
      const result = passFry(room, player);
      if (result.error) break;
      actions += 1;
      continue;
    }

    if (room.stage === "fry-burying") {
      const player = playerById(room, room.setup.fry?.currentPlayerId);
      if (!player?.test) break;
      const result = buryCards(room, player, autoBuryCardIds(player, room.kittySize));
      if (result.error) break;
      actions += 1;
      continue;
    }

    if (room.stage === "dogleg") {
      const player = playerById(room, room.bankerId);
      if (!player?.test) break;
      const cardId = autoDoglegCardId(room, player);
      if (!cardId) break;
      const result = selectDogleg(room, player, [cardId]);
      if (result.error) break;
      actions += 1;
      continue;
    }

    if (room.stage === "playing") {
      actions += autoPlayTestPlayersUntilHuman(room);
    }
    break;
  }
  return actions;
}

function rankValue(card, trumpSuit) {
  return patternValue(card, trumpSuit);
}

function rankKey(card, trumpSuit) {
  return patternKey(card, trumpSuit);
}

function cardsByRank(cards, trumpSuit) {
  const map = new Map();
  cards.forEach((card) => {
    const key = rankKey(card, trumpSuit);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(card);
  });
  return [...map.entries()].map(([rank, rankCards]) => ({
    rank,
    cards: rankCards,
    count: rankCards.length,
    value: rankValue(rankCards[0], trumpSuit)
  }));
}

function detectPlayPattern(cards, trumpSuit) {
  if (!cards.length) return null;
  if (cards.length === 1) return { type: "single", count: 1 };

  const suitsInCards = uniquePlaySuits(cards, trumpSuit);
  const groups = cardsByRank(cards, trumpSuit).sort((a, b) => a.value - b.value);
  if (groups.length === 1) {
    if (suitsInCards.length !== 1) return null;
    return {
      type: "multi",
      count: cards.length,
      width: cards.length,
      ranks: [groups[0].rank]
    };
  }

  if (suitsInCards.length !== 1) return null;
  const width = groups[0].count;
  if (!groups.every((group) => group.count === width)) return null;
  if (groups.some((group) => group.value >= 99)) return null;

  for (let i = 1; i < groups.length; i += 1) {
    if (groups[i].value !== groups[i - 1].value + 1) return null;
  }
  return {
    type: "tractor",
    count: cards.length,
    width,
    length: groups.length,
    ranks: groups.map((group) => group.rank)
  };
}

function patternLabel(pattern) {
  if (!pattern) return "不合法牌型";
  if (pattern.type === "single") return "单张";
  if (pattern.type === "multi") return `${pattern.width} 张`;
  if (pattern.type === "tractor") return `${pattern.width} 张拖拉机`;
  return "牌型";
}

function samePattern(a, b) {
  if (!a || !b) return false;
  if (a.type !== b.type) return false;
  if (a.count !== b.count) return false;
  if (a.type === "tractor") return a.width === b.width && a.length === b.length;
  if (a.type === "multi") return a.width === b.width;
  return true;
}

function cardPoint(card) {
  if (card.rank === "5") return 5;
  if (card.rank === "10" || card.rank === "K") return 10;
  return 0;
}

function cardsPoint(cards) {
  return cards.reduce((total, card) => total + cardPoint(card), 0);
}

function playPower(cards, trumpSuit) {
  const groups = cardsByRank(cards, trumpSuit).sort((a, b) => a.value - b.value);
  return groups[0]?.value ?? 99;
}

function playComparisonAgainstLead(info, cards, trumpSuit) {
  const pattern = detectPlayPattern(cards, trumpSuit);
  if (!samePattern(info.pattern, pattern)) return null;
  if (!info.suit) return { level: 1, power: playPower(cards, trumpSuit) };
  const suitsInCards = uniquePlaySuits(cards, trumpSuit);
  if (suitsInCards.length !== 1) return null;
  const playSuitId = suitsInCards[0];
  if (playSuitId === info.suit) {
    return { level: 1, power: playPower(cards, trumpSuit) };
  }
  if (info.suit !== "TRUMP" && playSuitId === "TRUMP") {
    return { level: 2, power: playPower(cards, trumpSuit) };
  }
  return null;
}

function settleTrick(room, trick) {
  const info = leadInfo(trick, room.trumpSuit);
  if (!info || !trick.plays.length) {
    return {
      winnerId: trick.leaderId,
      winnerName: trick.leaderId ? playerName(room, trick.leaderId) : "",
      points: 0,
      winningPlayIndex: null
    };
  }

  let winningPlayIndex = 0;
  let winningComparison = playComparisonAgainstLead(info, trick.plays[0].cards, room.trumpSuit) || {
    level: 1,
    power: playPower(trick.plays[0].cards, room.trumpSuit)
  };
  trick.plays.forEach((play, index) => {
    if (index === 0) return;
    const comparison = playComparisonAgainstLead(info, play.cards, room.trumpSuit);
    if (!comparison) return;
    if (
      comparison.level > winningComparison.level ||
      (comparison.level === winningComparison.level && comparison.power < winningComparison.power)
    ) {
      winningComparison = comparison;
      winningPlayIndex = index;
    }
  });

  const winnerId = trick.plays[winningPlayIndex].playerId;
  return {
    winnerId,
    winnerName: playerName(room, winnerId),
    points: cardsPoint(trick.plays.flatMap((play) => play.cards)),
    winningPlayIndex
  };
}

function validatePlay(room, player, selected) {
  const trick = room.currentTrick;
  const expected = expectedPlayerId(room);
  if (expected && player.id !== expected) {
    return `现在轮到 ${playerName(room, expected)} 出牌`;
  }

  const info = leadInfo(trick, room.trumpSuit);

  if (!info) {
    const selectedPattern = detectPlayPattern(selected, room.trumpSuit);
    if (!selectedPattern) {
      return "首家出牌不符合牌型规则。只能出单张、同牌力多张，或连续牌力拖拉机";
    }
    const suitsInSelected = uniquePlaySuits(selected, room.trumpSuit);
    if (suitsInSelected.length > 1) {
      return "首家出牌暂时必须是同一花色或同一主牌牌组，甩牌后续单独做";
    }
    return null;
  }

  if (selected.length !== info.count) {
    return `本轮首家出了 ${info.count} 张，你也必须出 ${info.count} 张`;
  }

  if (!info.suit) return null;

  const sameSuitInHand = player.hand.filter((card) => playSuit(card, room.trumpSuit) === info.suit).length;
  const sameSuitSelected = selected.filter((card) => playSuit(card, room.trumpSuit) === info.suit).length;
  const requiredSameSuit = Math.min(info.count, sameSuitInHand);
  if (sameSuitSelected < requiredSameSuit) {
    if (sameSuitInHand >= info.count) {
      return `你手里有足够的${followSuitName(info.suit)}，必须全部出${followSuitName(info.suit)}`;
    }
    return `你手里还有 ${sameSuitInHand} 张${followSuitName(info.suit)}，必须先跟完该花色再垫其他牌`;
  }
  return null;
}

function legalAutoCards(room, player) {
  if (!player.hand.length) return [];
  const info = leadInfo(room.currentTrick, room.trumpSuit);
  if (!info) return [player.hand[0]];

  const sameSuit = player.hand.filter((card) => playSuit(card, room.trumpSuit) === info.suit);
  const others = player.hand.filter((card) => playSuit(card, room.trumpSuit) !== info.suit);
  return [...sameSuit.slice(0, info.count), ...others].slice(0, info.count);
}

function autoPlayTestPlayersUntilHuman(room) {
  if (room.stage !== "playing") return 0;
  let played = 0;
  let safety = room.players.length * 4;
  while (safety > 0) {
    safety -= 1;
    const nextPlayerId = expectedPlayerId(room);
    if (!nextPlayerId) break;
    const player = room.players.find((item) => item.id === nextPlayerId);
    if (!player) break;
    if (!player.test) break;
    const cards = legalAutoCards(room, player);
    if (!cards.length) break;
    const result = playCards(room, player, cards.map((card) => card.id));
    if (result.error) break;
    played += 1;
  }
  return played;
}

function playCards(room, player, cardIds) {
  if (room.status !== "dealt" || room.stage !== "playing") {
    return { error: "还没有进入打牌阶段，暂不能出牌", status: 409 };
  }
  if (!Array.isArray(cardIds) || cardIds.length === 0) {
    return { error: "请选择要出的牌", status: 400 };
  }
  const uniqueCardIds = [...new Set(cardIds.map(String))];
  if (uniqueCardIds.length !== cardIds.length) {
    return { error: "不能重复选择同一张牌", status: 400 };
  }
  if (room.currentTrick.plays.some((play) => play.playerId === player.id)) {
    return { error: "你本轮已经出过牌", status: 409 };
  }

  const selected = player.hand.filter((card) => uniqueCardIds.includes(card.id));
  if (selected.length !== uniqueCardIds.length) {
    return { error: "选择的牌不在你的手牌中", status: 400 };
  }
  const playError = validatePlay(room, player, selected);
  if (playError) {
    return { error: playError, status: 400 };
  }

  const selectedIds = new Set(uniqueCardIds);
  player.hand = player.hand.filter((card) => !selectedIds.has(card.id));
  room.currentTrick.plays.push({
    playerId: player.id,
    at: now(),
    cards: selected
  });
  addEvent(room, `${player.name} 第 ${room.currentTrick.number} 轮出了 ${selected.map((card) => card.label).join(" ")}`);
  revealDoglegIfNeeded(room, player, selected);

  if (room.currentTrick.plays.length === room.players.length) {
    completeCurrentTrick(room);
  }

  return { ok: true };
}

function writeJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) {
        reject(Object.assign(new Error("请求内容过大"), { status: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error("请求格式不正确"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function getRoom(res, rawRoomId) {
  const room = rooms.get(String(rawRoomId || "").toUpperCase());
  if (!room) {
    writeJson(res, 404, { error: "房间不存在" });
    return null;
  }
  return room;
}

function broadcast(room) {
  for (const client of room.clients) {
    const viewer = room.players.find((player) => player.id === client.playerId) || null;
    client.res.write(`event: state\ndata: ${JSON.stringify(roomSnapshot(room, viewer))}\n\n`);
  }
}

function updateConnection(room, playerId, connected) {
  const player = room.players.find((item) => item.id === playerId);
  if (!player) return;
  const hasOtherClient = [...room.clients].some((client) => client.playerId === playerId);
  player.connected = connected || hasOtherClient;
}

async function handleApi(req, res, pathParts, url) {
  if (pathParts[1] === "players") {
    if (req.method === "GET" && pathParts.length === 2) {
      return writeJson(res, 200, { players: profilesList() });
    }

    if (req.method === "PUT" && pathParts[2]) {
      const profile = profileForId(pathParts[2]);
      if (!profile) return writeJson(res, 404, { error: "玩家不存在" });
      const body = await readJson(req);
      const name = cleanName(body.name);
      if (!name) return writeJson(res, 400, { error: "请输入玩家名称" });
      if (profileNameTaken(name, profile.id)) return writeJson(res, 409, { error: "这个玩家名称已经存在" });
      profile.name = name;
      profile.updatedAt = now();
      playerProfiles.set(profile.id, profile);
      syncProfileToRooms(profile);
      return writeJson(res, 200, { player: publicProfile(profile), players: profilesList() });
    }

    return writeJson(res, 404, { error: "接口不存在" });
  }

  if (req.method === "POST" && pathParts[1] === "rooms" && pathParts.length === 2) {
    const body = await readJson(req);
    const selectedProfile = playerProfileFromBody(body);
    if (selectedProfile.error) return writeJson(res, selectedProfile.status, { error: selectedProfile.error });
    const profile = selectedProfile.profile;

    let nextRoomId = roomId();
    while (rooms.has(nextRoomId)) nextRoomId = roomId();

    const host = createPlayer(profile, true);
    const room = {
      id: nextRoomId,
      status: "lobby",
      stage: "lobby",
      phase: "等待玩家加入",
      createdAt: now(),
      startedAt: null,
      hostId: host.id,
      players: [host],
      kitty: [],
      kittySize: 0,
      bankerId: null,
      trumpSuit: null,
      doglegCard: null,
      doglegPlayerIds: [],
      doglegNeeded: 0,
      result: null,
      setup: { bid: null, biddingTurnPlayerId: null, passIds: [], fry: null },
      currentTrick: null,
      trickHistory: [],
      events: [],
      clients: new Set()
    };
    rooms.set(room.id, room);
    addEvent(room, `${profile.name} 创建了房间`);
    return writeJson(res, 201, {
      roomId: room.id,
      playerId: host.id,
      token: host.token,
      snapshot: roomSnapshot(room, host)
    });
  }

  if (pathParts[1] === "rooms" && pathParts[2]) {
    const room = getRoom(res, pathParts[2]);
    if (!room) return;

    if (req.method === "GET" && pathParts[3] === "state") {
      const playerId = url.searchParams.get("playerId");
      const token = url.searchParams.get("token");
      const viewer = playerFor(room, playerId, token);
      if (!viewer) return writeJson(res, 401, { error: "玩家身份已失效，请重新加入房间" });
      return writeJson(res, 200, roomSnapshot(room, viewer));
    }

    if (req.method === "POST" && pathParts[3] === "join") {
      const body = await readJson(req);
      const selectedProfile = playerProfileFromBody(body);
      if (selectedProfile.error) return writeJson(res, selectedProfile.status, { error: selectedProfile.error });
      const profile = selectedProfile.profile;
      if (room.status !== "lobby") return writeJson(res, 409, { error: "牌局已经开始，暂不能加入" });
      if (room.players.length >= MAX_PLAYERS) return writeJson(res, 409, { error: "房间已满" });
      if (room.players.some((player) => player.profileId === profile.id)) {
        return writeJson(res, 409, { error: "这个玩家已经在房间里" });
      }

      const player = createPlayer(profile, false);
      room.players.push(player);
      addEvent(room, `${profile.name} 加入了房间`);
      broadcast(room);
      return writeJson(res, 201, {
        roomId: room.id,
        playerId: player.id,
        token: player.token,
        snapshot: roomSnapshot(room, player)
      });
    }

    if (req.method === "POST" && pathParts[3] === "test-players") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      if (!viewer.host) return writeJson(res, 403, { error: "只有房主可以补测试玩家" });
      if (room.status !== "lobby") return writeJson(res, 409, { error: "牌局已经开始，不能补测试玩家" });

      const targetCount = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Number(body.targetCount) || MIN_PLAYERS));
      let added = 0;
      while (room.players.length < targetCount) {
        const nextIndex = room.players.filter((player) => player.test).length + 1;
        const player = createPlayer(`测试玩家${nextIndex}`, false, true);
        room.players.push(player);
        added += 1;
      }
      if (added) addEvent(room, `房主补入 ${added} 个测试玩家，方便本地验证`);
      broadcast(room);
      return writeJson(res, 200, roomSnapshot(room, viewer));
    }

    if (req.method === "POST" && pathParts[3] === "ready") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      if (room.status !== "lobby" && room.status !== "finished") return writeJson(res, 409, { error: "只有等待开局或本局结束后可以准备" });
      const nextReady = Boolean(body.ready);
      if (viewer.ready !== nextReady) {
        viewer.ready = nextReady;
        addEvent(room, `${viewer.name} ${nextReady ? "已准备" : "取消准备"}`);
      }
      if (room.status === "finished" && allPlayersReady(room)) {
        resetRoomToLobby(room, { preserveReady: true });
        addEvent(room, "所有玩家已确认再来一局，等待房主开局");
      }
      broadcast(room);
      return writeJson(res, 200, roomSnapshot(room, viewer));
    }

    if (req.method === "POST" && pathParts[3] === "start") {
      const body = await readJson(req);
      const viewer = playerFor(room, body.playerId, body.token);
      if (!viewer) return writeJson(res, 401, { error: "玩家身份已失效" });
      if (!viewer.host) return writeJson(res, 403, { error: "只有房主可以开始" });
      if (room.status !== "lobby") return writeJson(res, 409, { error: "牌局已经开始" });
      if (room.players.length < MIN_PLAYERS || room.players.length > MAX_PLAYERS) {
        return writeJson(res, 400, { error: `需要 ${MIN_PLAYERS}-${MAX_PLAYERS} 人才能开始` });
      }
      if (!allPlayersReady(room)) {
        return writeJson(res, 409, { error: `还有玩家未准备：${readyPlayerCount(room)}/${room.players.length}` });
      }

      deal(room);
      addEvent(room, `房主开始牌局：${room.players.length} 人，每人 ${HAND_SIZE} 张，底牌 ${room.kitty.length} 张`);
      broadcast(room);
      return writeJson(res, 200, roomSnapshot(room, viewer));
    }

    if (req.method === "POST" && pathParts[3] === "bid") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      const result = submitBid(room, viewer, body.cardIds);
      if (result.error) return writeJson(res, result.status, { error: result.error });
      const autoActions = autoProgressTestSetup(room);
      if (autoActions) addEvent(room, `测试玩家自动推进准备流程 ${autoActions} 步`);
      broadcast(room);
      return writeJson(res, 200, roomSnapshot(room, viewer));
    }

    if (req.method === "POST" && pathParts[3] === "bid-pass") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      const result = passBid(room, viewer);
      if (result.error) return writeJson(res, result.status, { error: result.error });
      const autoActions = autoProgressTestSetup(room);
      if (autoActions) addEvent(room, `测试玩家自动推进准备流程 ${autoActions} 步`);
      broadcast(room);
      return writeJson(res, 200, roomSnapshot(room, viewer));
    }

    if (req.method === "POST" && pathParts[3] === "random-bid") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      if (!viewer.host) return writeJson(res, 403, { error: "只有房主可以随机指定主" });
      const result = randomDeclare(room);
      if (result.error) return writeJson(res, result.status, { error: result.error });
      const autoActions = autoProgressTestSetup(room);
      if (autoActions) addEvent(room, `测试玩家自动推进准备流程 ${autoActions} 步`);
      broadcast(room);
      return writeJson(res, 200, roomSnapshot(room, viewer));
    }

    if (req.method === "POST" && pathParts[3] === "bury") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      const result = buryCards(room, viewer, body.cardIds);
      if (result.error) return writeJson(res, result.status, { error: result.error });
      broadcast(room);
      return writeJson(res, 200, roomSnapshot(room, viewer));
    }

    if (req.method === "POST" && pathParts[3] === "test-setup") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      if (!viewer.host) return writeJson(res, 403, { error: "只有房主可以推进测试玩家准备流程" });
      if (room.status !== "dealt" || room.stage === "playing") {
        return writeJson(res, 409, { error: "当前不在准备流程中" });
      }
      const autoActions = autoProgressTestSetup(room);
      if (!autoActions) return writeJson(res, 409, { error: "当前没有可自动推进的测试玩家" });
      addEvent(room, `房主触发测试玩家自动推进准备流程 ${autoActions} 步`);
      broadcast(room);
      return writeJson(res, 200, roomSnapshot(room, viewer));
    }

    if (req.method === "POST" && pathParts[3] === "fry") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      const result = submitFry(room, viewer, body.cardIds);
      if (result.error) return writeJson(res, result.status, { error: result.error });
      const autoActions = autoProgressTestSetup(room);
      if (autoActions) addEvent(room, `测试玩家自动推进准备流程 ${autoActions} 步`);
      broadcast(room);
      return writeJson(res, 200, roomSnapshot(room, viewer));
    }

    if (req.method === "POST" && pathParts[3] === "fry-pass") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      const result = passFry(room, viewer);
      if (result.error) return writeJson(res, result.status, { error: result.error });
      const autoActions = autoProgressTestSetup(room);
      if (autoActions) addEvent(room, `测试玩家自动推进准备流程 ${autoActions} 步`);
      broadcast(room);
      return writeJson(res, 200, roomSnapshot(room, viewer));
    }

    if (req.method === "POST" && pathParts[3] === "dogleg") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      const result = selectDogleg(room, viewer, body.cardIds);
      if (result.error) return writeJson(res, result.status, { error: result.error });
      const autoActions = autoProgressTestSetup(room);
      if (autoActions) addEvent(room, `测试玩家自动推进准备流程 ${autoActions} 步`);
      broadcast(room);
      return writeJson(res, 200, roomSnapshot(room, viewer));
    }

    if (req.method === "POST" && pathParts[3] === "play") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      const result = playCards(room, viewer, body.cardIds);
      if (result.error) return writeJson(res, result.status, { error: result.error });
      if (!viewer.test) {
        const autoPlayed = autoPlayTestPlayersUntilHuman(room);
        if (autoPlayed) addEvent(room, `测试玩家自动补出 ${autoPlayed} 次，已停在下一个真人玩家`);
      }
      broadcast(room);
      return writeJson(res, 200, roomSnapshot(room, viewer));
    }

    if (req.method === "POST" && pathParts[3] === "test-play-round") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      if (!viewer.host) return writeJson(res, 403, { error: "只有房主可以触发测试出牌" });
      if (room.status !== "dealt" || room.stage !== "playing") return writeJson(res, 409, { error: "还没有进入打牌阶段，不能测试出牌" });

      const nextPlayerId = expectedPlayerId(room);
      if (!nextPlayerId) return writeJson(res, 409, { error: "本轮没有可测试出牌的玩家" });
      const nextPlayer = room.players.find((player) => player.id === nextPlayerId);
      if (!nextPlayer?.test) {
        return writeJson(res, 409, { error: `现在轮到 ${playerName(room, nextPlayerId)}（真人），请由该玩家自己出牌` });
      }

      const autoPlayed = autoPlayTestPlayersUntilHuman(room);
      if (!autoPlayed) return writeJson(res, 409, { error: "测试玩家没有可出的牌" });
      addEvent(room, `房主触发测试玩家自动出牌 ${autoPlayed} 次`);
      broadcast(room);
      return writeJson(res, 200, roomSnapshot(room, viewer));
    }

    if (req.method === "POST" && pathParts[3] === "reset") {
      const body = await readJson(req);
      const viewer = playerFor(room, body.playerId, body.token);
      if (!viewer) return writeJson(res, 401, { error: "玩家身份已失效" });
      if (!viewer.host) return writeJson(res, 403, { error: "只有房主可以重开" });
      resetRoomToLobby(room);
      addEvent(room, "房主把房间重置到等待状态");
      broadcast(room);
      return writeJson(res, 200, roomSnapshot(room, viewer));
    }

    if (req.method === "POST" && pathParts[3] === "again") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      if (room.status === "finished") {
        if (!viewer.ready) {
          viewer.ready = true;
          addEvent(room, `${viewer.name} 选择再来一局，并已自动准备`);
        }
        if (allPlayersReady(room)) {
          resetRoomToLobby(room, { preserveReady: true });
          addEvent(room, "所有玩家已确认再来一局，等待房主开局");
        }
      } else if (room.status === "lobby") {
        viewer.ready = true;
        addEvent(room, `${viewer.name} 已准备再来一局`);
      } else {
        return writeJson(res, 409, { error: "本局还未结束，暂不能再来一局" });
      }
      broadcast(room);
      return writeJson(res, 200, roomSnapshot(room, viewer));
    }
  }

  writeJson(res, 404, { error: "接口不存在" });
}

function handleEvents(req, res, url) {
  const room = rooms.get(String(url.searchParams.get("roomId") || "").toUpperCase());
  if (!room) {
    res.writeHead(404);
    res.end("room not found");
    return;
  }
  const playerId = url.searchParams.get("playerId");
  const token = url.searchParams.get("token");
  const viewer = playerFor(room, playerId, token);
  if (!viewer) {
    res.writeHead(401);
    res.end("unauthorized");
    return;
  }

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    connection: "keep-alive",
    "x-accel-buffering": "no"
  });
  res.write(`event: state\ndata: ${JSON.stringify(roomSnapshot(room, viewer))}\n\n`);

  const client = { res, playerId: viewer.id };
  room.clients.add(client);
  viewer.connected = true;
  broadcast(room);

  const keepAlive = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 25_000);

  req.on("close", () => {
    clearInterval(keepAlive);
    room.clients.delete(client);
    updateConnection(room, viewer.id, false);
    broadcast(room);
  });
}

async function serveStatic(req, res, url) {
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const target = normalize(join(publicDir, pathname));
  if (!target.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const type = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml"
  }[extname(target)] || "application/octet-stream";

  try {
    await readFile(target);
    res.writeHead(200, { "content-type": type });
    createReadStream(target).pipe(res);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathParts = url.pathname.split("/").filter(Boolean);

  try {
    if (url.pathname === "/events") return handleEvents(req, res, url);
    if (pathParts[0] === "api") return await handleApi(req, res, pathParts, url);
    await serveStatic(req, res, url);
  } catch (error) {
    const status = error.status || 500;
    writeJson(res, status, { error: error.message || "服务器错误" });
  }
});

server.listen(port, () => {
  console.log(`炒地皮在线版已启动：http://localhost:${port}`);
});
