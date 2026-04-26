export {
  KillSwitchError,
  isKillSwitchEngaged,
  isDryRun,
  assertKillSwitchOff,
  getStatus,
} from './kill-switch';

export { checkSpendCap } from './spend-cap';
export type { SpendCapDeps, SpendCapDb, SpendDailyRow, InsightsProvider, AlertSender } from './spend-cap';

export {
  handleDisapproval,
  getDisapprovalRate,
  _resetDisapprovalCounters,
} from './disapproval-notify';
export type {
  MetaDisapprovalEvent,
  DisapprovalDeps,
  DisapprovalRateDb,
  DisapprovalRateRow,
  DisapprovalMetaApi,
  DisapprovalAlertSender,
} from './disapproval-notify';
