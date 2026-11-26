/**
 * SumDay — Wallet transaction parser.
 *
 * One documented function does the work:
 *
 *     parseTransactions(lines, referenceDate, options) -> Row[]
 *
 * Hand it the text lines a screenshot reader produced, top to bottom, and it
 * returns the card transactions it can prove, in document order.
 *
 * This module holds no DOM, network, storage or navigation code, and no
 * framework: plain data in, plain data out, so each function can be ported
 * back to Swift on its own. Money is integer cents, every date is a calendar
 * day ("2026-09-24"), and the only clock it reads is the reference date.
 *
 * @typedef {Object} Row
 * @property {string}      merchant     Merchant name; "" when none could be read.
 * @property {number}      amountCents  Minor units: $20.00 -> 2000.
 * @property {string}      currencyCode ISO 4217 code implied by the symbol ("$20.00" in Canada -> "CAD").
 * @property {string|null} date         Local calendar day the purchase happened, "YYYY-MM-DD"; null when no date line was found.
 * @property {string}      dateSource   The exact words the date was read from ("3 hours ago", "Sunday"); "" when date is null.
 *
 * @typedef {Object} Day  A calendar day in local time; not a timestamp.
 * @property {number} year
 * @property {number} month  1-12
 * @property {number} day    1-31
 * @property {number} dow    0 = Sunday
 */

/* ------------------------------------------------------------------------- *
 * Patterns
 * ------------------------------------------------------------------------- */

const NBSP = /[\u00A0\u2007\u202F]/g;

/**
 * A transaction anchor: a currency symbol, an integer part and exactly two
 * decimals. Amounts without cents are ignored on purpose, so a half-hidden
 * row ("Riverside Parking $1/") never turns into a $1.00 transaction.
 * No `g` flag, so exec() and test() stay stateless.
 */
// The yen sign is written as an escape because it exists in two code points —
// U+00A5 and the full-width U+FFE5 — and readers produce either one.
export const AMOUNT_RE = /([$€£\u00A5\uFFE5])\s?(\d{1,3}(?:[\s,]\d{3})*|\d+)\.(\d{2})/;

const RELATIVE_RE = /\b(\d{1,3})\s+(minutes?|hours?|days?)\s+ago\b/i;
const TODAY_RE = /\btoday\b/i;
const YESTERDAY_RE = /\byesterday\b/i;
const WEEKDAY_RE = /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues|tue|wed|thurs|thur|thu|fri|sat)\b\.?/i;
const MONTH_DAY_RE = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i;

const CLOCK_TIME_RE = /^\d{1,2}:\d{2}/;
const DIGITS_ONLY_RE = /^\d{1,3}$/;
const CITY_PROVINCE_RE = /^.+,\s*[A-Za-z]{2,}\s*$/;

/** Characters a merchant name is stripped of at its end: "Harbour Tickets $24.50 >" -> "Harbour Tickets". */
const TRAILING_DECOR = /[\s>|·—]+$/;

const WEEKDAYS = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tues: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thurs: 4, thur: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const MONTHS = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sept: 9, sep: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

const CURRENCY_BY_SYMBOL = { '€': 'EUR', '£': 'GBP', '\u00A5': 'JPY', '\uFFE5': 'JPY' };

/** The `$` currencies a browser locale can mean. */
const DOLLAR_BY_REGION = {
  CA: 'CAD',
  US: 'USD',
  AU: 'AUD',
  NZ: 'NZD',
  SG: 'SGD',
  HK: 'HKD',
  TW: 'TWD',
};

/* ------------------------------------------------------------------------- *
 * Public entry point
 * ------------------------------------------------------------------------- */

/**
 * Read a Wallet "Latest Transactions" screenshot's text lines.
 *
 * @param {string[]} lines            Text lines in document order, as the reader produced them.
 * @param {Date} [referenceDate]      When the screenshot was taken — normally `new Date()`.
 *                                    "3 hours ago", "Sunday" and "Sep 12" are all resolved against it.
 * @param {{dollarCurrency?: string}} [options]
 *                                    `dollarCurrency` decides what "$" means: "CAD" for a Canadian
 *                                    locale, "USD" otherwise. Pass the result of
 *                                    `dollarCurrencyForLocale(navigator.language)` from a page.
 * @returns {Row[]}                   Rows in document order. Rows are never merged or dropped:
 *                                    a row whose date could not be read still comes back, with
 *                                    `date: null` and `dateSource: ""`.
 */
export function parseTransactions(lines, referenceDate = new Date(), options = {}) {
  const reference = dayOf(referenceDate);
  const dollarCurrency = normaliseCurrency(options.dollarCurrency) || 'USD';

  const kept = [];
  for (const raw of lines || []) {
    const line = normaliseLine(raw);
    if (!line) continue;
    if (isChromeLine(line)) continue;
    kept.push(line);
  }

  // Every line that anchors a transaction, in order: its index among `kept`
  // and its amount match. These anchors also bound each line's date search.
  const anchors = [];
  for (let i = 0; i < kept.length; i += 1) {
    const match = AMOUNT_RE.exec(kept[i]);
    if (match) anchors.push({ index: i, match });
  }

  const rows = [];
  for (let a = 0; a < anchors.length; a += 1) {
    const anchor = anchors[a];
    const dateRead = readDate(kept, anchors, a, reference);
    rows.push({
      merchant: readMerchant(kept, anchor, reference),
      amountCents: readAmountCents(anchor.match),
      currencyCode: currencyForSymbol(anchor.match[1], dollarCurrency),
      date: dateRead ? formatDay(dateRead.day) : null,
      dateSource: dateRead ? dateRead.source : '',
    });
  }
  return rows;
}

/** Trim a line and replace non-breaking spaces with normal ones. */
export function normaliseLine(value) {
  return String(value == null ? '' : value).replace(NBSP, ' ').trim();
}

/**
 * True for decoration that is never a transaction: the sheet's title, the
 * card's branding, the phone's status bar.
 */
export function isChromeLine(line) {
  const text = normaliseLine(line);
  const lower = text.toLowerCase();
  if (lower.includes('latest transactions')) return true;
  if (lower.includes('member since')) return true;
  if (lower.includes('titulaire depuis')) return true;
  if (lower.includes('american express')) return true;
  if (text.startsWith('©')) return true;
  if (lower.startsWith('www.')) return true;
  if (CLOCK_TIME_RE.test(text)) return true;
  if (text.includes('••')) return true;
  if (text.includes('5G') || text.includes('LTE')) return true;
  if (DIGITS_ONLY_RE.test(text)) return true;
  return false;
}

/**
 * The dollar currency a locale's "$" means, e.g. "en-CA" -> "CAD", "en-US" -> "USD",
 * "fr-FR" -> "USD". Regions without a dollar fall back to USD.
 * Pure: it only reads the locale tag you give it.
 */
export function dollarCurrencyForLocale(locale) {
  return DOLLAR_BY_REGION[regionOf(locale)] || 'USD';
}

/* ------------------------------------------------------------------------- *
 * Rows
 * ------------------------------------------------------------------------- */

/** "$1,234.56" / "$1 234.56" / "$20.00" -> 123456 / 123456 / 2000. */
function readAmountCents(match) {
  const whole = match[2].replace(/[\s,]/g, '');
  return Number(whole) * 100 + Number(match[3]);
}

/**
 * The merchant for one anchored line: what is left of the amount's own line
 * once the amount and its trailing decoration are removed. When that leaves
 * nothing, walk upwards past meta lines and other amounts.
 */
function readMerchant(kept, anchor, reference) {
  const line = kept[anchor.index];
  const match = anchor.match;
  const withoutAmount = line.slice(0, match.index) + line.slice(match.index + match[0].length);
  const own = trimMerchant(withoutAmount);
  if (own) return own;

  for (let i = anchor.index - 1; i >= 0; i -= 1) {
    const candidate = kept[i];
    if (AMOUNT_RE.test(candidate)) continue;
    if (isMetaLine(candidate, reference)) continue;
    const text = trimMerchant(candidate);
    if (text) return text;
  }
  return '';
}

function trimMerchant(text) {
  return text.replace(TRAILING_DECOR, '').trim();
}

/**
 * Detail lines that are never a merchant: "Sunday — iPhone", "m-park.example.ca",
 * "Lakeview, ON", "3 hours ago", and anything that reads as a date.
 */
function isMetaLine(line, reference) {
  if (line.includes('—') || line.includes('–')) return true;
  if (!/\s/.test(line) && line.includes('.')) return true;
  if (CITY_PROVINCE_RE.test(line)) return true;
  if (readDateFromLine(line, reference)) return true;
  return false;
}

/* ------------------------------------------------------------------------- *
 * Dates
 * ------------------------------------------------------------------------- */

/**
 * The first date below an amount line, as far as the next amount line; failing
 * that, the first date above it, back to the previous amount line.
 */
function readDate(kept, anchors, index, reference) {
  const anchor = anchors[index];
  const stopBelow = index + 1 < anchors.length ? anchors[index + 1].index : kept.length;
  for (let i = anchor.index + 1; i < stopBelow; i += 1) {
    const found = readDateFromLine(kept[i], reference);
    if (found) return found;
  }

  const stopAbove = index > 0 ? anchors[index - 1].index : -1;
  for (let i = anchor.index - 1; i > stopAbove; i -= 1) {
    const found = readDateFromLine(kept[i], reference);
    if (found) return found;
  }
  return null;
}

/**
 * Read one line as a date: "3 hours ago", "2 days ago", "today", "Yesterday",
 * "Sunday", "Sep 12". Returns the day and the exact words it came from, or null.
 * When a line holds more than one date phrase the earliest one wins.
 */
function readDateFromLine(text, reference) {
  const found = [];
  let match;

  if ((match = RELATIVE_RE.exec(text))) {
    const back = match[2].toLowerCase().startsWith('day') ? Number(match[1]) : 0;
    found.push({ at: match.index, source: match[0], day: addDays(reference, -back) });
  }
  if ((match = TODAY_RE.exec(text))) {
    found.push({ at: match.index, source: match[0], day: addDays(reference, 0) });
  }
  if ((match = YESTERDAY_RE.exec(text))) {
    found.push({ at: match.index, source: match[0], day: addDays(reference, -1) });
  }
  if ((match = WEEKDAY_RE.exec(text))) {
    const weekday = WEEKDAYS[match[1].toLowerCase()];
    if (weekday !== undefined) {
      // The most recent such weekday, counting today.
      const back = (reference.dow - weekday + 7) % 7;
      found.push({
        at: match.index,
        source: match[0].replace(/\.$/, ''),
        day: addDays(reference, -back),
      });
    }
  }
  if ((match = MONTH_DAY_RE.exec(text))) {
    const month = MONTHS[match[1].toLowerCase()];
    const dayNumber = Number(match[2]);
    if (month && dayNumber >= 1 && dayNumber <= 31) {
      let day = dayOfNumbers(reference.year, month, dayNumber);
      // "Sep 12" is this year, or last year when this year's date is still ahead.
      if (compareDays(day, reference) > 0) day = dayOfNumbers(reference.year - 1, month, dayNumber);
      found.push({ at: match.index, source: match[0], day });
    }
  }

  if (found.length === 0) return null;
  found.sort((x, y) => (x.at - y.at) || (y.source.length - x.source.length));
  return { day: found[0].day, source: found[0].source };
}

/** The reference date's local calendar day. */
function dayOf(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError('parseTransactions: referenceDate must be a valid Date');
  }
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    dow: date.getDay(),
  };
}

function dayOfNumbers(year, month, day) {
  const date = new Date(year, month - 1, day);
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    dow: date.getDay(),
  };
}

/** Whole calendar days step; local dates roll months and years over themselves. */
function addDays(day, delta) {
  const date = new Date(day.year, day.month - 1, day.day + delta);
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    dow: date.getDay(),
  };
}

function compareDays(a, b) {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

function formatDay(day) {
  return `${String(day.year).padStart(4, '0')}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------------- *
 * Currency
 * ------------------------------------------------------------------------- */

function currencyForSymbol(symbol, dollarCurrency) {
  if (symbol === '$') return dollarCurrency;
  return CURRENCY_BY_SYMBOL[symbol] || dollarCurrency;
}

function normaliseCurrency(code) {
  if (typeof code !== 'string') return '';
  const upper = code.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(upper) ? upper : '';
}

/** "en-CA-u-hc-h12@..." -> "CA"; "en" -> "". */
function regionOf(locale) {
  if (!locale) return '';
  const tag = String(locale).split('@')[0].split('-u-')[0].split('-U-')[0].split('_').join('-');
  const match = /-([A-Za-z]{2})$/.exec(tag);
  return match ? match[1].toUpperCase() : '';
}
