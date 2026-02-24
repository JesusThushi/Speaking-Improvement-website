// src/utils/hesitationScore.js

/**
 * Score out of 95 (minimum 30) based on hesitation (pause) count and duration.
 * More hesitations in shorter time => lower score.
 *
 * Output range: 30 - 95
 */
export function calculateHesitationScore({ hesitations = 0, durationSeconds = 0 }) {
  const MAX_SCORE = 95;
  const MIN_SCORE = 30;   // ✅ new minimum score

  const dur = Math.max(1, Number(durationSeconds) || 1);
  const h = Math.max(0, Number(hesitations) || 0);

  const minutes = dur / 60;
  const ratePerMin = h / minutes;

  // ---------- PENALTY MODEL ----------
  const basePenalty = Math.max(0, ratePerMin - 3) * 6;
  const extraPenalty = Math.max(0, ratePerMin - 8) * 4;
  const burstPenalty = Math.max(0, ratePerMin - 12) * 3;

  const countPenalty = Math.max(0, h - 5) * 0.7;

  const penalty =
    basePenalty +
    extraPenalty +
    burstPenalty +
    countPenalty;

  let score = MAX_SCORE - penalty;

  // ✅ Clamp between 30 and 95 (instead of 0-95)
  score = Math.round(
    Math.min(MAX_SCORE, Math.max(MIN_SCORE, score))
  );

  const label =
    score >= 85 ? "Excellent" :
    score >= 70 ? "Good" :
    score >= 55 ? "Average" :
    score >= 40 ? "Needs Practice" :
    "Poor";

  return {
    score,
    ratePerMin: Number(ratePerMin.toFixed(2)),
    penalty: Number(penalty.toFixed(2)),
    label,
  };
}