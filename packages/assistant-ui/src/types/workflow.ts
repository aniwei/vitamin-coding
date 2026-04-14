export enum WorkflowRunningStatus {
  Waiting = 'waiting',
  Running = 'running',
  Succeeded = 'succeeded',
  Failed = 'failed',
  Stopped = 'stopped',
  Paused = 'paused',
}

export enum WorkflowVersion {
  Draft = 'draft',
  Latest = 'latest',
}
