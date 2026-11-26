/**
 * Where the ledger lives on this device: one JSON document in localStorage.
 *
 * Nothing is sent anywhere, and there is no account. Loading is forgiving —
 * a missing or unreadable document comes back empty rather than throwing — but
 * saving reports honestly, so the page can tell you when this browser has
 * refused to keep the numbers.
 */

import { mergeTransactions } from './ledger.js';

const KEY = 'sumday.v1';
const VERSION = 1;

export function emptyLedger() {
  return { version: VERSION, transactions: [], incomes: [] };
}

export function loadLedger() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyLedger();
    const stored = JSON.parse(raw);
    if (!stored || typeof stored !== 'object') return emptyLedger();
    return {
      version: VERSION,
      transactions: Array.isArray(stored.transactions) ? stored.transactions : [],
      incomes: Array.isArray(stored.incomes) ? stored.incomes : [],
    };
  } catch (error) {
    return emptyLedger();
  }
}

/** @returns {boolean} true when the document was written. */
export function saveLedger(ledger) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      version: VERSION,
      transactions: ledger.transactions,
      incomes: ledger.incomes,
    }));
    return true;
  } catch (error) {
    return false;
  }
}

/** Add rows from the importer, skipping ones already recorded. */
export function addTransactions(ledger, rows) {
  const merged = mergeTransactions(ledger.transactions, rows || []);
  return {
    ledger: { ...ledger, transactions: merged.transactions },
    added: merged.added,
    skipped: merged.skipped,
  };
}

/**
 * Add an income: money that arrives on `startsOn` and covers `coversDays` days.
 * @param {{amountCents: number, startsOn: string, coversDays?: number, label?: string}} input
 */
export function addIncome(ledger, input) {
  const income = {
    id: `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    startsOn: input.startsOn,
    amountCents: Math.round(input.amountCents),
    coversDays: Math.max(1, Math.round(input.coversDays || 1)),
    label: String(input.label || '').trim(),
  };
  return { income, ledger: { ...ledger, incomes: ledger.incomes.concat(income) } };
}

export function removeIncome(ledger, id) {
  return { ...ledger, incomes: ledger.incomes.filter((income) => income.id !== id) };
}

export function removeTransaction(ledger, fingerprint) {
  return {
    ...ledger,
    transactions: ledger.transactions.filter((transaction) => transaction.fingerprint !== fingerprint),
  };
}
