/** @module presentation-tests Ordering, UTC formatting and safe primitive display. */
import { describe, expect, it } from 'vitest';
import { newestFirst, formatDate, resolveAuthorRole, safeText } from './presentation';

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

/** Verify display roles use exact author IDs and current users, never display names. */
describe('resolveAuthorRole', () => {
  /** Fixed admin remains an admin without a corresponding stored account. */
  it.each([[], null, undefined, {}, 'users'])('resolves the fixed admin with users %s', (users) => {
    expect(resolveAuthorRole({ authorId: 'admin', authorName: 'Someone else' }, users)).toBe('Admin');
  });

  /** Created admins resolve via local lowercase roles, without mutating either input. */
  it('resolves a matching created admin from immutable records', () => {
    const post = Object.freeze({ authorId: 'created-admin', authorName: 'Riley' });
    const users = Object.freeze([
      null, 4, [],
      Object.freeze({ id: 'other', role: 'user' }),
      Object.freeze({ id: 'created-admin', role: 'admin' }),
    ]);
    expect(resolveAuthorRole(post, users)).toBe('Admin');
    expect(post).toEqual({ authorId: 'created-admin', authorName: 'Riley' });
    expect(users[4]).toEqual({ id: 'created-admin', role: 'admin' });
  });

  /** Unknown, deleted, malformed and writer authors all keep the non-admin treatment. */
  it.each([
    [{ authorId: 'writer', authorName: 'Admin' }, [{ id: 'writer', role: 'user' }]],
    [{ authorId: 'unknown', authorName: 'Admin' }, [{ id: 'other', role: 'admin' }]],
    [{ authorId: 'deleted', authorName: 'Admin' }, []],
    [{ authorId: 'ADMIN' }, [{ id: 'admin', role: 'admin' }]],
    [{ authorId: 'created-admin' }, [{ id: 'created-admin', role: 'Admin' }]],
    [{ authorId: 'created-admin' }, [{ id: 'created-admin' }]],
    [{ authorId: 'created-admin' }, null],
    [{ authorId: 'created-admin' }, {}],
    [{ authorId: 'created-admin' }, [null, false, 3, [], {}]],
    [{ authorId: 1 }, [{ id: 1, role: 'admin' }]],
    [{ authorId: '1' }, [{ id: 1, role: 'admin' }]],
    [{ authorId: '' }, [{ id: '', role: 'admin' }]],
    [{ authorId: ' ' }, [{ id: ' ', role: 'admin' }]],
    [{ authorName: 'Admin' }, [{ role: 'admin' }]],
    [null, []], [undefined, []], [4, []],
  ])('returns user for unsupported author %j and users %j', (post, users) => {
    expect(resolveAuthorRole(post, users)).toBe('user');
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
