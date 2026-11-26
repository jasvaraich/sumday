/**
 * SumDay — getting the ledger out of the phone, and back in.
 *
 * Two ways out. Tab-separated rows paste straight into a spreadsheet, and a
 * JSON file can be restored later, on this phone or a new one. One way back:
 * restoring merges, so it can never wipe what is already here.
 *
 * Text in, text out: no DOM, no storage, no network, so the same functions run
 * under Node and are simple to port.
 */

import { addDays, dayDifference, dayTotals, fingerprintOf, mergeTransactions } from './ledger.js';

const APP = 'sumday';
const VERSION = 1;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ------------------------------------------------------------------------- *
 * Spreadsheet copy
 * ------------------------------------------------------------------------- */

/**
 * One row per transaction, oldest first.
 * Money out is negative, so an amount column sums to the net of the period.
 */
export function transactionsToTsv(transactions = []) {
  const rows = [['Date', 'Merchant', 'Amount', 'Currency', 'Read from'].join('\t')];

  for (const transaction of sortedByDate(transactions)) {
    rows.push([
      clean(transaction.date),
      clean(transaction.merchant),
      money(-Math.abs(Number(transaction.amountCents) || 0)),
      clean(transaction.currencyCode || ''),
      clean(transaction.dateSource || ''),
    ].join('\t'));
  }
  return rows.join('\n');
}

/**
 * One row per day from the first day with activity to the last, so a
 * spreadsheet shows the quiet days too.
 */
export function dailyTotalsToTsv(entries = {}) {
  const header = ['Date', 'In', 'Out', 'Net'].join('\t');
  const range = activityRange(entries);
  if (!range) return header;

  const rows = [header];
  const span = dayDifference(range.from, range.to);
  let key = range.from;

  for (let offset = 0; offset <= span; offset += 1) {
    const totals = dayTotals(key, entries);
    rows.push([
      key,
      money(totals.incomeCents),
      money(totals.expenseCents),
      money(totals.netCents),
    ].join('\t'));
    key = addDays(key, 1);
  }
  return rows.join('\n');
}

/* ------------------------------------------------------------------------- *
 * Backup file
 * ------------------------------------------------------------------------- */

/** The backup as plain data: what goes into the file. */
export function buildBackup(entries = {}, exportedAt = new Date()) {
  return {
    app: APP,
    version: VERSION,
    exportedAt: (exportedAt instanceof Date ? exportedAt : new Date(exportedAt)).toISOString(),
    transactions: entries.transactions || [],
    incomes: entries.incomes || [],
  };
}

export function backupToText(entries = {}, exportedAt = new Date()) {
  return JSON.stringify(buildBackup(entries, exportedAt), null, 2);
}

/**
 * Read a backup file's text. Throws a TypeError with a plain message when the
 * text is not one; otherwise returns the entries it could make sense of.
 *
 * @returns {{transactions: object[], incomes: object[]}}
 */
export function readBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text));
  } catch (error) {
    throw new TypeError('That file is not readable as JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || parsed.app !== APP) {
    throw new TypeError('That is not a SumDay backup.');
  }
  if (!Array.isArray(parsed.transactions)) {
    throw new TypeError('That backup has no transactions in it.');
  }

  return {
    transactions: parsed.transactions.map(keepTransaction).filter(Boolean),
    incomes: (Array.isArray(parsed.incomes) ? parsed.incomes : []).map(keepIncome).filter(Boolean),
  };
}

/**
 * Put a backup back into a ledger without losing what is already there:
 * transactions are matched on their fingerprint, incomes on their id, so
 * restoring the same file twice adds nothing.
 */
export function mergeBackup(current = {}, incoming = {}) {
  const mergedTransactions = mergeTransactions(current.transactions || [], incoming.transactions || []);

  const knownIds = new Set((current.incomes || []).map((income) => income.id));
  const addedIncomes = [];
  for (const income of incoming.incomes || []) {
    const id = income.id || `i${income.startsOn}-${income.amountCents}-${income.coversDays}`;
    if (knownIds.has(id)) continue;
    knownIds.add(id);
    addedIncomes.push({ ...income, id });
  }

  return {
    ledger: {
      ...current,
      transactions: mergedTransactions.transactions,
      incomes: (current.incomes || []).concat(addedIncomes),
    },
    addedTransactions: mergedTransactions.added.length,
    skippedTransactions: mergedTransactions.skipped,
    addedIncomes: addedIncomes.length,
    skippedIncomes: (incoming.incomes || []).length - addedIncomes.length,
  };
}

/* ------------------------------------------------------------------------- *
 * Small helpers
 * ------------------------------------------------------------------------- */

/** The first and last day anything happens on, or null when the ledger is empty. */
function activityRange(entries) {
  const days = [];
  for (const transaction of entries.transactions || []) {
    if (DAY_RE.test(String(transaction.date))) days.push(String(transaction.date));
  }
  for (const income of entries.incomes || []) {
    if (!DAY_RE.test(String(income.startsOn))) continue;
    days.push(String(income.startsOn));
    days.push(addDays(String(income.startsOn), Math.max(1, Math.round(income.coversDays || 1)) - 1));
  }
  if (days.length === 0) return null;
  days.sort();
  return { from: days[0], to: days[days.length - 1] };
}

function sortedByDate(transactions) {
  return transactions.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/** 2450 -> "-24.50"; -830 -> "-8.30". */
function money(cents) {
  return (Math.round(cents) / 100).toFixed(2);
}

/** A spreadsheet cell: no tabs, no newlines. */
function clean(value) {
  return String(value == null ? '' : value).replace(/[\t\r\n]+/g, ' ').trim();
}

function keepTransaction(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (!DAY_RE.test(String(entry.date))) return null;

  const amountCents = Number(entry.amountCents);
  if (!Number.isFinite(amountCents)) return null;

  const merchant = typeof entry.merchant === 'string' ? entry.merchant : '';
  const date = String(entry.date);
  const fingerprint = typeof entry.fingerprint === 'string' && entry.fingerprint
    ? entry.fingerprint
    : fingerprintOf({ date, merchant, amountCents: Math.round(amountCents) });

  return {
    merchant,
    amountCents: Math.round(amountCents),
    currencyCode: typeof entry.currencyCode === 'string' ? entry.currencyCode : '',
    date,
    dateSource: typeof entry.dateSource === 'string' ? entry.dateSource : '',
    fingerprint,
  };
}

function keepIncome(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (!DAY_RE.test(String(entry.startsOn))) return null;

  const amountCents = Number(entry.amountCents);
  if (!Number.isFinite(amountCents)) return null;

  return {
    id: typeof entry.id === 'string' ? entry.id : '',
    startsOn: String(entry.startsOn),
    amountCents: Math.round(amountCents),
    coversDays: Math.max(1, Math.round(Number(entry.coversDays) || 1)),
    label: typeof entry.label === 'string' ? entry.label : '',
  };
}
