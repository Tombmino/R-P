// Ranking shared by every game: "competition ranking" (1-1-3 on a tie),
// plus the medal shown for a rank.
//
// Special case: if nobody has scored yet (everyone at 0, usually right
// after a reset) we fall back to positional ranking, so the sheet reads
// 🥇 / 🥈 instead of marking every player a joint winner of nothing.

export function rankPlayers(entries, { lowestWins = false } = {}) {
  const ranked = [...entries].sort((a, b) =>
    lowestWins ? a.total - b.total : b.total - a.total
  );
  const nobodyScored = ranked.length > 0 && ranked.every(e => e.total === 0);
  let currentRank = 1;
  ranked.forEach((entry, idx) => {
    const better = lowestWins
      ? (idx > 0 && entry.total > ranked[idx - 1].total)
      : (idx > 0 && entry.total < ranked[idx - 1].total);
    if (better) currentRank = idx + 1;
    entry.rank = nobodyScored ? (idx + 1) : currentRank;
  });
  return ranked;
}

export function medalFor(rank) {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
}
