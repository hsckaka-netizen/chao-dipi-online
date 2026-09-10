export const ENERGY_RULES = Object.freeze({
  version: "2026-09-10-v1",
  maximum: 24,
  pveStartCost: 6,
  recoveryIntervalMs: 60 * 60 * 1000,
  purchaseAmount: 6,
  purchaseDiamondCost: 200
});

function validDate(value, fallback) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

export function recoverEnergy(state = {}, at = new Date()) {
  const now = validDate(at, new Date());
  const maximum = ENERGY_RULES.maximum;
  const stored = Math.max(0, Math.min(maximum, Math.trunc(Number(state.energy) || 0)));
  const refreshedAt = validDate(state.refreshedAt, now);
  const elapsed = Math.max(0, now.getTime() - refreshedAt.getTime());
  const recovered = stored >= maximum
    ? 0
    : Math.min(maximum - stored, Math.floor(elapsed / ENERGY_RULES.recoveryIntervalMs));
  const energy = stored + recovered;
  const nextRefreshedAt = energy >= maximum
    ? refreshedAt
    : new Date(refreshedAt.getTime() + recovered * ENERGY_RULES.recoveryIntervalMs);
  const nextRecoveryAt = energy >= maximum
    ? null
    : new Date(nextRefreshedAt.getTime() + ENERGY_RULES.recoveryIntervalMs).toISOString();
  return {
    energy,
    recovered,
    refreshedAt: nextRefreshedAt.toISOString(),
    nextRecoveryAt,
    maximum,
    pveStartCost: ENERGY_RULES.pveStartCost,
    purchaseAmount: ENERGY_RULES.purchaseAmount,
    purchaseDiamondCost: ENERGY_RULES.purchaseDiamondCost,
    canPurchase: energy <= maximum - ENERGY_RULES.purchaseAmount
  };
}

export function consumePveStartEnergy(state = {}, at = new Date()) {
  const current = recoverEnergy(state, at);
  const eligible = current.energy >= ENERGY_RULES.pveStartCost;
  return {
    ...current,
    energyBefore: current.energy,
    energySpent: eligible ? ENERGY_RULES.pveStartCost : 0,
    energy: eligible ? current.energy - ENERGY_RULES.pveStartCost : current.energy,
    eligible,
    reason: eligible ? null : "insufficient-energy",
    refreshedAt: current.energy >= ENERGY_RULES.maximum && eligible
      ? new Date(at).toISOString()
      : current.refreshedAt,
    nextRecoveryAt: eligible && current.energy >= ENERGY_RULES.maximum
      ? new Date(new Date(at).getTime() + ENERGY_RULES.recoveryIntervalMs).toISOString()
      : current.nextRecoveryAt
  };
}

export function purchaseEnergy(state = {}, at = new Date()) {
  const current = recoverEnergy(state, at);
  if (!current.canPurchase) {
    return { ...current, purchased: false, reason: "would-exceed-maximum" };
  }
  const energy = current.energy + ENERGY_RULES.purchaseAmount;
  const full = energy >= ENERGY_RULES.maximum;
  return {
    ...current,
    energy,
    purchased: true,
    reason: null,
    refreshedAt: full ? new Date(at).toISOString() : current.refreshedAt,
    nextRecoveryAt: full ? null : current.nextRecoveryAt,
    canPurchase: energy <= ENERGY_RULES.maximum - ENERGY_RULES.purchaseAmount
  };
}
