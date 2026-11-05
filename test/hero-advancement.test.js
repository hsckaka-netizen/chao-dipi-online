import test from "node:test";
import assert from "node:assert/strict";
import { HERO_ADVANCEMENTS, advancementGameDelta, advancementProgress, eligibleAdvancementSrIds } from "../hero-advancement.js";
import { calculateHeroSkillReward, createBattleHeroSnapshot, drawHomeUnit, drawHeroGachaResult } from "../hero-home.js";
import { __heroAdvancementTesting as game } from "../server.js";
import { __heroAdvancementStorageTesting as storage } from "../game-history.js";

const card = (id, suit = "C", rank = "K") => ({ id, type: "normal", suit, rank, label: `${suit}${rank}`, color: suit === "D" || suit === "H" ? "red" : "black" });
function room(heroId = "jie-denghuang", stars = 5) {
  const players = ["banker", "hero", "other", "p4", "p5"].map((id) => ({ id, name: id, accountId: id, test: false, hand: [card(`${id}-a`), card(`${id}-b`, "S", "9")], score: 0 }));
  players[1].battleHeroSnapshot = createBattleHeroSnapshot(heroId, stars);
  return { id: "ADV", gameRecordId: "game", status: "dealt", gameMode: "pvp", playMode: "brawl", players, bankerId: "banker", trumpSuit: "H", doglegMode: "traditional", doglegNeeded: 2, doglegPlayerIds: [], doglegCard: card("public", "D", "9"), kitty: [card("k1"), card("k2", "D", "A"), card("k3", "S", "7")], kittySize: 3, setup: game.emptySetup(), boardHeroSkills: game.emptyBoardHeroSkills(), heroRoundState: {}, ranchenRoleLocks: {}, events: [], trickHistory: [], spectators: new Map() };
}

test("SSR rewards inherit SR amounts by frozen stars; score conditions use original results", () => {
  for (let stars = 1; stars <= 5; stars++) {
    const reward = (id, role = "狗腿", score = 2, history = [{ winnerId: "p" }]) => calculateHeroSkillReward({ snapshot: createBattleHeroSnapshot(id, stars), playerId: "p", playerResult: { role, baseGameScore: score, gameScore: 10 }, trickHistory: history });
    assert.equal(reward("jie-jiangzha").amount, [150,185,220,255,290][stars-1]);
    assert.equal(reward("jie-jiangzha").scoreBonus, [1,1.2,1.5,2,3][stars-1]);
    assert.equal(reward("jie-jiangzha", "狗腿", 2, []).scoreBonus, 0);
    assert.equal(reward("jie-jiangzha", "狗腿", 2, []).amount, [150,185,220,255,290][stars-1]);
    for (const [role, score] of [["闲家",2], ["庄家",2], ["狗腿",0], ["狗腿",-2]]) {
      assert.equal(reward("jie-jiangzha", role, score).scoreBonus, 0);
      assert.equal(reward("jie-jiangzha", role, score).amount, 0);
    }
    assert.equal(reward("jie-denghuang", "闲家", -2).amount, [120,150,180,210,240][stars-1]);
    assert.equal(reward("jie-denghuang", "闲家", -2).scoreBonus, [1,1.2,1.5,2,3][stars-1]);
    assert.equal(reward("jie-denghuang", "闲家", 2, [{ winnerId: "p" }, { winnerId: "q" }]).amount, 0);
    assert.equal(createBattleHeroSnapshot("jie-denghuang", stars).paidSkill, undefined);
  }
});

test("account SSR pool excludes advanced heroes until individually unlocked, including guaranteed SSR", () => {
  for (let index = 0; index < 100; index++) {
    const randomFloat = () => index / 100;
    assert.ok(!drawHomeUnit({ forceRarity: "ssr", randomFloat }).advancementFrom);
    assert.notEqual(drawHomeUnit({ forceRarity: "ssr", unlockedSsrIds: ["jie-jiangzha"], randomFloat }).id, "jie-denghuang");
  }
  assert.equal(drawHeroGachaResult({ forceRarity: "ssr", unlockedSsrIds: ["jie-jiangzha"], randomFloat: () => 0 }).unit.id, "jie-jiangzha");
  const rolls = [0, 0];
  assert.equal(drawHeroGachaResult({ unlockedSsrIds: ["jie-denghuang"], randomFloat: () => rolls.shift() }).unit.id, "jie-denghuang");
});

test("progress uses owned five-star SR eligibility independently of the battle hero", () => {
  const inventory = { "jiang-zha": { stars: 5 }, "deng-huang": { stars: 5 }, "jie-doudou": { stars: 5 } };
  const player = { roomPlayerId: "p", role: "狗腿", baseGameScore: 2, advancementSrIds: eligibleAdvancementSrIds(inventory) };
  assert.deepEqual(player.advancementSrIds, ["jiang-zha", "deng-huang"]);
  const expected = { "jiang-zha": { doglegWins: 1 }, "deng-huang": { bottomWins: 1 } };
  for (const hero of [null, createBattleHeroSnapshot("jie-doudou", 2), createBattleHeroSnapshot("jiang-zha", 1)]) {
    player.battleHeroSnapshot = hero;
    assert.deepEqual(advancementGameDelta(player, { bottomWinnerRoomPlayerId: "p" }), expected);
  }
  inventory["jiang-zha"].stars = 1;
  assert.deepEqual(advancementGameDelta(player, { bottomWinnerRoomPlayerId: "p" }), expected, "mid-game reset cannot change frozen eligibility");
  assert.deepEqual(eligibleAdvancementSrIds(inventory), ["deng-huang"]);
  assert.deepEqual(eligibleAdvancementSrIds({ "jiang-zha": { stars: 4 } }), []);
  assert.deepEqual(eligibleAdvancementSrIds(), []);
  assert.deepEqual(advancementGameDelta({ ...player, advancementSrIds: [] }), {});
  assert.deepEqual(advancementGameDelta({ ...player, advancementSrIds: undefined }), {}, "equipping a hero alone cannot grant progress");
  assert.deepEqual(advancementGameDelta(player, { bottomWinnerRoomPlayerId: "other" }), { "jiang-zha": { doglegWins: 1 }, "deng-huang": { bottomWins: 0 } });
  for (const [role, score] of [["狗腿", 0], ["狗腿", -2], ["庄家", 2], ["闲家", 2]]) {
    assert.equal(advancementGameDelta({ ...player, role, baseGameScore: score, gameScore: 10 })["jiang-zha"].doglegWins, 0);
  }
  for (const [definition, key] of [[HERO_ADVANCEMENTS[0], "doglegWins"], [HERO_ADVANCEMENTS[1], "bottomWins"]]) {
    assert.equal(definition.tasks.length, 1);
    assert.equal(advancementProgress(definition, { [key]: 9 }).complete, false);
    assert.equal(advancementProgress(definition, { [key]: 10 }).complete, true);
    const legacy = advancementProgress(definition, { [key]: 12, activeDoglegWins: 0, precisionBottomWins: 0 });
    assert.equal(legacy.complete, true);
    assert.equal(legacy.tasks[0].progress, 10);
  }
});

function advancementStore() {
  const receipts = new Set();
  const progress = new Map();
  return {
    progress,
    async query(sql, args = []) {
      const key = `${args[0]}:${args[1]}`;
      if (sql.includes("INSERT INTO cdp_hero_advancement_games")) {
        const receipt = `${key}:${args[2]}`;
        if (receipts.has(receipt)) return { rows: [] };
        receipts.add(receipt);
        return { rows: [{ game_id: args[2] }] };
      }
      if (sql.includes("INSERT INTO cdp_hero_advancements")) {
        if (!progress.has(key)) progress.set(key, { progress: {}, claimed_at: null });
      } else if (sql.includes("SELECT progress, claimed_at")) {
        return { rows: [progress.get(key)] };
      } else if (sql.includes("UPDATE cdp_hero_advancements SET progress")) {
        progress.get(key).progress = JSON.parse(args[2]);
      } else if (!sql.includes("cdp_hero_profiles") && !sql.includes("cdp_home_regions")) {
        assert.fail(`Unexpected storage query: ${sql}`);
      }
      return { rows: [] };
    }
  };
}

test("settlement advances both unequipped heroes once per game and preserves claimed progress", async () => {
  const client = advancementStore();
  const player = { accountId: "a", roomPlayerId: "p", role: "狗腿", baseGameScore: 2, battleHeroSnapshot: null, advancementSrIds: ["jiang-zha", "deng-huang"] };
  const record = { gameId: "game1", advancementEligible: true, gameMode: "pvp", bottomWinnerRoomPlayerId: "p", players: [player] };
  await storage.settleHeroAdvancement(client, record);
  assert.deepEqual(client.progress.get("a:jiang-zha").progress, { doglegWins: 1 });
  assert.deepEqual(client.progress.get("a:deng-huang").progress, { bottomWins: 1 });
  await storage.settleHeroAdvancement(client, record);
  assert.equal(client.progress.get("a:jiang-zha").progress.doglegWins, 1);
  assert.equal(client.progress.get("a:deng-huang").progress.bottomWins, 1);
  client.progress.get("a:jiang-zha").claimed_at = "claimed";
  client.progress.get("a:deng-huang").progress.bottomWins = 9;
  await storage.settleHeroAdvancement(client, { ...record, gameId: "game2" });
  await storage.settleHeroAdvancement(client, { ...record, gameId: "game3" });
  assert.equal(client.progress.get("a:jiang-zha").progress.doglegWins, 1);
  assert.equal(client.progress.get("a:deng-huang").progress.bottomWins, 10);
});

test("ineligible games and players cannot write advancement progress", async () => {
  const player = { accountId: "a", roomPlayerId: "p", role: "狗腿", baseGameScore: 2, advancementSrIds: ["jiang-zha", "deng-huang"] };
  const record = { gameId: "game", advancementEligible: true, gameMode: "pvp", bottomWinnerRoomPlayerId: "p", players: [player] };
  const noWrites = { async query() { assert.fail("ineligible progress must not access storage"); } };
  for (const override of [{ advancementEligible: false }, { gameMode: "pve" }]) {
    await storage.settleHeroAdvancement(noWrites, { ...record, ...override });
  }
  for (const override of [{ accountId: null }, { isAi: true }, { diamondReward: { reason: "spectator" } }, { advancementSrIds: [] }]) {
    await storage.settleHeroAdvancement(noWrites, { ...record, players: [{ ...player, ...override }] });
  }
});

test("Denghuang exchanges exact physical cards once, validates count and ownership, preserving the deck", () => {
  const r = room(); const hero = r.players[1];
  const originalIds = [...r.kitty, ...r.players.flatMap(p => p.hand)].map(c => c.id).sort();
  assert.equal(game.beginAdvancedHeroStage(r, "denghuang"), true);
  assert.equal(game.submitAdvancedHeroChoice(r, r.players[2], "jie-denghuang-draw").status, 403);
  assert.equal(game.submitAdvancedHeroChoice(r, hero, "jie-denghuang-draw").ok, true);
  assert.equal(hero.hand.length, 4); assert.equal(r.kitty.length, 1);
  assert.equal(game.submitAdvancedHeroChoice(r, hero, "jie-denghuang-draw").status, 409);
  assert.equal(game.submitAdvancedHeroChoice(r, hero, "jie-denghuang-pass").status, 409);
  assert.equal(game.submitAdvancedHeroChoice(r, hero, "jie-denghuang-bury", ["missing", "hero-a"]).status, 400);
  assert.equal(game.submitAdvancedHeroChoice(r, hero, "jie-denghuang-bury", ["hero-a"]).status, 400);
  assert.equal(game.submitAdvancedHeroChoice(r, hero, "jie-denghuang-bury", ["hero-a", "hero-a"]).status, 400);
  assert.equal(game.submitAdvancedHeroChoice(r, hero, "jie-denghuang-bury", ["hero-a", "hero-b"]).ok, true);
  assert.equal(r.stage, "dogleg"); assert.equal(hero.hand.length, 2); assert.equal(r.kitty.length, 3);
  assert.deepEqual([...r.kitty, ...r.players.flatMap(p => p.hand)].map(c => c.id).sort(), originalIds);
  assert.equal(game.submitAdvancedHeroChoice(r, hero, "jie-denghuang-draw").status, 409);
});

test("Denghuang has no deadline before or after drawing and waits for each player's manual return", async () => {
  const r = room(); const hero = r.players[1]; const second = r.players[2];
  second.battleHeroSnapshot = createBattleHeroSnapshot("jie-denghuang", 1);
  game.beginAdvancedHeroStage(r, "denghuang");
  assert.equal(r.boardHeroSkills.advanced.deadlineAt, null);
  assert.equal(await game.autoAdvanceExpiredBoardHeroSkill(r), false);
  game.submitAdvancedHeroChoice(r, hero, "jie-denghuang-draw");
  const drawn = [...r.boardHeroSkills.advanced.drawnCardIds];
  assert.equal(r.boardHeroSkills.advanced.deadlineAt, null);
  assert.deepEqual(game.boardHeroSkillsSnapshot(r, hero).advanced.drawnCardIds, drawn);
  assert.deepEqual(game.boardHeroSkillsSnapshot(r, second).advanced.drawnCardIds, []);
  r.boardHeroSkills.advanced.deadlineAt = new Date(0).toISOString();
  assert.equal(await game.autoAdvanceExpiredBoardHeroSkill(r), false);
  assert.equal(r.boardHeroSkills.advanced.currentPlayerId, hero.id);
  assert.equal(hero.hand.length, 4);
  assert.equal(game.submitAdvancedHeroChoice(r, hero, "jie-denghuang-bury", drawn).ok, true);
  assert.equal(r.boardHeroSkills.advanced.currentPlayerId, second.id);
  assert.equal(r.boardHeroSkills.advanced.deadlineAt, null);
  assert.equal(game.submitAdvancedHeroChoice(r, second, "jie-denghuang-pass").ok, true);
  assert.equal(r.stage, "dogleg");
  assert.equal(hero.hand.length, 2);
  assert.equal(r.boardHeroEffects.uses.length, 1);
});

test("Jiangzha privately replaces only his criterion; the public card cannot trigger him afterward", () => {
  const r = room("jie-jiangzha"); const hero = r.players[1]; const other = r.players[2];
  const publicCard = r.doglegCard;
  assert.equal(game.beginAdvancedHeroStage(r, "jiangzha"), true);
  assert.equal(game.submitAdvancedHeroChoice(r, hero, "jie-jiangzha-select", ["hero-a"]).ok, true);
  assert.equal(r.stage, "playing"); assert.equal(r.doglegCard, publicCard);
  assert.equal(game.setupSnapshot(r, hero).personalDoglegCard.id, "hero-a");
  assert.equal(game.setupSnapshot(r, other).personalDoglegCard, null);
  assert.equal(game.setupSnapshot(r, null).personalDoglegCard, null);
  game.revealDoglegIfNeeded(r, hero, [publicCard]); assert.deepEqual(r.doglegPlayerIds, []);
  game.revealDoglegIfNeeded(r, other, [hero.hand[0]]); assert.deepEqual(r.doglegPlayerIds, []);
  game.revealDoglegIfNeeded(r, hero, [hero.hand[0]]); assert.deepEqual(r.doglegPlayerIds, [hero.id]);
  game.revealDoglegIfNeeded(r, other, [publicCard]); assert.deepEqual(r.doglegPlayerIds, [hero.id, other.id]);
});

test("Jiangzha cannot choose compare cards or bypass traditional-mode, banker, or locked-role limits", () => {
  for (const mode of ["dynamic", "hidden", "random-order"]) { const r = room("jie-jiangzha"); r.doglegMode = mode; assert.equal(game.beginAdvancedHeroStage(r, "jiangzha"), false); }
  const r = room("jie-jiangzha"); const hero = r.players[1];
  hero.hand.push(card("red-five", "H", "5")); game.beginAdvancedHeroStage(r, "jiangzha");
  assert.equal(game.submitAdvancedHeroChoice(r, hero, "jie-jiangzha-select", ["red-five"]).status, 400);
  assert.equal(game.submitAdvancedHeroChoice(r, hero, "jie-jiangzha-pass").ok, true);
  assert.equal(game.personalDoglegCard(r, hero), r.doglegCard);
  r.ranchenRoleLocks[hero.id] = "idle"; assert.equal(game.beginAdvancedHeroStage(r, "jiangzha"), false);
  delete r.ranchenRoleLocks[hero.id]; r.bankerId = hero.id; assert.equal(game.beginAdvancedHeroStage(r, "jiangzha"), false);
});


test("final settlement adds advanced personal score once while preserving original outcome, identity, titles and diamonds", () => {
  for (const [ssrId, srId] of [["jie-jiangzha", "jiang-zha"], ["jie-denghuang", "deng-huang"]]) {
    const settle = (id) => {
      const r = room(id);
      r.gameItems = { uses: [] };
      r.boardHeroEffects = { uses: [] };
      r.doglegPlayerIds = ["hero"];
      const lastTrick = { number: 1, winnerId: "hero", leaderId: "hero", points: 0, plays: r.players.map(p => ({ playerId: p.id, cards: [p.hand[0]] })) };
      r.trickHistory = [lastTrick];
      game.finishGame(r, lastTrick);
      return r;
    };
    const before = settle(srId); const after = settle(ssrId);
    const sr = before.result.playerResults.find(p => p.playerId === "hero");
    const ssr = after.result.playerResults.find(p => p.playerId === "hero");
    assert.equal(ssr.gameScore, sr.gameScore + 3);
    assert.equal(ssr.baseGameScore, sr.baseGameScore);
    assert.equal(ssr.role, sr.role);
    assert.deepEqual(ssr.evaluationTags, sr.evaluationTags);
    assert.equal(after.result.winnerTeam, before.result.winnerTeam);
    assert.equal(ssr.diamondReward.totalAmount, sr.diamondReward.totalAmount);
    assert.equal(after.result.heroScoreAdjustments.length, 1);
    const firstResult = after.result;
    game.finishGame(after, after.trickHistory[0]);
    assert.equal(after.result, firstResult);
    assert.equal(ssr.gameScore, sr.gameScore + 3);
  }
});

test("no bot, guest or duplicate-account setup can activate advanced preparation skills", () => {
  for (const corrupt of [r => { r.players[2].test = true; }, r => { r.players[2].accountId = null; }, r => { r.players[2].accountId = r.players[1].accountId; }]) {
    const r = room(); corrupt(r);
    assert.equal(game.beginAdvancedHeroStage(r, "denghuang"), false);
  }
});


test("Gelu advancement counts earned trick points with frozen eligibility and a 5000-point target", async () => {
  const definition = HERO_ADVANCEMENTS.find((item) => item.srId === "gelu");
  assert.equal(definition.ssrId, "shen-gelu");
  assert.equal(advancementProgress(definition, { wonTrickPoints: 4999 }).complete, false);
  assert.equal(advancementProgress(definition, { wonTrickPoints: 5000 }).complete, true);
  assert.deepEqual(eligibleAdvancementSrIds({ gelu: { stars: 5 } }), ["gelu"]);
  const player = { accountId: "a", roomPlayerId: "p", wonTrickPoints: 125, trickScore: 999, advancementSrIds: ["gelu"] };
  assert.deepEqual(advancementGameDelta(player), { gelu: { wonTrickPoints: 125 } });
  assert.deepEqual(advancementGameDelta({ ...player, advancementSrIds: [] }), {});
  const client = advancementStore();
  const record = { gameId: "gelu-game", advancementEligible: true, gameMode: "pvp", players: [player] };
  await storage.settleHeroAdvancement(client, record);
  await storage.settleHeroAdvancement(client, record);
  assert.equal(client.progress.get("a:gelu").progress.wonTrickPoints, 125);
  client.progress.get("a:gelu").progress.wonTrickPoints = 4990;
  await storage.settleHeroAdvancement(client, { ...record, gameId: "next" });
  assert.equal(client.progress.get("a:gelu").progress.wonTrickPoints, 5000);
});

test("Gelu SSR stays outside the account gacha subpool until its advancement is claimed", () => {
  let included = false;
  for (let i = 0; i < 200; i++) {
    assert.notEqual(drawHomeUnit({ forceRarity: "ssr", randomFloat: () => i / 200 }).id, "shen-gelu");
    if (drawHomeUnit({ forceRarity: "ssr", unlockedSsrIds: ["shen-gelu"], randomFloat: () => i / 200 }).id === "shen-gelu") included = true;
  }
  assert.equal(included, true);
});

test('Gelu claims its separate SSR and forty fragments exactly once, preserving the SR', async () => {
  const definition = HERO_ADVANCEMENTS.find((item) => item.srId === 'gelu');
  const row = { progress: { wonTrickPoints: 5000 }, claimed_at: null };
  let mints = 0;
  const client = { async query(sql, args = []) {
    if (sql.includes('SELECT stars FROM cdp_hero_units')) return { rows: [{ stars: args[1] === 'gelu' ? 5 : 1 }] };
    if (sql.includes('SELECT progress, claimed_at')) return { rows: [row] };
    if (sql.includes('INSERT INTO cdp_hero_units')) { assert.equal(args[1], 'shen-gelu'); assert.match(sql, /VALUES \(\$1::uuid, \$2, 40\)/); mints++; }
    else if (sql.includes('UPDATE cdp_hero_advancements SET claimed_at')) row.claimed_at = 'claimed';
    else assert.match(sql, /cdp_hero_profiles|cdp_home_regions/);
    return { rows: [] };
  } };
  await storage.claimHeroAdvancementFromClient(client, 'a', definition);
  await storage.claimHeroAdvancementFromClient(client, 'a', definition);
  assert.equal(mints, 1);
  assert.equal(row.claimed_at, 'claimed');
});

test("PVE applies 20 percent to each original task and maps Jiangzha to a winning banker teammate", () => {
  const player = {
    roomPlayerId: 'p', role: '庄家队友', baseGameScore: 2,
    advancementSrIds: ['jiang-zha', 'deng-huang', 'xiaoxu', 'gelu'],
    scoringSourcePlayerIds: ['p', 'human', 'robot1', 'robot1', 'robot2'], wonTrickPoints: 125
  };
  const record = { gameMode: 'pve', bottomWinnerRoomPlayerId: 'p' };
  assert.deepEqual(advancementGameDelta(player, record), {
    'jiang-zha': { doglegWins: 0.2 }, 'deng-huang': { bottomWins: 0.2 },
    xiaoxu: { scoringSources: 0.6 }, gelu: { wonTrickPoints: 25 }
  });
  for (const role of ['庄家', '闲家', '狗腿']) assert.equal(advancementGameDelta({ ...player, role }, record)['jiang-zha'].doglegWins, 0);
  for (const baseGameScore of [0, -2]) {
    const delta = advancementGameDelta({ ...player, baseGameScore }, record);
    assert.equal(delta['jiang-zha'].doglegWins, 0);
    assert.equal(delta['deng-huang'].bottomWins, 0.2, 'a loss does not cancel a completed bottom win');
    assert.equal(delta.gelu.wonTrickPoints, 25);
  }
  const pvp = advancementGameDelta({ ...player, role: '狗腿' }, { ...record, gameMode: 'pvp' });
  assert.equal(pvp['jiang-zha'].doglegWins, 1);
  assert.equal(pvp.xiaoxu.scoringSources, 3);
  assert.equal(pvp.gelu.wonTrickPoints, 125);
});

test("PVE fractions survive persistence, mix with PVP and reach exactly ten without float drift", async () => {
  const client = advancementStore();
  const player = { accountId: 'a', roomPlayerId: 'p', role: '庄家队友', baseGameScore: 2, pveEnergyEligible: true, advancementSrIds: ['jiang-zha', 'deng-huang'] };
  const record = { advancementEligible: true, gameMode: 'pve', bottomWinnerRoomPlayerId: 'p', players: [player] };
  for (let index = 0; index < 5; index++) await storage.settleHeroAdvancement(client, { ...record, gameId: `pve-${index}` });
  assert.equal(client.progress.get('a:jiang-zha').progress.doglegWins, 1);
  assert.equal(client.progress.get('a:deng-huang').progress.bottomWins, 1);
  await storage.settleHeroAdvancement(client, { ...record, gameId: 'pve-0' });
  assert.equal(client.progress.get('a:deng-huang').progress.bottomWins, 1, 'replayed games do not grant fractions twice');
  await storage.settleHeroAdvancement(client, { ...record, gameId: 'pvp', gameMode: 'pvp', players: [{ ...player, role: '狗腿' }] });
  assert.equal(client.progress.get('a:deng-huang').progress.bottomWins, 2);
  for (let index = 5; index < 45; index++) await storage.settleHeroAdvancement(client, { ...record, gameId: `pve-${index}` });
  assert.equal(client.progress.get('a:jiang-zha').progress.doglegWins, 10);
  assert.equal(client.progress.get('a:deng-huang').progress.bottomWins, 10);
  assert.equal(advancementProgress(HERO_ADVANCEMENTS[1], { bottomWins: 9.8 }).complete, false);
  assert.equal(advancementProgress(HERO_ADVANCEMENTS[1], client.progress.get('a:deng-huang').progress).complete, true);
  await storage.settleHeroAdvancement(client, { ...record, gameId: 'extra' });
  assert.equal(client.progress.get('a:deng-huang').progress.bottomWins, 10);
});

test("PVE source and score progress persist fractions and claimed advancements remain unchanged", async () => {
  const client = advancementStore();
  const record = { gameId: 'sources', gameMode: 'pve', advancementEligible: true, players: [{
    accountId: 'a', roomPlayerId: 'p', pveEnergyEligible: true, advancementSrIds: ['xiaoxu', 'gelu'],
    scoringSourcePlayerIds: ['robot1', 'robot2', 'robot1'], wonTrickPoints: 5
  }] };
  await storage.settleHeroAdvancement(client, record);
  assert.equal(client.progress.get('a:xiaoxu').progress.scoringSources, 0.4);
  assert.equal(client.progress.get('a:gelu').progress.wonTrickPoints, 1);
  client.progress.get('a:xiaoxu').claimed_at = 'claimed';
  client.progress.get('a:gelu').progress.wonTrickPoints = 4999;
  await storage.settleHeroAdvancement(client, { ...record, gameId: 'next' });
  assert.equal(client.progress.get('a:xiaoxu').progress.scoringSources, 0.4);
  assert.equal(client.progress.get('a:gelu').progress.wonTrickPoints, 5000);
});

test("PVE advancement rejects insufficient energy, missing eligibility, robots, spectators and invalid games", async () => {
  const noWrites = { async query() { assert.fail('ineligible PVE must not access progress storage'); } };
  const player = { accountId: 'a', roomPlayerId: 'p', isAi: false, pveEnergyEligible: true, role: '庄家队友', baseGameScore: 2, advancementSrIds: ['jiang-zha'] };
  const record = { gameId: 'pve', gameMode: 'pve', advancementEligible: true, players: [player] };
  await storage.settleHeroAdvancement(noWrites, { ...record, advancementEligible: false });
  for (const override of [{ pveEnergyEligible: false }, { pveEnergyEligible: undefined }, { isAi: true }, { accountId: null }, { diamondReward: { reason: 'spectator' } }, { advancementSrIds: [] }]) {
    await storage.settleHeroAdvancement(noWrites, { ...record, players: [{ ...player, ...override }] });
  }
});
