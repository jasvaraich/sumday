/**
 * Test data for the parser, shaped like the Amex card's "Latest Transactions"
 * list as Apple's text recogniser reads it.
 *
 * The merchants, amounts, card digits and place names are invented. The layout
 * and every awkward line are kept (the icon misread, the status bar, the row
 * cut off under the search button), so the tests still cover the same cases.
 * Nothing here is real financial data: this project is published, and its
 * files are served to anyone with the link.
 *
 * Shared by the browser test page (tests.html) and the Node test
 * (tests/parser.test.mjs) so both check the same thing. Plain data only.
 */

/** Midday on Thursday 24 September 2026 — the day the screenshot was taken. */
export const REFERENCE_DATE = new Date(2026, 8, 24, 12, 0, 0);

/** Everything the recogniser produced, top to bottom, in its order. */
export const WALLET_LINES = [
  '1:234 000| 5G+',
  'L123 ...',
  'AMERICAN EXPRESS',
  'Member Since/',
  'Titulaire depuis',
  '••. 4821',
  '© AMEX',
  'Latest Transactions',
  'Harbour Tickets $24.50 >',
  'www.harbourtickets.example',
  '3 hours ago — iPhone',
  'Riverside Parking $13.75 >',
  'm-park.example.ca',
  '4 hours ago — iPhone',
  'Ph 417-02 $17.19 >',
  'EAA',
  'Sunday',
  'Maple Corner Mall $8.90 >',
  'Lakeview, ON',
  'Sunday — iPhone',
  'Lotus Grocery Market $58.04 >',
  'Lakeview, ON',
  'Friday — iPhone',
  'Riverside Parking $1/',
];

/** What the native app read from those lines. */
export const EXPECTED_ROWS = [
  { merchant: 'Harbour Tickets', amountCents: 2450, currencyCode: 'CAD', date: '2026-09-24', dateSource: '3 hours ago' },
  { merchant: 'Riverside Parking', amountCents: 1375, currencyCode: 'CAD', date: '2026-09-24', dateSource: '4 hours ago' },
  { merchant: 'Ph 417-02', amountCents: 1719, currencyCode: 'CAD', date: '2026-09-20', dateSource: 'Sunday' },
  { merchant: 'Maple Corner Mall', amountCents: 890, currencyCode: 'CAD', date: '2026-09-20', dateSource: 'Sunday' },
  { merchant: 'Lotus Grocery Market', amountCents: 5804, currencyCode: 'CAD', date: '2026-09-18', dateSource: 'Friday' },
];

/**
 * Date grammar, one line at a time: each `line` sits below a single amount so
 * the parser has to read that line for the row's date.
 */
export const DATE_CASES = [
  { line: 'Yesterday', date: '2026-09-23', source: 'Yesterday' },
  { line: 'today', date: '2026-09-24', source: 'today' },
  { line: '2 days ago', date: '2026-09-22', source: '2 days ago' },
  { line: '10 minutes ago — iPhone', date: '2026-09-24', source: '10 minutes ago' },
  { line: 'Monday', date: '2026-09-21', source: 'Monday' },
  { line: 'Thursday', date: '2026-09-24', source: 'Thursday' },
  { line: 'Sep 12 — iPhone', date: '2026-09-12', source: 'Sep 12' },
  { line: 'Sep 30', date: '2025-09-30', source: 'Sep 30' },
];

/** Amount symbols, each on a line of its own. */
export const CURRENCY_CASES = [
  { line: 'Café Crème €3.50', currencyCode: 'EUR', amountCents: 350 },
  { line: 'Tea Room £2.10', currencyCode: 'GBP', amountCents: 210 },
  { line: 'Ramen ¥980.00', currencyCode: 'JPY', amountCents: 98000 },
];

/**
 * The same list with the amount column split onto its own lines, as a browser
 * reader may produce it: the merchant, then the amount, with the parser
 * walking upwards for the merchant. Must produce EXPECTED_ROWS all the same.
 */
export const SPLIT_LINES = [
  '1:23',
  '5G+',
  '•••• 4821',
  'AMERICAN EXPRESS',
  'Member Since/',
  'Titulaire depuis',
  '© AMEX',
  'Latest Transactions',
  'Harbour Tickets',
  '$24.50 >',
  'www.harbourtickets.example',
  '3 hours ago — iPhone',
  'Riverside Parking',
  '$13.75 >',
  'm-park.example.ca',
  '4 hours ago — iPhone',
  'Ph 417-02',
  '$17.19 >',
  'Sunday',
  'Maple Corner Mall',
  '$8.90 >',
  'Lakeview, ON',
  'Sunday — iPhone',
  'Lotus Grocery Market',
  '$58.04 >',
  'Lakeview, ON',
  'Friday — iPhone',
  'Riverside Parking',
  '$1',
];
