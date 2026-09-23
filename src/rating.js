import readiness from '../public/readiness-engine.cjs';
export const fields = Object.fromEntries(Object.entries(readiness.fields).map(([key, value]) => [key, value.slice(0, 2)]));
export const levelForScore = readiness.levelForScore;
export function calculateRating(task) {
  const { score, level, missingFields } = readiness.describe(task);
  return { score, level, missingFields };
}
