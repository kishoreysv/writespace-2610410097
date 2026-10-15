/** @module presentation-tests Ordering, UTC formatting and safe primitive display. */
import { describe, expect, it } from 'vitest';
import { newestFirst, formatDate, safeText } from './presentation';

/** Verify immutable chronological ordering and stable malformed-date handling. */
describe('newestFirst', () => {
  /** Sort newest first without modifying the source, including ties and invalid records. */
  it('sorts a copy and retains stable equal/invalid date order', () => {
    const old = { id: 'old', createdAt: '2024-01-01' };
    const newer = { id: 'new', createdAt: '2025-01-01' };
    const tie = { id: 'tie', createdAt: '2025-01-01' };
    const invalid = { id: 'invalid', createdAt: 'bad' };
    const source = Object.freeze([old, invalid, newer, tie, null, {}]);
    expect(newestFirst(source)).toEqual([newer, tie, old, invalid, null, {}]);
    expect(source).toEqual([old, invalid, newer, tie, null, {}]);
    expect(newestFirst(source)).not.toBe(source);
  });

  /** Invalid lists and absent/invalid dates degrade safely. */
  it.each([null, undefined, {}, 'posts', 4])('returns empty for non-array %s', (value) => {
    expect(newestFirst(value)).toEqual([]);
  });

  /** Empty and whitespace-only dates retain list order at the end. */
  it('retains empty and malformed list entries', () => {
    expect(newestFirst([])).toEqual([]);
    const source = [{ createdAt: '' }, { createdAt: ' ' }, { createdAt: 5 }, 'text'];
    expect(newestFirst(source)).toEqual(source);
  });
});

/** Verify exact date display independent of local timezone. */
describe('formatDate', () => {
  /** Offset timestamps are normalized to UTC and days are two digits. */
  it('formats dates as English UTC MMM DD, YYYY', () => {
    expect(formatDate('2025-01-02T00:00:00Z')).toBe('Jan 02, 2025');
    expect(formatDate('2025-01-01T23:30:00-02:00')).toBe('Jan 02, 2025');
  });

  /** All unsupported dates use the specified fallback. */
  it.each([undefined, null, '', ' ', 'invalid', {}, 0])('handles invalid date %s', (value) => {
    expect(formatDate(value)).toBe('Unknown date');
  });
});

/** Verify objects never become React children or run coercion methods. */
describe('safeText', () => {
  /** Plain text, including markup characters and empty strings, stays exact. */
  it('preserves strings verbatim', () => {
    expect(safeText('<script>alert(1)</script>')).toBe('<script>alert(1)</script>');
    expect(safeText('')).toBe('');
  });

  /** Missing/invalid text uses either default or supplied fallback. */
  it.each([null, undefined, 42, [], {}, false])('handles non-string %s', (value) => {
    expect(safeText(value)).toBe('');
    expect(safeText(value, 'Unknown')).toBe('Unknown');
  });
});
