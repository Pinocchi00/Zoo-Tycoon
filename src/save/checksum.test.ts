import { describe, expect, it } from 'vitest';
import { checksum } from './checksum';

describe('checksum', () => {
  it('matches CRC-32 of the UTF-16LE bytes (reference values from Node zlib)', () => {
    expect(checksum('123456789')).toBe('a290e877');
    expect(checksum('é🦫')).toBe('a676cbb8');
  });

  it('is eight hex digits, even for the empty string', () => {
    expect(checksum('')).toBe('00000000');
  });

  it('changes when a single character changes', () => {
    expect(checksum('{"coins":100}')).not.toBe(checksum('{"coins":900}'));
  });
});
