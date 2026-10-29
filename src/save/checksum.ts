/**
 * CRC-32 (IEEE 802.3). It catches truncated or damaged saves; it is not meant to stop cheating.
 * Written by hand because `crypto` is banned in pure layers and the algorithm is tiny.
 */
const CRC32_POLYNOMIAL = 0xedb8_8320;
const BYTE_VALUES = 256;
const BITS_PER_BYTE = 8;
const BYTE_MASK = 0xff;
const HEX_RADIX = 16;
const CHECKSUM_HEX_LENGTH = 8;

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(BYTE_VALUES);
  for (let byte = 0; byte < BYTE_VALUES; byte += 1) {
    let crc = byte;
    for (let bit = 0; bit < BITS_PER_BYTE; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ CRC32_POLYNOMIAL : crc >>> 1;
    }
    table[byte] = crc >>> 0;
  }
  return table;
}

const CRC_TABLE = buildCrcTable();

function updateCrc(crc: number, byte: number): number {
  // The index is masked to 0..255, so the table always has an entry for it.
  return (CRC_TABLE[(crc ^ byte) & BYTE_MASK] ?? 0) ^ (crc >>> BITS_PER_BYTE);
}

/** Checksum of a string, fed as UTF-16 code units (low byte first), as 8 lowercase hex digits. */
export function checksum(text: string): string {
  let crc = 0xffff_ffff;
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    crc = updateCrc(crc, unit & BYTE_MASK);
    crc = updateCrc(crc, unit >>> BITS_PER_BYTE);
  }
  return ((crc ^ 0xffff_ffff) >>> 0).toString(HEX_RADIX).padStart(CHECKSUM_HEX_LENGTH, '0');
}
