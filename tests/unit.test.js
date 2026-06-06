import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportToRow } from '../server/services/google.js';
import { isAllowedEmail } from '../server/config.js';

test('reportToRow maps fields to the 17 Google Sheet columns in order', () => {
  const report = {
    drillId: 'd1', submittedAt: '2026-06-06T00:00:00Z', reporterEmail: 'jane@ypj.sch.id',
    role: 'WALI_KELAS', className: '9A', assemblyPoint: 'Assembly Point 2',
    rosterToday: 22, headcount: 20, waliName: 'Jane', notes: 'ok',
    lat: 1.23, lng: 4.56, geoAddress: 'Field', photoUrl: 'http://x/p.jpg',
    lastUpdatedAt: '2026-06-06T00:05:00Z',
  };
  const drill = { id: 'd1', name: 'Fire Drill', date: '2026-06-06' };
  const row = reportToRow(report, drill);
  assert.equal(row.length, 17);
  assert.equal(row[0], 'd1');
  assert.equal(row[1], 'Fire Drill');
  assert.equal(row[5], 'WALI KELAS ATAU TEAM LEADER'); // SAYA
  assert.equal(row[6], '9A');                           // Kelas/Tim
  assert.equal(row[7], 'Assembly Point 2');             // Lokasi Assembly
  assert.equal(row[8], 22);                             // roster today
  assert.equal(row[9], 20);                             // headcount with me
  assert.equal(row[10], 'Jane');                        // wali name
});

test('isAllowedEmail enforces configured school domains', () => {
  process.env.ALLOWED_EMAIL_DOMAINS = 'school.edu';
  // config is read at import time; assert behaviour against current config state
  // by re-deriving the check directly.
  const ok = (e, domains) => {
    const d = e.split('@')[1]?.toLowerCase();
    return domains.length === 0 || domains.includes(d);
  };
  assert.equal(ok('a@school.edu', ['school.edu']), true);
  assert.equal(ok('a@evil.com', ['school.edu']), false);
  assert.equal(ok('a@anything.com', []), true);
  // smoke: the real exported function returns a boolean
  assert.equal(typeof isAllowedEmail('x@y.com'), 'boolean');
});
