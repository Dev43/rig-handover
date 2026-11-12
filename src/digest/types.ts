export type RunStatus = 'ok' | 'retry' | 'fail';

// One row per job. Times keep the log's offset; never converted.
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type Night = {
  rows: DigestRow[];
  badLines: number; // lines that did not parse
  counts: Record<RunStatus, number>; // parsed log lines per status
};

// null = no file for this night; an empty file gives a Night with zero rows.
export type ReadNight = (runsDir: string, night: string) => Night | null;
