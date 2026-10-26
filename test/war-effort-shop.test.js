import test from "node:test";
import assert from "node:assert/strict";
import { HERO_UNITS } from "../hero-home.js";
import { WAR_EFFORT_RULES, WAR_EFFORT_SHOP, validateWarEffortExchange, warEffortBalance } from "../server-war-effort.js";

const heroId = HERO_UNITS.find((hero) => hero.rarity === "ssr").id;
function exchange(overrides = {}) {
  return validateWarEffortExchange({ campaign: { completed_at: "2026-10-26" },
    player: { contribution: 6000, spent_contribution: 0, ssr_exchange_count: 0 },
    productId: "ssr-choice", quantity: 1, heroId, heroes: HERO_UNITS, frameOwned: false, ...overrides });
}

test("all players including zero donors receive the same once-only claim value", () => {
  assert.equal(WAR_EFFORT_RULES.completionContribution, 1500);
  assert.equal(warEffortBalance({ contribution: 0, reward_contribution: 1500 }), 1500);
  assert.equal(warEffortBalance({ contribution: 100, reward_contribution: 1500, spent_contribution: 1500 }), 100);
  assert.equal(warEffortBalance({ contribution: 200, spent_contribution: 50 }), 150);
});

test("confirmed prices and unrestricted consumable quantities", () => {
  assert.deepEqual(WAR_EFFORT_SHOP.map(({ id, price, limit }) => [id, price, limit]), [
    ["ssr-choice", 1000, 6], ["restart-card", 100, null], ["war-god-card", 70, null],
    ["colorful-card", 50, null], ["blackstone-vanguard", 500, 1]
  ]);
  assert.equal(exchange({ productId: "war-god-card", quantity: 80 }).cost, 5600);
});

test("exchanges require completed campaign, valid choices, funds and integer quantity", () => {
  assert.throws(() => exchange({ campaign: { completed_at: null } }), /全部完成/);
  assert.throws(() => exchange({ productId: "__proto__" }), /不存在/);
  assert.throws(() => exchange({ heroId: "jiang-zha" }), /SSR/);
  assert.throws(() => exchange({ heroId: "future-locked-ssr" }), /SSR/);
  assert.throws(() => exchange({ heroId: "future-locked-ssr", heroes: [...HERO_UNITS, { id: "future-locked-ssr", rarity: "ssr" }] }), /SSR/);
  for (const quantity of [0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => exchange({ quantity }), /数量/);
  }
  assert.throws(() => exchange({ player: { contribution: 999 } }), /不足/);
  assert.equal(exchange({ player: { contribution: 0, reward_contribution: 1500 } }).cost, 1000);
});

test("SSR limit counts total cards across heroes and frame ownership prevents repurchase", () => {
  assert.equal(exchange({ quantity: 6 }).cost, 6000);
  assert.throws(() => exchange({ quantity: 7 }), /最多兑换 6/);
  assert.throws(() => exchange({ quantity: 2, player: { contribution: 10000, ssr_exchange_count: 5 } }), /最多兑换 6/);
  assert.throws(() => exchange({ productId: "blackstone-vanguard", frameOwned: true }), /已经拥有/);
  assert.throws(() => exchange({ productId: "blackstone-vanguard", quantity: 2 }), /只能兑换一次/);
});
