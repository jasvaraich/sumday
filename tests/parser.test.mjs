/**
 * Node test for the parser — no browser needed:
 *
 *     node --test tests/
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { parseTransactions, dollarCurrencyForLocale, isChromeLine } from '../parser.js';
import {
  REFERENCE_DATE,
  WALLET_LINES,
  SPLIT_LINES,
  EXPECTED_ROWS,
  DATE_CASES,
  CURRENCY_CASES,
} from './fixtures.js';

const CANADA = { dollarCurrency: dollarCurrencyForLocale('en-CA') };

test('reads the real Amex screenshot exactly as the native app did', () => {
  assert.deepEqual(parseTransactions(WALLET_LINES, REFERENCE_DATE, CANADA), EXPECTED_ROWS);
});

test('reads the list when merchant and amount arrive on separate lines', () => {
  assert.deepEqual(parseTransactions(SPLIT_LINES, REFERENCE_DATE, CANADA), EXPECTED_ROWS);
});

test('ignores the status bar and the card branding above the list', () => {
  const rows = parseTransactions(WALLET_LINES, REFERENCE_DATE, CANADA);
  const merchants = rows.map((row) => row.merchant);
  assert.ok(!merchants.some((name) => name.includes('L123')));
  assert.ok(!merchants.some((name) => name.includes('EAA')), 'the misread icon must never be a merchant');
});

test('skips the sixth row half hidden under the search button', () => {
  const rows = parseTransactions(WALLET_LINES, REFERENCE_DATE, CANADA);
  assert.equal(rows.length, 5);
  assert.ok(!rows.some((row) => row.amountCents === 100), '"Riverside Parking $1/" must not become $1.00');
});

test('reads the date grammar', () => {
  for (const testCase of DATE_CASES) {
    const [row] = parseTransactions(['Merchant $5.00 >', testCase.line], REFERENCE_DATE, CANADA);
    assert.equal(row.date, testCase.date, `date for "${testCase.line}"`);
    assert.equal(row.dateSource, testCase.source, `dateSource for "${testCase.line}"`);
  }
});

test('takes the currency from the symbol', () => {
  for (const testCase of CURRENCY_CASES) {
    const [row] = parseTransactions([testCase.line], REFERENCE_DATE, CANADA);
    assert.equal(row.currencyCode, testCase.currencyCode, `currency for "${testCase.line}"`);
    assert.equal(row.amountCents, testCase.amountCents, `amount for "${testCase.line}"`);
  }
});

test('$ follows the locale', () => {
  assert.equal(dollarCurrencyForLocale('en-CA'), 'CAD');
  assert.equal(dollarCurrencyForLocale('fr-CA'), 'CAD');
  assert.equal(dollarCurrencyForLocale('en-CA-u-hc-h12'), 'CAD');
  assert.equal(dollarCurrencyForLocale('en-US'), 'USD');
  assert.equal(dollarCurrencyForLocale('en-GB'), 'USD');
  assert.equal(dollarCurrencyForLocale(''), 'USD');
});

test('drops chrome lines', () => {
  for (const line of ['Latest Transactions', 'AMERICAN EXPRESS', '••. 4821', '© AMEX', '12:04', 'www.harbourtickets.example', '423']) {
    assert.ok(isChromeLine(line), `"${line}" is chrome`);
  }
  assert.ok(!isChromeLine('Harbour Tickets $24.50 >'));
  assert.ok(!isChromeLine('Lakeview, ON'));
});
