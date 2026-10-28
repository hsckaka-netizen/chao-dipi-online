import test from "node:test";
import assert from "node:assert/strict";
import { HERO_UNITS } from "../hero-home.js";
import { createHeroDraft, chooseDraftHero, heroDraftComplete, heroDraftSnapshot } from "../hero-draft.js";

const players = (count) => Array.from({ length: count }, (_, index) => ({ id: `p${index}`, accountId: `a${index}` }));
const zero = () => 0;
const allOwned = (count, heroes = HERO_UNITS) => Object.fromEntries(players(count).map((player) => [player.accountId,
  Object.fromEntries(heroes.map((hero) => [hero.id, { stars: 3, skillCooldown: 0 }]))]));

test("draft offers 1-2 SSR plus one SR, using disjoint offers whenever each pool is large enough", () => {
  for (let count = 2; count <= 9; count += 1) {
    const draft = createHeroDraft(players(count), allOwned(count));
    const ssrs = HERO_UNITS.filter((hero) => hero.rarity === "ssr").length;
    const srs = HERO_UNITS.filter((hero) => hero.rarity === "sr").length;
    const ssrPerPlayer = Math.max(1, Math.min(2, Math.floor(ssrs / count)));
    for (const entry of Object.values(draft.entries)) {
      assert.equal(entry.choices.filter((id) => entry.snapshots[id].rarity === "ssr").length, ssrPerPlayer);
      assert.equal(entry.choices.filter((id) => entry.snapshots[id].rarity === "sr").length, 1);
      assert.equal(new Set(entry.choices).size, entry.choices.length);
      assert.equal(entry.completed, false);
      assert.equal(entry.selectedHeroId, null);
    }
    for (const [rarity, size, each] of [["ssr", ssrs, ssrPerPlayer], ["sr", srs, 1]]) {
      const ids = Object.values(draft.entries).flatMap((entry) => entry.choices.filter((id) => entry.snapshots[id].rarity === rarity));
      if (size >= count * each) assert.equal(new Set(ids).size, ids.length);
    }
  }
});

test("scarce pools permit repeats only when every owned candidate has already been selected", () => {
  for (let run = 0; run < 100; run += 1) {
    const list = players(9);
    const draft = createHeroDraft(list, allOwned(list.length));
    const selected = new Set();
    for (const player of list) {
      const choices = heroDraftSnapshot(draft, player.id).choices;
      const unique = choices.filter((hero) => !selected.has(hero.heroId));
      const hero = unique[0] || choices[0];
      const duplicate = choices.find((item) => selected.has(item.heroId));
      if (duplicate && unique.length) assert.equal(chooseDraftHero(draft, player.id, duplicate.heroId).status, 409);
      assert.equal(chooseDraftHero(draft, player.id, hero.heroId).snapshot.heroId, hero.heroId);
      if (selected.has(hero.heroId)) assert.equal(unique.length, 0);
      selected.add(hero.heroId);
    }
    assert.equal(heroDraftComplete(draft), true);
  }
});

test("owned stars and cooldowns freeze for this deal without requiring home placement", () => {
  const owned = { a0: { "shen-biesan": { stars: 4, skillCooldown: 3 } } };
  const draft = createHeroDraft(players(2), owned, { random: zero });
  const frozen = draft.entries.p0.snapshots["shen-biesan"];
  owned.a0["shen-biesan"].stars = 1;
  assert.equal(frozen.stars, 4);
  assert.equal(frozen.paidSkill.cooldown, 3);
  assert.equal(draft.entries.p0.snapshots["jiang-zha"].owned, false);
  assert.equal(draft.entries.p0.snapshots["jiang-zha"].stars, 0);
  assert.equal(draft.entries.p1.completed, false);
});

test("draft rejects forged and repeated choices, keeps others' candidates private, and permits an explicit skip", () => {
  const draft = createHeroDraft(players(4), allOwned(4), { random: zero });
  const id = draft.entries.p0.choices[0];
  assert.equal(chooseDraftHero(draft, "outsider", id).status, 409);
  assert.equal(chooseDraftHero(draft, "p0", "not-a-hero").status, 409);
  const other = HERO_UNITS.find((hero) => !draft.entries.p0.choices.includes(hero.id));
  assert.equal(chooseDraftHero(draft, "p0", other.id).status, 409);
  assert.equal(chooseDraftHero(draft, "p0", id).snapshot.heroId, id);
  assert.equal(chooseDraftHero(draft, "p0", id).status, 409);
  assert.deepEqual(heroDraftSnapshot(draft, null).choices, []);
  assert.deepEqual(heroDraftSnapshot(draft, "p0").choices, []);
  assert.equal(heroDraftSnapshot(draft, "p1").choices.length, draft.entries.p1.choices.length);
  assert.deepEqual(heroDraftSnapshot(draft, "p1", false).choices, []);
  assert.equal(chooseDraftHero(draft, "p1", null).snapshot, null);
});

test("candidate lottery is identical regardless of inventory, including a single strong hero account", () => {
  const list = players(5);
  const full = createHeroDraft(list, allOwned(5), { random: zero });
  const empty = createHeroDraft(list, {}, { random: zero });
  const single = createHeroDraft(list, { a0: { "shen-biesan": { stars: 5 } } }, { random: zero });
  for (const player of list) {
    assert.deepEqual(full.entries[player.id].choices, empty.entries[player.id].choices);
    assert.deepEqual(full.entries[player.id].choices, single.entries[player.id].choices);
  }
  assert.equal(heroDraftSnapshot(empty, "p0").choices.length, 2);
  assert.ok(heroDraftSnapshot(empty, "p0").choices.every((hero) => !hero.owned && !hero.canSelect));
  assert.equal(chooseDraftHero(empty, "p0", empty.entries.p0.choices[0]).status, 403);
  assert.equal(chooseDraftHero(empty, "p0", null).snapshot, null);
});

test("choosing another hero never redraws candidates or substitutes an owned hero", () => {
  const draft = createHeroDraft(players(9), allOwned(9));
  const before = Object.fromEntries(Object.entries(draft.entries).map(([id, entry]) => [id, [...entry.choices]]));
  chooseDraftHero(draft, "p0", draft.entries.p0.choices[0]);
  for (const [id, entry] of Object.entries(draft.entries)) assert.deepEqual(entry.choices, before[id]);
});

test("unowned candidates require an explicit hire and always produce a one-star temporary snapshot", () => {
  const draft = createHeroDraft(players(2), {});
  draft.id = "round";
  const choice = heroDraftSnapshot(draft, "p0").choices[0];
  assert.equal(choice.canSelect, false);
  assert.equal(choice.canHire, true);
  assert.equal(choice.hireCost, 300);
  assert.equal(chooseDraftHero(draft, "p0", choice.heroId).status, 403);
  const hired = chooseDraftHero(draft, "p0", choice.heroId, { hire: true }).snapshot;
  assert.equal(hired.stars, 1);
  assert.equal(hired.hired, true);
  assert.equal(hired.owned, false);
  assert.equal(hired.hireGameId, "round");
  assert.equal(draft.entries.p0.snapshots[choice.heroId].owned, false);
});

test("owned heroes cannot be hired, and duplicate prevention still prefers an available owned candidate", () => {
  const owned = createHeroDraft(players(2), allOwned(2));
  assert.equal(chooseDraftHero(owned, "p0", owned.entries.p0.choices[0], { hire: true }).status, 409);
  assert.equal(chooseDraftHero(owned, "p0", null, { hire: true }).status, 409);
  const draft = createHeroDraft(players(9), allOwned(9));
  const duplicateId = draft.entries.p0.choices[0];
  chooseDraftHero(draft, "p0", duplicateId);
  const otherId = "p1";
  const entry = draft.entries[otherId];
  entry.choices = [duplicateId, ...entry.choices.filter((id) => id !== duplicateId)];
  entry.snapshots[duplicateId].owned = false;
  assert.equal(chooseDraftHero(draft, otherId, duplicateId, { hire: true }).status, 409);
  entry.choices.filter((id) => id !== duplicateId).forEach((id) => { entry.snapshots[id].owned = false; });
  assert.equal(chooseDraftHero(draft, otherId, duplicateId, { hire: true }).snapshot.stars, 1);
});
