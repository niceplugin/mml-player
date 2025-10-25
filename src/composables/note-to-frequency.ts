/**
 * 음계 문자열(c4, a#4 등)을 440Hz 기준 12평균율 주파수로 변환한다.
 * 내부 보관 시 note 문자열 대신 Hz 숫자를 사용한다.
 *
 * @param {string} note 음계 문자열
 * @returns {number} 변환된 주파수(Hz)
 * @throws {Error} 음계 포맷 또는 옥타브 파싱 실패
 */
export function noteToFrequency(note: string): number {
  const normalized = note.trim().toLowerCase()
  const match = normalized.match(/^([a-g])([#b]?)(\d+)$/)

  // 음계 포맷이 올바른지 확인한다.
  if (!match) {
    throw new Error(`지원하지 않는 음정 포맷입니다: ${ note }`)
  }

  const [ , letter, accidental, octaveText ] = match
  const semitoneMap: Record<string, number> = {
    c: 0,
    d: 2,
    e: 4,
    f: 5,
    g: 7,
    a: 9,
    b: 11,
  }

  const octave = Number.parseInt(octaveText, 10)
  // 옥타브 정보가 숫자인지 확인한다.
  if (Number.isNaN(octave)) {
    throw new Error(`옥타브 정보를 파싱할 수 없습니다: ${ note }`)
  }

  let semitoneOffset = semitoneMap[letter]

  // 음계가 유효한지 확인한다.
  if (semitoneOffset === undefined) {
    throw new Error(`알 수 없는 음계입니다: ${ note }`)
  }

  // 반음 상승 기호면 1을 더한다.
  if (accidental === '#') {
    semitoneOffset += 1
  }
  // 반음 하강 기호면 1을 뺀다.
  else if (accidental === 'b') {
    semitoneOffset -= 1
  }

  const distanceFromC4 = semitoneOffset + (octave - 4) * 12
  const frequency = 440 * Math.pow(2, distanceFromC4 / 12)

  return Math.round(frequency * 100) / 100
}
