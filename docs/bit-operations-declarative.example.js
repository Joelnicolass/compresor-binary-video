/**
 * =============================================================================
 * VERSIÓN DECLARATIVA DE LAS OPERACIONES DE BITS
 * =============================================================================
 *
 * Este archivo es solo ilustrativo. No se usa en el proyecto.
 * Sirve para explicar la misma lógica que BitReader y bitsToBuffer pero
 * usando nombres claros y operaciones explícitas (sin >>, <<, |, &).
 *
 * Ideas clave:
 * - Un byte tiene 8 bits. Podemos ver cada bit como "encendido" (1) o "apagado" (0).
 * - Leer "de izquierda a derecha" (MSB first) = el primer bit del byte es el más importante.
 * - Escribir bits en un buffer = ir llenando byte a byte, 8 bits por byte.
 * =============================================================================
 */

// -----------------------------------------------------------------------------
// CONSTANTES CON NOMBRE (para no usar "números mágicos")
// -----------------------------------------------------------------------------

const BITS_PER_BYTE = 8;
const PRIMER_BIT_DEL_BYTE = 0;   // posición del bit más significativo (izquierda)
const ULTIMO_BIT_DEL_BYTE = 7;   // posición del bit menos significativo (derecha)

// Valores que puede tener un bit
const BIT_APAGADO = 0;
const BIT_ENCENDIDO = 1;

// Para "¿está encendido el bit en la posición N?" usamos potencias de 2:
// posición 0 -> 128, posición 1 -> 64, ..., posición 7 -> 1
const VALOR_DEL_BIT_POR_POSICION = [128, 64, 32, 16, 8, 4, 2, 1];

// -----------------------------------------------------------------------------
// FUNCIÓN: obtener el valor de un bit dentro de un byte
// -----------------------------------------------------------------------------
// En un byte, los bits se numeran de 0 (más a la izquierda) a 7 (más a la derecha).
// "posiciónDesdeLaIzquierda" debe ser un número entre 0 y 7.
// Devuelve 0 o 1.
//
// Ejemplo: byte = 0b10110010
//   posición 0 -> 1, posición 1 -> 0, posición 2 -> 1, ...
// -----------------------------------------------------------------------------

// Versión sin operadores de bits (solo división y resto), fácil de seguir.
function obtenerBitDelByte(byte, posicionDesdeLaIzquierda) {
  const valorDeEseBit = VALOR_DEL_BIT_POR_POSICION[posicionDesdeLaIzquierda];
  const cuantasVecesCabe = Math.floor(byte / valorDeEseBit);
  const esImpar = (cuantasVecesCabe % 2) === 1;
  return esImpar ? BIT_ENCENDIDO : BIT_APAGADO;
}

// -----------------------------------------------------------------------------
// FUNCIÓN: encender o apagar un bit dentro de un byte
// -----------------------------------------------------------------------------
// Dado un byte y una posición (0-7), devuelve un nuevo byte con ese bit
// puesto a 1 si valorBit es verdadero, o a 0 si no.
// -----------------------------------------------------------------------------

function ponerBitEnByte(byte, posicionDesdeLaIzquierda, valorBit) {
  const valorDeEseBit = VALOR_DEL_BIT_POR_POSICION[posicionDesdeLaIzquierda];
  if (valorBit === BIT_ENCENDIDO || valorBit === true) {
    return byte + valorDeEseBit;  // asumiendo que ese bit estaba en 0
  }
  return byte - valorDeEseBit;    // asumiendo que ese bit estaba en 1
}

// Versión que no asume el estado previo: construye el byte desde cero
// leyendo "qué bits quiero encender" desde un array de 0s y 1s.
function construirByteDesdeBits(bitsDelByte) {
  let byte = 0;
  for (let pos = 0; pos < BITS_PER_BYTE; pos++) {
    if (bitsDelByte[pos] === BIT_ENCENDIDO) {
      byte = byte + VALOR_DEL_BIT_POR_POSICION[pos];
    }
  }
  return byte;
}

// -----------------------------------------------------------------------------
// LECTOR DE BITS DECLARATIVO (equivalente a BitReader)
// -----------------------------------------------------------------------------
// Lee el buffer como una secuencia larga de bits (bit 0, bit 1, bit 2, ...).
// Puede leer de 1 a 8 bits seguidos y devuelve el número que forman.
// Ejemplo: si los siguientes 3 bits son 1, 0, 1 -> devuelve 5 (que es 101 en binario).
// -----------------------------------------------------------------------------

class LectorDeBitsDeclarativo {
  constructor(buffer) {
    this.buffer = buffer;
    this.posicionBitActual = 0;
    this.totalDeBits = buffer.length * BITS_PER_BYTE;
  }

  /**
   * Indica en qué byte estamos (cada 8 bits es un byte).
   */
  indiceDelByteActual() {
    return Math.floor(this.posicionBitActual / BITS_PER_BYTE);
  }

  /**
   * Indica en qué posición dentro del byte estamos (0 = primera, 7 = última).
   */
  posicionDentroDelByte() {
    return this.posicionBitActual % BITS_PER_BYTE;
  }

  /**
   * Lee los siguientes `cuantosBits` bits y los interpreta como un número.
   * Los bits se leen de izquierda a derecha (el primero leído es el más significativo).
   * Devuelve null si ya no quedan bits.
   */
  leer(cuantosBits) {
    if (this.posicionBitActual >= this.totalDeBits) {
      return null;
    }

    let valor = 0;

    for (let i = 0; i < cuantosBits; i++) {
      if (this.posicionBitActual >= this.totalDeBits) {
        // Ya no hay más datos: rellenamos con cero (multiplicar por 2 es como "dejar espacio")
        valor = valor * 2;
      } else {
        const indiceByte = this.indiceDelByteActual();
        const posicionEnByte = this.posicionDentroDelByte();
        const byteActual = this.buffer[indiceByte];
        const bit = obtenerBitDelByte(byteActual, posicionEnByte);

        // "Hacer hueco" a la derecha y sumar el nuevo bit (equivalente a << 1 y | bit).
        valor = valor * 2 + bit;

        this.posicionBitActual = this.posicionBitActual + 1;
      }
    }

    return valor;
  }
}

// -----------------------------------------------------------------------------
// ESCRITURA DE BITS EN UN BUFFER (equivalente a bitsToBuffer)
// -----------------------------------------------------------------------------
// Dado un array de bits [0, 1, 1, 0, 1, ...], construye un Buffer donde
// cada 8 bits forman un byte. Orden: MSB first (los primeros 8 bits del array
// forman el primer byte, etc.).
// -----------------------------------------------------------------------------

function convertirBitsEnBufferDeclarativo(arrayDeBits) {
  const cuantosBytes = Math.ceil(arrayDeBits.length / BITS_PER_BYTE);
  const buffer = Buffer.alloc(cuantosBytes);

  for (let indiceBit = 0; indiceBit < arrayDeBits.length; indiceBit++) {
    const bitActual = arrayDeBits[indiceBit];
    if (bitActual !== BIT_ENCENDIDO && bitActual !== 1) continue;

    const indiceByte = Math.floor(indiceBit / BITS_PER_BYTE);
    const posicionDentroDelByte = indiceBit % BITS_PER_BYTE;
    const valorDeEseBit = VALOR_DEL_BIT_POR_POSICION[posicionDentroDelByte];

    // Sumar ese valor al byte correspondiente (equivale a "encender" el bit).
    buffer[indiceByte] = buffer[indiceByte] + valorDeEseBit;
  }

  return buffer;
}

// -----------------------------------------------------------------------------
// EXTRAER LOS 3 BITS DE UN ÍNDICE DE PALETA (0-7) COMO ARRAY
// -----------------------------------------------------------------------------
// El decoder obtiene un número del 0 al 7 (índice de color) y debe
// convertirlo de nuevo en 3 bits para reconstruir el archivo.
// Ejemplo: indice 5 -> binario 101 -> [1, 0, 1].
// -----------------------------------------------------------------------------

function indiceDePaletaATresBits(indice) {
  const bitMasSignificativo = Math.floor(indice / 4) % 2;  // 0-7 -> 0 o 1
  const bitDelMedio = Math.floor(indice / 2) % 2;
  const bitMenosSignificativo = indice % 2;
  return [bitMasSignificativo, bitDelMedio, bitMenosSignificativo];
}

// -----------------------------------------------------------------------------
// EJEMPLO DE USO (ilustrativo)
// -----------------------------------------------------------------------------
// Mostramos cómo se leerían 3 bits de un buffer y cómo se escribirían
// de nuevo en un array de bits, sin usar operadores de bits en el flujo principal.
// -----------------------------------------------------------------------------

function ejemploCompleto() {
  // Buffer de ejemplo: 2 bytes. [0b10110010, 0b11000101]
  const bufferOriginal = Buffer.from([0b10110010, 0b11000101]);

  console.log('--- Lector de bits (declarativo) ---');
  const lector = new LectorDeBitsDeclarativo(bufferOriginal);

  // Leer los primeros 3 bits: 1, 0, 1 -> valor 5
  const valor1 = lector.leer(3);
  console.log('Primeros 3 bits como número:', valor1);  // 5

  // Siguientes 3 bits: 1, 0, 0 -> valor 4
  const valor2 = lector.leer(3);
  console.log('Siguientes 3 bits como número:', valor2);  // 4

  // Siguientes 3 bits: 1, 0, 1 -> valor 5
  const valor3 = lector.leer(3);
  console.log('Siguientes 3 bits como número:', valor3);  // 5

  console.log('\n--- Escritura de bits (declarativo) ---');
  const bitsParaEscribir = [1, 0, 1, 1, 0, 0, 0, 1, 0];  // 9 bits
  const bufferReconstruido = convertirBitsEnBufferDeclarativo(bitsParaEscribir);
  console.log('Array de bits convertido a buffer:', bufferReconstruido);
  console.log('Primer byte (decimal):', bufferReconstruido[0]);
  console.log('Segundo byte (decimal):', bufferReconstruido[1]);

  console.log('\n--- Índice de paleta a 3 bits ---');
  for (let i = 0; i <= 7; i++) {
    const tresBits = indiceDePaletaATresBits(i);
    console.log(`Índice ${i} -> bits [${tresBits.join(', ')}]`);
  }
}

// Ejecutar solo este archivo: node docs/bit-operations-declarative.example.js
if (process.argv[1]?.endsWith('bit-operations-declarative.example.js')) {
  ejemploCompleto();
}

export {
  BITS_PER_BYTE,
  obtenerBitDelByte,
  ponerBitEnByte,
  construirByteDesdeBits,
  LectorDeBitsDeclarativo,
  convertirBitsEnBufferDeclarativo,
  indiceDePaletaATresBits,
  ejemploCompleto,
};
