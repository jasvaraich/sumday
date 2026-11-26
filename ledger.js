/**
 * SumDay — the ledger: what one day came to, and what the month looks like.
 *
 * Pure data in, pure data out: no DOM, no storage, no clock. Callers pass the
 * days they mean. Dates are calendar days as "YYYY-MM-DD" in local time and
 * money is integer cents, so each function has a small Swift twin.
 *
 * Two kinds of entry:
 *   transaction — money out on one day:
 *                 { date, merchant, amountCents, currencyCode, dateSource }
 *   income      — money in, spread across the days it covers:
 *                 { startsOn, amountCents, coversDays, label }
 *
 * A biweekly cheque of $1,400 covering fourteen days puts $100 on each of
 * those days, so a day answers "am I up or down today" instead of spiking on
 * payday and starving for the next thirteen days.
 */

/* ------------------------------------------------------------------------- *
 * Calendar days
 * ------------------------------------------------------------------------- */

/** The calendar day a Date falls on, as "2026-09-24", in local time. */
export function dayKey(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) throw new TypeError('dayKey: not a valid Date');
  return `${pad(value.getFullYear(), 4)}-${pad(value.getMonth() + 1, 2)}-${pad(value.getDate(), 2)}`;
}

/** "2026-09-24" stepped by whole days; months and years roll over themselves. */
export function addDays(key, delta) {
  const { year, month, day } = partsOf(key);
  return dayKey(new Date(year, month - 1, day + delta));
}

/** Whole days from one key to another: positive when `to` is later. */
export function dayDifference(fromKey, toKey) {
  return Math.round((utc(toKey) - utc(fromKey)) / 86400000);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(key) {
  return new Date(utc(key)).getUTCDay();
}

/** 28, 29, 30 or 31. `month` is 1-12. */
export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/** The key for one day of a month. `month` is 1-12. */
export function dayKeyOf(year, month, day) {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/* ------------------------------------------------------------------------- *
 * Money per day
 * ------------------------------------------------------------------------- */

/**
 * How much of an income belongs to one day, in cents: zero outside the days it
 * covers. The share is the amount divided by the days it covers, with the
 * leftover cents given to the first days, so the shares always add up to the
 * amount exactly.
 */
export function incomeShare(income, key) {
  const amount = Math.round(income.amountCents);
  const days = Math.max(1, Math.round(income.coversDays || 1));
  const offset = dayDifference(income.startsOn, key);
  if (offset < 0 || offset >= days) return 0;

  const base = Math.trunc(amount / days);
  const leftover = amount - base * days;
  return base + (offset < leftover ? 1 : 0);
}

/**
 * One day, whole.
 *
 * @param {string} key  "2026-09-24"
 * @param {{transactions?: object[], incomes?: object[]}} entries
 * @returns {{key: string, incomeCents: number, expenseCents: number, netCents: number}}
 */
export function dayTotals(key, entries = {}) {
  const transactions = entries.transactions || [];
  const incomes = entries.incomes || [];

  let expenseCents = 0;
  for (const transaction of transactions) {
    if (transaction.date === key) expenseCents += Math.round(transaction.amountCents);
  }

  let incomeCents = 0;
  for (const income of incomes) {
    incomeCents += incomeShare(income, key);
  }

  return { key, incomeCents, expenseCents, netCents: incomeCents - expenseCents };
}

/** Every day of a month, in order. `month` is 1-12. */
export function monthTotals(year, month, entries = {}) {
  const count = daysInMonth(year, month);
  const days = [];
  for (let day = 1; day <= count; day += 1) {
    days.push(dayTotals(dayKeyOf(year, month, day), entries));
  }
  return days;
}

/* ------------------------------------------------------------------------- *
 * Transactions
 * ------------------------------------------------------------------------- */

/**
 * Add parsed rows to the ledger without ever recording the same row twice.
 *
 * A transaction's fingerprint is its day, merchant and amount, plus which
 * repeat of that triple it is within one import. Importing the same screenshot
 * again therefore adds nothing, while two genuinely separate purchases in one
 * import stay two rows.
 *
 * @param {object[]} existing  Transactions already in the ledger.
 * @param {object[]} rows      Rows from parseTransactions().
 * @returns {{transactions: object[], added: object[], skipped: number}}
 */
export function mergeTransactions(existing, rows) {
  const seen = new Set(existing.map((transaction) => transaction.fingerprint));
  const repeats = new Map();
  const added = [];

  for (const row of rows) {
    const base = `${row.date}|${row.merchant}|${row.amountCents}`;
    const repeat = repeats.get(base) || 0;
    repeats.set(base, repeat + 1);

    const fingerprint = `${base}|${repeat}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    added.push({ ...row, fingerprint });
  }

  return {
    transactions: existing.concat(added),
    added,
    skipped: rows.length - added.length,
  };
}

/* ------------------------------------------------------------------------- *
 * Small helpers
 * ------------------------------------------------------------------------- */

function partsOf(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key));
  if (!match) throw new TypeError(`ledger: "${key}" is not a "YYYY-MM-DD" day`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function utc(key) {
  const { year, month, day } = partsOf(key);
  return Date.UTC(year, month - 1, day);
}

function pad(value, width) {
  return String(value).padStart(width, '0');
}
