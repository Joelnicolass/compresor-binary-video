/**
 * Lee bits de un Buffer sin asumir límites de byte (cruza bytes).
 * Usado para extraer valores de 3 en 3 bits para la paleta Base-8.
 */
export class BitReader {
  constructor(buffer) {
    this.buffer = buffer;
    this.bitPos = 0;
    this.totalBits = buffer.length * 8;
  }

  /**
   * Lee los siguientes `bits` (1–8). Devuelve null si no quedan bits.
   */
  read(bits) {
    if (this.bitPos >= this.totalBits) return null;

    let value = 0;
    for (let i = 0; i < bits; i++) {
      if (this.bitPos >= this.totalBits) {
        value = value << 1;
      } else {
        const byteIdx = Math.floor(this.bitPos / 8);
        const bitIdx = 7 - (this.bitPos % 8);
        const bit = (this.buffer[byteIdx] >> bitIdx) & 1;
        value = (value << 1) | bit;
        this.bitPos++;
      }
    }
    return value;
  }
}
