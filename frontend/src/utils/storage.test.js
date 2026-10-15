/** @module storage-tests Real storage state and injected browser/JSON fault coverage. */
import { describe, expect, it, vi } from 'vitest';
import { getPosts, savePosts, getUsers, saveUsers, readValue, writeValue, removeValue } from './storage';

/** Throw a synthetic boundary error without sensitive data. */
function fail() {
  throw new Error('synthetic failure');
}

/** Verify post and user list contracts with identical boundary cases. */
describe.each([
  ['writespace_posts', getPosts, savePosts],
  ['writespace_users', getUsers, saveUsers],
])('%s list boundary', (key, get, save) => {
  /** Missing and invalid JSON values fail empty without repair. */
  it.each([null, '{broken', '{}', 'null', '"text"', '42'])('reads %s as empty without modifying it', (raw) => {
    if (raw !== null) window.localStorage.setItem(key, raw);
    expect(get()).toEqual([]);
    expect(window.localStorage.getItem(key)).toBe(raw);
  });

  /** Arbitrary valid array records remain intact after round trip and later overwrite. */
  it('preserves valid arrays and re-reads successful replacements', () => {
    const records = [{ id: 'one', extra: { value: '<script>' } }, null, 3, 'text'];
    expect(save(records)).toEqual({ ok: true });
    expect(get()).toEqual(records);
    expect(save([{ id: 'two' }])).toEqual({ ok: true });
    expect(get()).toEqual([{ id: 'two' }]);
    expect(save([])).toEqual({ ok: true });
    expect(get()).toEqual([]);
  });

  /** Reject non-array inputs and preserve prior state. */
  it.each([null, undefined, {}, 'text', 3])('rejects non-array %s without losing saved records', (value) => {
    save([{ id: 'kept' }]);
    expect(save(value).ok).toBe(false);
    expect(get()).toEqual([{ id: 'kept' }]);
  });

  /** Storage retrieval failures cannot escape a list getter. */
  it('catches getItem and JSON.parse failures', () => {
    window.localStorage.setItem(key, '[]');
    const parser = vi.spyOn(JSON, 'parse').mockImplementation(fail);
    expect(get()).toEqual([]);
    parser.mockRestore();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(fail);
    expect(get()).toEqual([]);
  });

  /** Quota and cyclic serialization failures return explicit failure and retain old state. */
  it('catches setter and serialization failures without replacing records', () => {
    save([{ id: 'kept' }]);
    const setter = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(fail);
    expect(save([{ id: 'lost' }]).ok).toBe(false);
    expect(get()).toEqual([{ id: 'kept' }]);
    setter.mockRestore();
    const cyclic = [];
    cyclic.push(cyclic);
    expect(save(cyclic).ok).toBe(false);
    expect(get()).toEqual([{ id: 'kept' }]);
    vi.spyOn(JSON, 'stringify').mockImplementation(fail);
    expect(save([]).ok).toBe(false);
  });

  /** Accessing the localStorage property itself can fail in restricted browsers. */
  it('catches storage property getter failure for reads and writes', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(fail);
    expect(get()).toEqual([]);
    expect(save([]).ok).toBe(false);
  });

  /** Even hostile array proxies cannot escape a setter. */
  it('catches revoked array-proxy checks', () => {
    const { proxy, revoke } = Proxy.revocable([], {});
    revoke();
    expect(save(proxy).ok).toBe(false);
  });

  /** A hostile parser replacement must not escape the getter's array validation. */
  it('contains exceptions from array validation after a parser returns a revoked proxy', () => {
    window.localStorage.setItem(key, '[]');
    const { proxy, revoke } = Proxy.revocable([], {});
    revoke();
    vi.spyOn(JSON, 'parse').mockReturnValue(proxy);
    expect(get()).toEqual([]);
  });
});

/** Verify the generic boundary reserved for later session handling. */
describe('generic JSON values', () => {
  /** Objects persist and can be explicitly removed. */
  it('round trips a session object and removes it with state re-read', () => {
    const session = { role: 'user', userId: 'local' };
    expect(writeValue('writespace_session', session)).toEqual({ ok: true });
    expect(readValue('writespace_session')).toEqual(session);
    expect(removeValue('writespace_session')).toEqual({ ok: true });
    expect(readValue('writespace_session')).toBeNull();
  });

  /** Callers select fallback while valid primitive values are preserved. */
  it('supports custom fallbacks and valid JSON primitives', () => {
    expect(readValue('missing', 'fallback')).toBe('fallback');
    for (const value of [null, false, 0, '']) {
      expect(writeValue('key', value).ok).toBe(true);
      expect(readValue('key', 'fallback')).toBe(value);
    }
    window.localStorage.setItem('key', '{broken');
    expect(readValue('key', 'fallback')).toBe('fallback');
  });

  /** Undefined serialization must not persist the literal string undefined. */
  it.each([undefined, () => {}, Symbol('value')])('rejects unserializable root %s', (value) => {
    writeValue('key', 'kept');
    expect(writeValue('key', value).ok).toBe(false);
    expect(readValue('key')).toBe('kept');
  });

  /** Remove failure retains stored state and returns a generic error. */
  it('catches removeItem failure and storage getter failure', () => {
    writeValue('key', 'kept');
    const remover = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(fail);
    expect(removeValue('key').ok).toBe(false);
    expect(readValue('key')).toBe('kept');
    remover.mockRestore();
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(fail);
    expect(removeValue('key').ok).toBe(false);
    expect(readValue('key')).toBeNull();
    expect(writeValue('key', []).ok).toBe(false);
  });

  /** Hostile toJSON execution is contained in the serialization boundary. */
  it('catches throwing toJSON and BigInt serialization', () => {
    expect(writeValue('key', { toJSON: fail }).ok).toBe(false);
    expect(writeValue('key', 1n).ok).toBe(false);
    expect(window.localStorage.getItem('key')).toBeNull();
  });
});
