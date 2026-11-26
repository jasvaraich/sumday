/**
 * Node test for the backup and spreadsheet copy — no browser needed:
 *
 *     node --test tests/
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  transactionsToTsv,
  dailyTotalsToTsv,
  backupToText,
  readBackup,
  mergeBackup,
} from '../backup.js';

const LEDGER = {
  version: 1,
  transactions: [
    {
      merchant: 'Harbour Tickets',
      amountCents: 2450,
      currencyCode: 'CAD',
      date: '2026-09-24',
      dateSource: '3 hours ago',
      fingerprint: '2026-09-24|Harbour Tickets|2450|0',
    },
  ],
  incomes: [
    { id: 'i1', startsOn: '2026-09-18', amountCents: 140000, coversDays: 14, label: 'Pay' },
  ],
};

test('the spreadsheet copy has a header and one row per transaction', () => {
  const lines = transactionsToTsv(LEDGER.transactions).split('\n');
  assert.equal(lines[0], 'Date\tMerchant\tAmount\tCurrency\tRead from');
  assert.equal(lines[1], '2026-09-24\tHarbour Tickets\t-24.50\tCAD\t3 hours ago');
  assert.equal(lines.length, 2);
});

test('the daily totals run from the first day to the last, quiet days included', () => {
  const lines = dailyTotalsToTsv(LEDGER).split('\n');
  assert.equal(lines[0], 'Date\tIn\tOut\tNet');
  assert.equal(lines.length, 15, 'fourteen days plus the header');
  assert.equal(lines[1], '2026-09-18\t100.00\t0.00\t100.00');
  assert.ok(lines.includes('2026-09-24\t100.00\t24.50\t75.50'), 'the day of the purchase');
  assert.equal(lines[lines.length - 1], '2026-10-01\t100.00\t0.00\t100.00');
});

test('a backup survives the round trip', () => {
  const incoming = readBackup(backupToText(LEDGER));
  assert.equal(incoming.transactions.length, 1);
  assert.equal(incoming.incomes.length, 1);

  const restored = mergeBackup({ version: 1, transactions: [], incomes: [] }, incoming);
  assert.equal(restored.addedTransactions, 1);
  assert.equal(restored.addedIncomes, 1);
  assert.deepEqual(restored.ledger.transactions, LEDGER.transactions);
  assert.deepEqual(restored.ledger.incomes, LEDGER.incomes);
});

test('restoring the same backup twice adds nothing the second time', () => {
  const incoming = readBackup(backupToText(LEDGER));
  const first = mergeBackup({ version: 1, transactions: [], incomes: [] }, incoming);
  const second = mergeBackup(first.ledger, incoming);

  assert.equal(second.addedTransactions, 0);
  assert.equal(second.addedIncomes, 0);
  assert.equal(second.skippedTransactions, 1);
  assert.equal(second.skippedIncomes, 1);
  assert.equal(second.ledger.transactions.length, 1);
  assert.equal(second.ledger.incomes.length, 1);
});

test('a file that is not a backup is refused, with a reason', () => {
  assert.throws(() => readBackup('not json'), /JSON/);
  assert.throws(() => readBackup('{"hello":true}'), /SumDay backup/);
});

test('a transaction with no readable day is dropped rather than kept', () => {
  const incoming = readBackup(JSON.stringify({
    app: 'sumday',
    transactions: [
      { date: 'someday', merchant: 'X', amountCents: 100 },
      { date: '2026-09-24', merchant: 'Y', amountCents: 200 },
    ],
    incomes: [],
  }));
  assert.equal(incoming.transactions.length, 1);
  assert.equal(incoming.transactions[0].merchant, 'Y');
});
