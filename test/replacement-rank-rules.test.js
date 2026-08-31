import test from "node:test";
import assert from "node:assert/strict";

import {
  applyShenBiesanCardRules,
  effectiveRankOrder,
  suitTractorOrderValue
} from "../public/replacement-rank-rules.js";

function replacementCard(suit, rank, replacementRank = "6") {
  return applyShenBiesanCardRules({ type: "normal", suit, rank }, replacementRank);
}

test("神瘪三替代点数会从所有普通牌的原花色拖拉机顺序中移除", () => {
  const blackFive = replacementCard("S", "5");
  const blackSeven = replacementCard("S", "7");
  const redFour = replacementCard("H", "4");
  const redSeven = replacementCard("H", "7");

  assert.equal(blackFive.rulesReplacementRank, "6");
  assert.equal(redFour.rulesReplacementRank, "6");
  assert.equal(suitTractorOrderValue(blackFive, "H"), suitTractorOrderValue(blackSeven, "H") + 1);
  assert.equal(suitTractorOrderValue(redFour, "S"), suitTractorOrderValue(redSeven, "S") + 1);
});

test("神瘪三生效后原 2 可与普通 3 或参谋路的 4 组成拖拉机", () => {
  const ordinaryThree = replacementCard("S", "3");
  const ordinaryTwo = replacementCard("S", "2");
  const counselorRouteFour = replacementCard("C", "4");
  const counselorRouteTwo = replacementCard("C", "2");

  assert.equal(ordinaryTwo.rulesRank, "LOW_2");
  assert.equal(suitTractorOrderValue(ordinaryTwo, "H"), suitTractorOrderValue(ordinaryThree, "H") + 1);
  assert.equal(suitTractorOrderValue(counselorRouteTwo, "S"), suitTractorOrderValue(counselorRouteFour, "S") + 1);
  assert.deepEqual(effectiveRankOrder(ordinaryTwo).slice(-2), ["3", "LOW_2"]);
});

test("替代点数仍承担 2 的比牌位置，王不写入替代规则", () => {
  const replacementSix = replacementCard("D", "6");
  const joker = applyShenBiesanCardRules({ type: "joker", joker: "big" }, "6");

  assert.equal(replacementSix.rulesRank, "2");
  assert.equal(suitTractorOrderValue(replacementSix, "S"), 99);
  assert.equal(joker.rulesReplacementRank, undefined);
});
