export {
  LOCK_FILE_NAME,
  startIndexer,
  type RunningIndexer,
  type StartIndexerOptions,
} from './indexer.js';
export {
  DEFAULT_HEARTBEAT_MS,
  DEFAULT_STALE_AFTER_MS,
  InstanceLockedError,
  acquireInstanceLock,
  type AcquireOptions,
  type InstanceLock,
  type LockOwner,
} from './lock.js';
