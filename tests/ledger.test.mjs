/**
 * Node test for the ledger — no browser needed:
 *
 *     node --test tests/
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  dayKey,
  addDays,
  dayDifference,
  weekdayOf,
  daysInMonth,
  dayKeyOf,
  incomeShare,
  dayTotals,
  monthTotals,
  mergeTransactions,
} from '../ledger.js';

const BIWEEKLY = { startsOn: '2026-09-18', amountCents: 140000, coversDays: 14, label: 'Pay' };

test('a biweekly cheque spreads evenly over its fourteen days', () => {
  assert.equal(incomeShare(BIWEEKLY, '2026-09-18'), 10000);
  assert.equal(incomeShare(BIWEEKLY, '2026-09-25'), 10000);
  assert.equal(incomeShare(BIWEEKLY, '2026-10-01'), 10000, 'the last day it covers');
  assert.equal(incomeShare(BIWEEKLY, '2026-09-17'), 0, 'the day before it starts');
  assert.equal(incomeShare(BIWEEKLY, '2026-10-02'), 0, 'the day after it ends');
});

test('the fourteen shares add up to the whole cheque', () => {
  let total = 0;
  for (let offset = 0; offset < 14; offset += 1) {
    total += incomeShare(BIWEEKLY, addDays('2026-09-18', offset));
  }
  assert.equal(total, 140000);
});

test('an amount that does not divide evenly still adds up', () => {
  const odd = { startsOn: '2026-09-01', amountCents: 10000, coversDays: 3, label: '' };
  assert.equal(incomeShare(odd, '2026-09-01'), 3334);
  assert.equal(incomeShare(odd, '2026-09-02'), 3333);
  assert.equal(incomeShare(odd, '2026-09-03'), 3333);
});

test('a day is what came in minus what went out', () => {
  const entries = {
    transactions: [{ date: '2026-09-24', merchant: 'Harbour Tickets', amountCents: 2000 }],
    incomes: [BIWEEKLY],
  };
  assert.deepEqual(dayTotals('2026-09-24', entries), {
    key: '2026-09-24',
    incomeCents: 10000,
    expenseCents: 2000,
    netCents: 8000,
  });
});

test('a month holds every day, in order', () => {
  const days = monthTotals(2026, 9, {});
  assert.equal(days.length, 30);
  assert.equal(days[0].key, '2026-09-01');
  assert.equal(days[29].key, '2026-09-30');
  assert.equal(daysInMonth(2024, 2), 29, 'a leap February');
  assert.equal(dayKeyOf(2026, 9, 1), '2026-09-01');
});

test('day arithmetic crosses months, years and weekdays', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(dayDifference('2026-12-31', '2027-01-01'), 1);
  assert.equal(dayDifference('2026-09-24', '2026-09-18'), -6);
  assert.equal(weekdayOf('2026-09-24'), 4, 'Thursday');
  assert.equal(dayKey(new Date(2026, 8, 24, 12, 0, 0)), '2026-09-24');
});

test('importing the same rows twice adds nothing the second time', () => {
  const rows = [
    { merchant: 'Harbour Tickets', amountCents: 2450, currencyCode: 'CAD', date: '2026-09-24', dateSource: '3 hours ago' },
    { merchant: 'Riverside Parking', amountCents: 1375, currencyCode: 'CAD', date: '2026-09-24', dateSource: '4 hours ago' },
  ];

  const first = mergeTransactions([], rows);
  assert.equal(first.added.length, 2);

  const second = mergeTransactions(first.transactions, rows);
  assert.equal(second.added.length, 0);
  assert.equal(second.skipped, 2);
  assert.equal(second.transactions.length, 2);
});

test('two identical purchases in one import stay two rows', () => {
  const row = { merchant: 'Riverside Parking', amountCents: 1375, currencyCode: 'CAD', date: '2026-09-24', dateSource: '4 hours ago' };
  const result = mergeTransactions([], [row, { ...row }]);
  assert.equal(result.added.length, 2);
  assert.notEqual(result.added[0].fingerprint, result.added[1].fingerprint);
});
