import test from "node:test";
import assert from "node:assert/strict";

import { __gameModeTesting } from "../server.js";
import { allocateBankerTeamScores, BANKER_SCORE_MODE_AVERAGE } from "../banker-score-mode.js";

function fixedRoom(countA, countB) {
  const players = [
    ...Array.from({ length: countA }, (_, index) => ({ id: `a${index + 1}`, squad: "a", ready: true, test: false })),
    ...Array.from({ length: countB }, (_, index) => ({ id: `b${index + 1}`, squad: "b", ready: true, test: false }))
  ];
  return { gameMode: "pvp", playMode: "team", bankerId: "a1", players };
}

test("fixed teams become banker and idle teams from the random banker squad", () => {
  const room = fixedRoom(3, 2);
  assert.deepEqual(__gameModeTesting.bankerTeamIds(room), ["a1", "a2", "a3"]);
  assert.equal(__gameModeTesting.playerRole(room, "a1"), "庄家");
  assert.equal(__gameModeTesting.playerRole(room, "a2"), "庄家队友");
  assert.equal(__gameModeTesting.playerRole(room, "b1"), "闲家");
});

test("team target is 40 percent for equal teams and 50 percent for unequal teams", () => {
  assert.equal(__gameModeTesting.gameWinThreshold(fixedRoom(2, 2)), 160);
  assert.equal(__gameModeTesting.gameWinThreshold(fixedRoom(3, 2)), 250);
});

test("team bottom settlement is plus one or minus one while brawl keeps plus two or minus one", () => {
  const teamRoom = fixedRoom(2, 2);
  const brawlRoom = { gameMode: "pvp", playMode: "brawl" };
  assert.equal(__gameModeTesting.bottomSettlementDelta(teamRoom, "idle"), 1);
  assert.equal(__gameModeTesting.bottomSettlementDelta(teamRoom, "banker"), -1);
  assert.equal(__gameModeTesting.bottomSettlementDelta(brawlRoom, "idle"), 2);
  assert.equal(__gameModeTesting.bottomSettlementDelta(brawlRoom, "banker"), -1);
});

test("fixed team scores split the opposing total evenly and remain zero-sum", () => {
  const allocation = allocateBankerTeamScores({
    idleEachScore: 3,
    idleCount: 3,
    doglegCount: 1,
    mode: BANKER_SCORE_MODE_AVERAGE
  });
  assert.equal(allocation.bankerScore, -4.5);
  assert.equal(allocation.doglegEachScore, -4.5);
  assert.equal(3 * 3 + allocation.bankerScore + allocation.doglegEachScore, 0);
});
