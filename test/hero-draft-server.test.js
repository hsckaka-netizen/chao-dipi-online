import test from "node:test";
import assert from "node:assert/strict";
import { __heroDraftTesting as game } from "../server.js";
import { HERO_UNITS } from "../hero-home.js";
import { chooseDraftHero, HERO_DRAFT_STAGE } from "../hero-draft.js";

function room() {
  return {
    id: "DRAFT", status: "lobby", stage: "lobby", gameMode: "pvp", playMode: "brawl",
    gameRecordId: "frozen-game", hostId: "p0", doglegNeeded: 2, doglegMode: "traditional",
    players: Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`, name: `玩家${i}`, accountId: `a${i}`, host: i === 0, hand: [], ready: true, connected: true,
      battleHeroSnapshot: { heroId: "old-preselected" }
    })),
    kitty: [], events: [], setup: game.emptySetup(), spectators: new Map(), trickHistory: [],
    gameItems: game.emptyGameItems(), boardHeroSkills: game.emptyBoardHeroSkills(), boardHeroEffects: game.emptyBoardHeroEffects()
  };
}
const inventory = () => Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`a${i}`,
  Object.fromEntries(HERO_UNITS.map((hero) => [hero.id, { stars: i + 1, skillCooldown: 0 }]))]));

test("server waits before dealing, restores the same private candidates, and deals with frozen selections", async () => {
  const current = room();
  const owned = inventory();
  await game.beginHeroDraft(current, async () => owned);
  assert.equal(current.stage, HERO_DRAFT_STAGE);
  assert.ok(current.players.every((player) => player.hand.length === 0 && player.battleHeroSnapshot === null));
  const first = game.roomSnapshot(current, current.players[0]);
  const refreshed = game.roomSnapshot(current, current.players[0]);
  assert.deepEqual(first.heroDraft, refreshed.heroDraft);
  assert.equal(first.heroDraft.choices.length, 2);
  assert.deepEqual(game.roomSnapshot(current, current.players[0], { hideViewerSecrets: true }).heroDraft.choices, []);
  for (const [index, player] of current.players.entries()) {
    const choice = game.roomSnapshot(current, player).heroDraft.choices.find((hero) => hero.canSelect);
    player.battleHeroSnapshot = chooseDraftHero(current.heroDraft, player.id, choice.heroId).snapshot;
    assert.equal(player.battleHeroSnapshot.stars, index + 1);
    owned[player.accountId][choice.heroId].stars = 1;
  }
  assert.equal(game.finishHeroDraftIfComplete(current), true);
  assert.equal(current.heroDraft, null);
  assert.equal(current.gameRecordId, "frozen-game");
  assert.ok(current.players.every((player, i) => player.hand.length === 53 && player.battleHeroSnapshot.stars === i + 1));
  const previous = current.players.map((player) => player.battleHeroSnapshot);
  game.deal(current, { preserveRestartUsage: true });
  assert.deepEqual(current.players.map((player) => player.battleHeroSnapshot), previous, "重开卡保留已锁定英雄");
  game.resetRoomToLobby(current);
  assert.equal(current.heroDraft, null);
  assert.ok(current.players.every((player) => player.battleHeroSnapshot === null));
});

test("timeout never picks a hero for a human, including an entirely unowned candidate list", async () => {
  const current = room();
  await game.beginHeroDraft(current, async () => ({}));
  assert.equal(current.stage, HERO_DRAFT_STAGE);
  assert.ok(game.roomSnapshot(current, current.players[0]).heroDraft.choices.every((hero) => !hero.canSelect && !hero.owned));
  const selectedId = current.heroDraft.entries.p0.choices[0];
  assert.equal(chooseDraftHero(current.heroDraft, "p0", selectedId).status, 403);
  current.heroDraft.deadlineAt = new Date(Date.now() - 1000).toISOString();
  assert.equal(game.expireHeroDraft(current), true);
  assert.ok(current.players.every((player) => player.hand.length === 53 && player.battleHeroSnapshot === null));
});

test("inventory failures clear old preselection and continue the game without heroes", async () => {
  const current = room();
  current.players.forEach((player) => { player.advancementSrIds = ["jiang-zha"]; });
  await game.beginHeroDraft(current, async () => { throw new Error("test inventory unavailable"); });
  assert.notEqual(current.stage, HERO_DRAFT_STAGE);
  assert.ok(current.players.every((player) => player.hand.length === 53 && player.battleHeroSnapshot === null));
  assert.ok(current.players.every((player) => player.advancementSrIds.length === 0));
});

test("draft freezes all owned five-star advancement heroes even when skipping battle selection", async () => {
  const current = room();
  const owned = { a0: { "jiang-zha": { stars: 5 }, "deng-huang": { stars: 5 } }, a1: { "jiang-zha": { stars: 4 } } };
  await game.beginHeroDraft(current, async () => owned);
  assert.deepEqual(current.players[0].advancementSrIds, ["jiang-zha", "deng-huang"]);
  assert.deepEqual(current.players[1].advancementSrIds, []);
  owned.a0["jiang-zha"].stars = 1;
  for (const player of current.players) chooseDraftHero(current.heroDraft, player.id, null);
  game.finishHeroDraftIfComplete(current);
  assert.equal(current.players[0].battleHeroSnapshot, null);
  assert.deepEqual(current.players[0].advancementSrIds, ["jiang-zha", "deng-huang"]);
  game.deal(current, { preserveRestartUsage: true });
  assert.deepEqual(current.players[0].advancementSrIds, ["jiang-zha", "deng-huang"]);
  game.resetRoomToLobby(current);
  assert.ok(current.players.every((player) => player.advancementSrIds.length === 0));
  await game.beginHeroDraft(current, async () => owned);
  assert.deepEqual(current.players[0].advancementSrIds, ["deng-huang"], "next game reloads ownership");
  game.resetRoomToLobby(current);
});
