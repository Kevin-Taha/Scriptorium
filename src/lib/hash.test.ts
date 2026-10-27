import { describe, expect, it } from 'vitest';
import { contentHash } from './hash';

const encode = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

describe('contentHash', () => {
  it('returns the SHA-256 hex digest of the bytes', async () => {
    expect(await contentHash(encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('distinguishes files that differ by a single byte', async () => {
    expect(await contentHash(encode('%PDF-1.7 a'))).not.toBe(await contentHash(encode('%PDF-1.7 b')));
  });
});
