import engine from '../public/match-engine.cjs';
import { ApiError } from './store.js';
export function calculateMatch(input) {
  try {
    if (!input || typeof input !== 'object' || !input.student || !input.task) throw new Error('Нужны student и task');
    return engine.calculate(input.student, input.task);
  } catch (error) { throw new ApiError(400, error.message); }
}
export function normalizeProfile(input) {
  try { return engine.profile(input); } catch (error) { throw new ApiError(400, error.message); }
}
export function explanationFacts(match) {
  return { strengths: match.strengths, missingSkills: match.missingSkills, recommendations: match.recommendations, missingData: match.missingData };
}

export function validateTaskMatchFields(input) {
  try { engine.task(Object.fromEntries(['requiredSkills', 'difficulty', 'requiredHours'].filter(k => Object.hasOwn(input, k)).map(k => [k, input[k]]))); }
  catch (error) { throw new ApiError(400, error.message); }
}
