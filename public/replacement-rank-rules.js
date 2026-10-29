const STANDARD_RANK_ORDER = Object.freeze(["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"]);

function gameRank(card) {
  return card?.rulesRank || card?.rank || "";
}

function cardColor(card) {
  if (card?.suit === "H" || card?.suit === "D") return "red";
  if (card?.suit === "S" || card?.suit === "C") return "black";
  return "";
}

function isCompareCardForTractorOrder(card, trumpSuit) {
  if (!card) return false;
  if (gameRank(card) === "2") return true;
  if ((card.suit === "H" || card.suit === "D") && card.rank === "5") return true;
  return card.rank === "3" && trumpSuit && cardColor(card) === cardColor({ suit: trumpSuit });
}

export function applyShenBiesanCardRules(card, replacementRank) {
  if (!card || card.type !== "normal") return card;
  delete card.rulesRank;
  delete card.rulesReplacementRank;
  if (!replacementRank) return card;

  card.rulesReplacementRank = replacementRank;
  if (card.rank === replacementRank) card.rulesRank = "2";
  else if (card.rank === "2") card.rulesRank = "LOW_2";
  return card;
}

// The marker belongs to the current owner, and is copied into played-card facts.
export function applyShenBenleiCardRules(card, enabled) {
  if (!card) return card;
  delete card.rulesShenBenlei;
  if (enabled && card.type === "normal") card.rulesShenBenlei = true;
  return card;
}

export function isShenBenleiTrump(card, trumpSuit) {
  return Boolean(card?.rulesShenBenlei && card.type === "normal" && card.rank === "6"
    && gameRank(card) !== "2" && trumpSuit && card.suit !== trumpSuit
    && cardColor(card) === cardColor({ suit: trumpSuit }));
}

function availableSuitRanks(card, trumpSuit) {
  return effectiveRankOrder(card).filter((rank) => {
    const sample = {
      ...card,
      type: "normal",
      rank,
      rulesRank: rank
    };
    return !isCompareCardForTractorOrder(sample, trumpSuit) && !isShenBenleiTrump(sample, trumpSuit);
  });
}

export function shenBenleiTractorOrderValue(card, trumpSuit) {
  // Immediately below the last ordinary trump; never compress comparison strength.
  return 8 + availableSuitRanks({ ...card, suit: trumpSuit }, trumpSuit).length;
}

export function effectiveRankOrder(card) {
  const replacementRank = card?.rulesReplacementRank || null;
  if (!replacementRank) return STANDARD_RANK_ORDER;
  return STANDARD_RANK_ORDER.map((rank) => (
    rank === replacementRank ? "2" : rank === "2" ? "LOW_2" : rank
  ));
}

export function suitTractorOrderValue(card, trumpSuit) {
  if (!card || card.type !== "normal") return 99;
  const availableRanks = availableSuitRanks(card, trumpSuit);
  const index = availableRanks.indexOf(gameRank(card));
  return index >= 0 ? index : 99;
}
