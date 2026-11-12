import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const line = (at: string, job: string, status: string, owner: string | null = 'lane-07') =>
  JSON.stringify({ at, job, status, owner });

let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  mkdirSync(dir, { recursive: true });
  // good night: jobs written out of sorted order
  writeFileSync(
    join(dir, '2026-10-28.jsonl'),
    [
      line('2026-10-28T23:00:02+01:00', 'rig/rotate-logs', 'ok'),
      line('2026-10-28T23:05:00+01:00', 'rig/backup', 'retry', null),
      line('2026-10-28T23:10:00+01:00', 'rig/backup', 'ok', null),
      line('2026-10-28T23:15:00+01:00', 'rig/cleanup', 'fail'),
    ].join('\n') + '\n',
  );
  writeFileSync(join(dir, '2026-10-27.jsonl'), '');
  writeFileSync(
    join(dir, '2026-10-26.jsonl'),
    line('2026-10-26T23:00:02+01:00', 'rig/rotate-logs', 'ok') + '\n{"at":"2026-10-26T23:05:00+01:00","job":"rig/ba',
  );
  app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir });
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe.each([
  ['page', '/digest/'],
  ['json', '/api/digest/'],
])('%s', (kind, base) => {
  const get = async (night: string) => {
    const res = await app.request(base + night);
    return { res, body: await res.text() };
  };

  it('200 for a night with a file', async () => {
    const { res, body } = await get('2026-10-28');
    expect(res.status).toBe(200);
    expect(body).toContain('rig/backup');
  });

  it('404 for a night with no file', async () => {
    expect((await get('2026-01-01')).res.status).toBe(404);
  });

  it('empty night', async () => {
    const { res, body } = await get('2026-10-27');
    expect(res.status).toBe(200);
    if (kind === 'page') expect(body).toContain('nothing ran');
    else expect(JSON.parse(body).rows).toEqual([]);
  });

  it('bad line still renders the good rows', async () => {
    const { res, body } = await get('2026-10-26');
    expect(res.status).toBe(200);
    expect(body).toContain('rig/rotate-logs');
    if (kind === 'json') expect(JSON.parse(body).badLines).toBe(1);
  });
});

it('page rows follow the JSON order', async () => {
  const json = await (await app.request('/api/digest/2026-10-28')).json();
  const html = await (await app.request('/digest/2026-10-28')).text();
  const jobs: string[] = json.rows.map((r: { job: string }) => r.job);
  expect(jobs.length).toBeGreaterThan(1);
  const pos = jobs.map((j) => html.indexOf(j));
  expect(pos.every((p) => p >= 0)).toBe(true);
  expect(pos).toEqual([...pos].sort((a, b) => a - b));
});
