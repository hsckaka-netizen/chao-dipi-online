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

export function effectiveRankOrder(card) {
  const replacementRank = card?.rulesReplacementRank || null;
  if (!replacementRank) return STANDARD_RANK_ORDER;
  return STANDARD_RANK_ORDER.map((rank) => (
    rank === replacementRank ? "2" : rank === "2" ? "LOW_2" : rank
  ));
}

export function suitTractorOrderValue(card, trumpSuit) {
  if (!card || card.type !== "normal") return 99;
  const availableRanks = effectiveRankOrder(card).filter((rank) => {
    const sample = {
      type: "normal",
      suit: card.suit,
      rank,
      rulesRank: rank,
      rulesReplacementRank: card.rulesReplacementRank || null
    };
    return !isCompareCardForTractorOrder(sample, trumpSuit);
  });
  const index = availableRanks.indexOf(gameRank(card));
  return index >= 0 ? index : 99;
}
