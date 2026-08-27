import test from "node:test";
import assert from "node:assert/strict";

import {
  applyDynamicDoglegPlay,
  applyHiddenDoglegPlay,
  applyRandomOrderDoglegPlay,
  createDynamicDoglegState,
  createHiddenDoglegState,
  createRandomOrderDoglegState,
  DOGLEG_MODE_DYNAMIC,
  DOGLEG_MODE_HIDDEN,
  DOGLEG_MODE_RANDOM_ORDER,
  DOGLEG_MODE_TRADITIONAL,
  dynamicDoglegCardId,
  dynamicDoglegMarkCount,
  hiddenDoglegCardId,
  hiddenDoglegPlayerIds,
  hiddenDoglegRevealedPlayerIds,
  normalizeDoglegMode,
  rankDynamicDoglegs,
  sameRandomOrderDoglegCard
} from "../dogleg-mechanism.js";

function card(id, type = "normal") {
  return { id, type };
}

test("动态狗腿排除庄家，且可从任意手牌中随机标记", () => {
  const state = createDynamicDoglegState([
    { id: "banker", hand: [card("banker-card")] },
    { id: "idle-a", hand: [card("normal-card"), card("joker-card", "joker")] }
  ], "banker", () => 0.999);

  assert.equal(state.players.banker, undefined);
  assert.equal(dynamicDoglegCardId(state, "idle-a"), "joker-card");
  assert.equal(normalizeDoglegMode("unknown"), DOGLEG_MODE_TRADITIONAL);
  assert.equal(normalizeDoglegMode(DOGLEG_MODE_DYNAMIC), DOGLEG_MODE_DYNAMIC);
  assert.equal(normalizeDoglegMode(DOGLEG_MODE_HIDDEN), DOGLEG_MODE_HIDDEN);
  assert.equal(normalizeDoglegMode(DOGLEG_MODE_RANDOM_ORDER), DOGLEG_MODE_RANDOM_ORDER);
});

test("顺位狗腿把同颜色同点数的两个花色作为一组，并按候选玩家数抽取顺位", () => {
  const values = [0, 0.34, 0.999];
  const state = createRandomOrderDoglegState([
    { id: "banker", hand: [{ id: "banker-c5", type: "normal", suit: "C", color: "black", rank: "5" }] },
    { id: "idle-a", hand: [{ id: "a-s5", type: "normal", suit: "S", color: "black", rank: "5" }] },
    { id: "idle-b", hand: [{ id: "b-c5", type: "normal", suit: "C", color: "black", rank: "5" }] },
    { id: "idle-c", hand: [{ id: "c-h5", type: "normal", suit: "H", color: "red", rank: "5" }] },
    { id: "idle-d", hand: [{ id: "d-s5", type: "normal", suit: "S", color: "black", rank: "5" }] }
  ], "banker", 2, () => values.shift() ?? 0);

  assert.equal(state.card.label, "♠5 / ♣5");
  assert.equal(state.candidateCount, 3);
  assert.deepEqual(state.targetPositions, [2, 3]);
  assert.equal(sameRandomOrderDoglegCard({ type: "normal", suit: "C", color: "black", rank: "5" }, state.card), true);
  assert.equal(sameRandomOrderDoglegCard({ type: "normal", suit: "H", color: "red", rank: "5" }, state.card), false);
});

test("顺位狗腿把正皇和副皇作为同一组", () => {
  const values = [0, 0.999];
  const state = createRandomOrderDoglegState([
    { id: "banker", hand: [{ id: "banker-big", type: "joker", joker: "big" }] },
    { id: "idle-a", hand: [{ id: "a-big", type: "joker", joker: "big" }] },
    { id: "idle-b", hand: [{ id: "b-small", type: "joker", joker: "small" }] },
    { id: "idle-c", hand: [{ id: "c-s5", type: "normal", suit: "S", color: "black", rank: "5" }] }
  ], "banker", 1, () => values.shift() ?? 0);

  assert.equal(state.card.type, "joker");
  assert.equal(state.card.label, "正皇 / 副皇");
  assert.equal(state.candidateCount, 2);
  assert.deepEqual(state.targetPositions, [2]);
  assert.equal(sameRandomOrderDoglegCard({ type: "joker", joker: "big" }, state.card), true);
  assert.equal(sameRandomOrderDoglegCard({ type: "joker", joker: "small" }, state.card), true);
  assert.equal(sameRandomOrderDoglegCard({ type: "normal", suit: "S", color: "black", rank: "JOKER" }, state.card), false);
});

test("顺位狗腿按有效出牌次数推进，成为狗腿后再次打出不计数", () => {
  const state = {
    card: { type: "normal", color: "black", rank: "5", suits: ["S", "C"] },
    candidateCount: 3,
    targetPositions: [2, 3],
    playSequence: 0,
    plays: [],
    playerIds: []
  };

  const first = applyRandomOrderDoglegPlay(state, {
    playerId: "idle-a",
    playedCards: [{ id: "a-s5-1", type: "normal", suit: "S", color: "black", rank: "5" }]
  });
  assert.equal(first.hit.sequence, 1);
  assert.equal(first.hit.becameDogleg, false);

  const second = applyRandomOrderDoglegPlay(state, {
    playerId: "idle-a",
    playedCards: [{ id: "a-c5-2", type: "normal", suit: "C", color: "black", rank: "5" }]
  });
  assert.equal(second.hit.sequence, 2);
  assert.equal(second.hit.becameDogleg, true);
  assert.deepEqual(second.doglegPlayerIds, ["idle-a"]);

  const ignored = applyRandomOrderDoglegPlay(state, {
    playerId: "idle-a",
    playedCards: [{ id: "a-s5-3", type: "normal", suit: "S", color: "black", rank: "5" }]
  });
  assert.equal(ignored.hit, null);
  assert.equal(state.playSequence, 2);

  const third = applyRandomOrderDoglegPlay(state, {
    playerId: "idle-b",
    playedCards: [{ id: "b-c5", type: "normal", suit: "C", color: "black", rank: "5" }]
  });
  assert.equal(third.hit.sequence, 3);
  assert.equal(third.hit.becameDogleg, true);
  assert.deepEqual(third.doglegPlayerIds, ["idle-a", "idle-b"]);
});

test("打出具体标记牌后增加一个标记，并从剩余手牌重新随机", () => {
  const state = createDynamicDoglegState([
    { id: "idle-a", hand: [card("marked"), card("next"), card("other")] }
  ], "banker", () => 0);

  const miss = applyDynamicDoglegPlay(state, {
    playerId: "idle-a",
    playedCards: [card("other")],
    remainingHand: [card("marked"), card("next")],
    needed: 1,
    random: () => 0
  });
  assert.equal(miss.hit, null);
  assert.equal(dynamicDoglegMarkCount(state, "idle-a"), 0);

  const hit = applyDynamicDoglegPlay(state, {
    playerId: "idle-a",
    playedCards: [card("marked")],
    remainingHand: [card("next"), card("other")],
    needed: 1,
    random: () => 0
  });
  assert.equal(hit.hit.cardId, "marked");
  assert.equal(hit.hit.count, 1);
  assert.equal(dynamicDoglegCardId(state, "idle-a"), "next");
  assert.deepEqual(hit.doglegPlayerIds, ["idle-a"]);
});

test("动态狗腿先比标记数，同数时最近获得标记者优先", () => {
  const state = createDynamicDoglegState([
    { id: "idle-a", hand: [card("a1"), card("a2")] },
    { id: "idle-b", hand: [card("b1"), card("b2")] },
    { id: "idle-c", hand: [card("c1")] }
  ], "banker", () => 0);

  applyDynamicDoglegPlay(state, {
    playerId: "idle-a", playedCards: [card("a1")], remainingHand: [card("a2")], needed: 2, random: () => 0
  });
  applyDynamicDoglegPlay(state, {
    playerId: "idle-b", playedCards: [card("b1")], remainingHand: [card("b2")], needed: 2, random: () => 0
  });
  assert.deepEqual(rankDynamicDoglegs(state, 1), ["idle-b"]);
  assert.deepEqual(rankDynamicDoglegs(state, 2), ["idle-b", "idle-a"]);

  applyDynamicDoglegPlay(state, {
    playerId: "idle-a", playedCards: [card("a2")], remainingHand: [], needed: 2, random: () => 0
  });
  assert.deepEqual(rankDynamicDoglegs(state, 2), ["idle-a", "idle-b"]);
  assert.equal(dynamicDoglegCardId(state, "idle-a"), null);
  assert.equal(dynamicDoglegMarkCount(state, "idle-c"), 0);
  assert.equal(rankDynamicDoglegs(state, 3).includes("idle-c"), false, "0 标记玩家不补足狗腿名额");
});

test("暗狗腿随机选择固定非庄玩家，并为每人标记一张具体手牌", () => {
  const values = [0.6, 0, 0.999, 0];
  const state = createHiddenDoglegState([
    { id: "banker", hand: [card("banker-card")] },
    { id: "idle-a", hand: [card("a1"), card("a2")] },
    { id: "idle-b", hand: [card("b1"), card("b2", "joker")] },
    { id: "idle-c", hand: [card("c1")] }
  ], "banker", 2, () => values.shift() ?? 0);

  assert.deepEqual(hiddenDoglegPlayerIds(state), ["idle-b", "idle-a"]);
  assert.equal(hiddenDoglegCardId(state, "banker"), null);
  assert.equal(hiddenDoglegCardId(state, "idle-b"), "b2");
  assert.equal(hiddenDoglegCardId(state, "idle-a"), "a1");
  assert.deepEqual(hiddenDoglegRevealedPlayerIds(state), []);
});

test("暗狗腿仅在具体标记牌真正打出后公开，且不会重新生成", () => {
  const state = createHiddenDoglegState([
    { id: "idle-a", hand: [card("marked"), card("same-rank-copy"), card("other")] }
  ], "banker", 1, () => 0);

  const miss = applyHiddenDoglegPlay(state, {
    playerId: "idle-a",
    playedCards: [card("same-rank-copy")]
  });
  assert.equal(miss.hit, null);
  assert.deepEqual(miss.doglegPlayerIds, []);

  const hit = applyHiddenDoglegPlay(state, {
    playerId: "idle-a",
    playedCards: [card("marked")]
  });
  assert.equal(hit.hit.cardId, "marked");
  assert.deepEqual(hit.doglegPlayerIds, ["idle-a"]);
  assert.equal(hiddenDoglegCardId(state, "idle-a"), "marked");

  const repeated = applyHiddenDoglegPlay(state, {
    playerId: "idle-a",
    playedCards: [card("marked")]
  });
  assert.equal(repeated.hit, null);
  assert.equal(state.reveals.length, 1);
});
