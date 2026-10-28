import { randomInt } from "node:crypto";
import { HERO_UNITS, createBattleHeroSnapshot } from "./hero-home.js";

export const HERO_DRAFT_STAGE = "hero-selecting";
export const HERO_DRAFT_DURATION_MS = 30000;

function shuffled(values, random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = random(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Ownership never affects the lottery. Spread unavoidable candidate overlaps evenly.
function assignChoices(draft, players, rarity, count, random) {
  const pool = draft.heroes.filter((hero) => hero.rarity === rarity);
  const usage = new Map(pool.map((hero) => [hero.id, 0]));
  for (let round = 0; round < Math.min(count, pool.length); round += 1) {
    for (const player of players) {
      const entry = draft.entries[player.id];
      const candidates = shuffled(pool.filter((hero) => !entry.choices.includes(hero.id)), random)
        .sort((a, b) => usage.get(a.id) - usage.get(b.id));
      const hero = candidates[0];
      if (!hero) continue;
      entry.choices.push(hero.id);
      usage.set(hero.id, usage.get(hero.id) + 1);
    }
  }
}

export function createHeroDraft(players, ownedByAccount = {}, { heroes = HERO_UNITS, random = randomInt, now = Date.now() } = {}) {
  const draft = {
    deadlineAt: new Date(now + HERO_DRAFT_DURATION_MS).toISOString(),
    ssrPerPlayer: Math.max(1, Math.min(2, Math.floor(heroes.filter((hero) => hero.rarity === "ssr").length / Math.max(1, players.length)))),
    heroes,
    entries: Object.fromEntries(players.map((player) => [player.id, {
      choices: [], completed: Boolean(player.test), selectedHeroId: null,
      snapshots: Object.fromEntries(heroes.map((hero) => {
        const owned = !player.test && ownedByAccount[player.accountId]?.[hero.id];
        return [hero.id, {
          ...createBattleHeroSnapshot(hero.id, owned?.stars || 1, owned?.skillCooldown || 0),
          owned: Boolean(owned?.stars >= 1), stars: owned?.stars || 0
        }];
      }))
    }]))
  };
  const order = shuffled(players, random);
  assignChoices(draft, order, "ssr", draft.ssrPerPlayer, random);
  assignChoices(draft, order, "sr", 1, random);
  return draft;
}

function selectedHeroIds(draft) {
  return new Set(Object.values(draft.entries).map((item) => item.selectedHeroId).filter(Boolean));
}

function hasUniqueOwnedChoice(entry, selected) {
  return entry.choices.some((id) => entry.snapshots[id].owned && !selected.has(id));
}

export function chooseDraftHero(draft, playerId, heroId) {
  const entry = draft?.entries[playerId];
  if (!entry || entry.completed) return { error: "本局选将已完成", status: 409 };
  if (heroId && !entry.choices.includes(heroId)) return { error: "请选择当前候选中的英雄", status: 409 };
  if (heroId && !entry.snapshots[heroId].owned) return { error: "尚未拥有这个候选英雄，不能出战", status: 403 };
  const selected = selectedHeroIds(draft);
  if (heroId && selected.has(heroId) && hasUniqueOwnedChoice(entry, selected)) {
    return { error: "请优先选择候选中尚未出战的英雄", status: 409 };
  }
  entry.selectedHeroId = heroId || null;
  entry.completed = true;
  return { snapshot: heroId ? entry.snapshots[heroId] : null };
}

export function heroDraftComplete(draft) {
  return Object.values(draft.entries).every((entry) => entry.completed);
}

export function heroDraftSnapshot(draft, playerId, active = true) {
  const entry = draft?.entries[playerId];
  const selected = draft ? selectedHeroIds(draft) : new Set();
  const hasUnique = entry ? hasUniqueOwnedChoice(entry, selected) : false;
  return {
    active: Boolean(active && draft),
    deadlineAt: active ? draft?.deadlineAt || null : null,
    canChoose: Boolean(active && entry && !entry.completed),
    completedPlayerIds: Object.entries(draft?.entries || {}).filter(([, value]) => value.completed).map(([id]) => id),
    choices: active && entry && !entry.completed ? entry.choices.map((id) => ({
      ...entry.snapshots[id], selectedElsewhere: selected.has(id),
      canSelect: entry.snapshots[id].owned && (!selected.has(id) || !hasUnique)
    })) : []
  };
}
