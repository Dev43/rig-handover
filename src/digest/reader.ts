import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunStatus } from './types.js';

type Line = { at: string; job: string; status: RunStatus; owner: string | null; error: string | null };

const STATUSES: readonly string[] = ['ok', 'retry', 'fail'];

// One log line, checked at the edge. null = bad line.
function parseLine(text: string): Line | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.at !== 'string' || typeof o.job !== 'string') return null;
  if (typeof o.status !== 'string' || !STATUSES.includes(o.status)) return null;
  return {
    at: o.at,
    job: o.job,
    status: o.status as RunStatus,
    owner: typeof o.owner === 'string' ? o.owner : null,
    error: typeof o.error === 'string' ? o.error : null,
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;
  const file = join(runsDir, `${night}.jsonl`);
  if (!existsSync(file)) return null;

  const result: Night = { rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } };
  const byJob = new Map<string, DigestRow>();
  for (const text of readFileSync(file, 'utf8').split('\n')) {
    if (text.trim() === '') continue;
    const line = parseLine(text);
    if (!line) {
      result.badLines++;
      continue;
    }
    result.counts[line.status]++;
    let r = byJob.get(line.job);
    if (!r) {
      r = { job: line.job, owner: null, runs: 0, retries: 0, lastStatus: line.status, lastError: null, firstAt: line.at, lastAt: line.at };
      byJob.set(line.job, r);
    }
    r.runs++;
    if (line.status === 'retry') r.retries++;
    r.lastAt = line.at;
    r.owner = line.owner;
    r.lastStatus = line.status;
    if (line.error) r.lastError = line.error; // most recent error, kept past a later ok
  }
  result.rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return result;
};
