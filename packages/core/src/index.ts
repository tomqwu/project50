export { coreVersion } from "./version";
export {
  addDays,
  dayNumber,
  isValidTimeZone,
  localDayKey,
  safeTimeZone,
  type DayKey,
} from "./dates";
export {
  computeDayCompletion,
  type CompletionRule,
  type DayActivity,
  type DayCompletion,
  type GoalType,
} from "./completion";
export { currentStreak, longestStreak } from "./streak";
export { evaluateMilestones, type MilestoneInput, type MilestoneKind } from "./milestones";
export {
  validateActivityInput,
  type ActivityInput,
  type ChallengeWindow,
  type ValidationError,
} from "./validation";
export {
  PROJECT50_RULES,
  PROJECT50_RULE_IDS,
  PROJECT50_LENGTH_DAYS,
  project50CurrentDay,
  type Project50Rule,
  type Project50CurrentDayInput,
} from "./project50";
