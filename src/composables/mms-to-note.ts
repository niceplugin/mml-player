import { InstrumentName, PlayNoteOptions, PlayNoteTrack } from '../types'

const MML_PREFIX = 'MML@'
const MML_SUFFIX = ';'
const MIN_TEMPO = 40
const MAX_TEMPO = 200
const MIN_OCTAVE = 1
const MAX_OCTAVE = 7
const MIN_VOLUME = 0
const MAX_VOLUME = 15
const MIN_LENGTH = 1
const MAX_LENGTH = 64
const DEFAULT_TEMPO = 120
const DEFAULT_OCTAVE = 4
const DEFAULT_VOLUME = 12
const DEFAULT_LENGTH = 4

/**
 * MML(Music Macro Language) 문자열을 파싱해 재생 가능한 옵션 목록으로 변환한다.
 *
 * @param mml MML 전체 문자열
 * @param name 파싱 결과에 적용할 악기 이름
 * @returns 파싱된 재생 옵션 목록
 * @throws {Error} 포맷이 올바르지 않은 경우
 */
export function mmlToNote(mml: string, name: InstrumentName): PlayNoteTrack[] {
  if (typeof mml !== 'string') {
    throw new TypeError('contents는 문자열이어야 합니다.')
  }

  const trimmed = mml.trim()

  if (trimmed.length === 0) {
    return []
  }

  const upperCased = trimmed.toUpperCase()

  if (!upperCased.startsWith(MML_PREFIX)) {
    throw new Error('MML 문자열은 "MML@"로 시작해야 합니다.')
  }

  if (!upperCased.endsWith(MML_SUFFIX)) {
    throw new Error('MML 문자열은 ";"로 끝나야 합니다.')
  }

  const body = upperCased.slice(MML_PREFIX.length, -MML_SUFFIX.length)
  const staffs = body.split(',').map((line) => line.trim()).filter((line) => line.length > 0)
  const parsedNotes: PlayNoteTrack[] = []

  staffs.forEach((line) => {
    const notesForLine = parseLine(line, name)
    if (notesForLine.length > 0) {
      parsedNotes.push(notesForLine)
    }
  })

  return parsedNotes
}

/**
 * 단일 오선지 라인을 파싱해 재생 가능한 음표 목록으로 변환한다.
 *
 * @param line 가공 대상 MML 라인
 * @param name 파싱 결과에 적용할 악기 이름
 * @returns 해당 라인의 음표 옵션 배열
 */
function parseLine(line: string, name: InstrumentName): PlayNoteTrack {
  const results: PlayNoteTrack = []
  let tempo = DEFAULT_TEMPO
  let octave = DEFAULT_OCTAVE
  let volume = DEFAULT_VOLUME
  let defaultLength = DEFAULT_LENGTH
  let cursor = 0

  while (cursor < line.length) {
    const token = line[cursor]

    if (token === ' ' || token === '\t' || token === '\n') {
      // 공백은 무시하고 다음 문자로 진행한다.
      cursor += 1
      continue
    }

    if (token === 'T') {
      const { value, nextIndex } = readNumber(line, cursor + 1)
      tempo = clampNumber(value ?? DEFAULT_TEMPO, MIN_TEMPO, MAX_TEMPO)
      cursor = nextIndex
      continue
    }

    if (token === 'O') {
      const { value, nextIndex } = readNumber(line, cursor + 1)
      octave = clampNumber(value ?? DEFAULT_OCTAVE, MIN_OCTAVE, MAX_OCTAVE)
      cursor = nextIndex
      continue
    }

    if (token === 'V') {
      const { value, nextIndex } = readNumber(line, cursor + 1)
      volume = clampNumber(value ?? DEFAULT_VOLUME, MIN_VOLUME, MAX_VOLUME)
      cursor = nextIndex
      continue
    }

    if (token === 'L') {
      const { value, nextIndex } = readNumber(line, cursor + 1)
      defaultLength = clampNumber(value ?? DEFAULT_LENGTH, MIN_LENGTH, MAX_LENGTH)
      cursor = nextIndex
      continue
    }

    if (token === '>') {
      octave = clampNumber(octave + 1, MIN_OCTAVE, MAX_OCTAVE)
      cursor += 1
      continue
    }

    if (token === '<') {
      octave = clampNumber(octave - 1, MIN_OCTAVE, MAX_OCTAVE)
      cursor += 1
      continue
    }

    if (isNoteToken(token)) {
      // 음표/쉼표 토큰을 실제 재생 옵션으로 변환한다.
      const parsed = parseNote(line, cursor, {
        octave,
        defaultLength,
        tempo,
        volume,
      })
      cursor = parsed.nextIndex

      if (parsed.note) {
        results.push({
          name,
          note: parsed.note,
          duration: parsed.duration,
          volume: parsed.volume,
        })
      }

      continue
    }

    // 지원하지 않는 토큰은 스킵하여 나머지 파싱을 계속한다.
    cursor += 1
  }

  return results
}

/**
 * 개별 음표 또는 쉼표 토큰을 파싱한다.
 *
 * @param source 현재 라인 문자열
 * @param startIndex 토큰 시작 위치
 * @param context 기본 설정 컨텍스트
 * @returns 파싱된 음표 옵션과 다음 읽기 위치
 */
function parseNote(
  source: string,
  startIndex: number,
  context: {
    octave: number
    defaultLength: number
    tempo: number
    volume: number
  },
): {
  note: string | null
  duration: number
  volume: number
  nextIndex: number
} {
  const {
    octave,
    defaultLength,
    tempo,
    volume,
  } = context
  let cursor = startIndex
  const letter = source[cursor]
  cursor += 1

  if (letter === 'R') {
    const figure = readLength(source, cursor)
    cursor = figure.nextIndex
    const dotted = readDot(source, cursor)
    cursor = dotted.nextIndex
    const lengthValue = figure.length ?? defaultLength
    const duration = computeDuration(tempo, lengthValue, dotted.isDotted)

    return {
      note: 'REST',
      // 쉼표도 타이밍 유지를 위해 duration을 반환한다.
      duration,
      volume: convertVolume(volume),
      nextIndex: cursor,
    }
  }

  let accidental = ''
  if (cursor < source.length) {
    const sign = source[cursor]
    if (sign === '+') {
      accidental = '#'
      cursor += 1
    }
    else if (sign === '-') {
      accidental = 'B'
      cursor += 1
    }
  }

  const figure = readLength(source, cursor)
  cursor = figure.nextIndex
  const dotted = readDot(source, cursor)
  cursor = dotted.nextIndex

  const lengthValue = figure.length ?? defaultLength
  const duration = computeDuration(tempo, lengthValue, dotted.isDotted)
  const noteName = `${ letter }${ accidental }${ octave }`

  return {
    // note 문자열은 외부 컨텍스트에서 지정한 악기 이름과 함께 사용된다.
    note: noteName,
    duration,
    volume: convertVolume(volume),
    nextIndex: cursor,
  }
}

/**
 * 연속된 숫자 토큰을 읽어 정수로 반환한다.
 *
 * @param source 검색 대상 문자열
 * @param startIndex 숫자 시작 예상 위치
 * @returns 읽은 숫자와 다음 인덱스
 */
function readNumber(source: string, startIndex: number): { value: number | null; nextIndex: number } {
  let cursor = startIndex
  let buffer = ''

  while (cursor < source.length) {
    const char = source[cursor]
    if (char < '0' || char > '9') {
      break
    }
    buffer += char
    cursor += 1
  }

  if (buffer.length === 0) {
    return {
      value: null,
      nextIndex: cursor,
    }
  }

  const parsed = Number.parseInt(buffer, 10)

  return {
    value: Number.isNaN(parsed) ? null : parsed,
    nextIndex: cursor,
  }
}

/**
 * 길이(L) 정보를 읽어 제한 범위 내 숫자로 반환한다.
 *
 * @param source 검색 대상 문자열
 * @param startIndex 길이 시작 위치
 * @returns 길이 값과 다음 인덱스
 */
function readLength(source: string, startIndex: number): { length: number | null; nextIndex: number } {
  const { value, nextIndex } = readNumber(source, startIndex)

  if (value === null) {
    return {
      length: null,
      nextIndex,
    }
  }

  return {
    length: clampNumber(value, MIN_LENGTH, MAX_LENGTH),
    nextIndex,
  }
}

/**
 * 점음표 여부를 판별한다.
 *
 * @param source 검색 대상 문자열
 * @param startIndex 점 위치
 * @returns 점음표 여부와 다음 인덱스
 */
function readDot(source: string, startIndex: number): { isDotted: boolean; nextIndex: number } {
  if (source[startIndex] === '.') {
    return {
      isDotted: true,
      nextIndex: startIndex + 1,
    }
  }

  return {
    isDotted: false,
    nextIndex: startIndex,
  }
}

/**
 * 템포와 길이를 기반으로 재생 시간을 ms 단위로 계산한다.
 *
 * @param tempo 박자(분당 박수)
 * @param length 음표 길이(L 값)
 * @param isDotted 점음표 여부
 * @returns 계산된 재생 시간(ms)
 */
function computeDuration(tempo: number, length: number, isDotted: boolean): number {
  const clampedTempo = clampNumber(tempo, MIN_TEMPO, MAX_TEMPO)
  const clampedLength = clampNumber(length, MIN_LENGTH, MAX_LENGTH)
  const beatDurationMs = 60000 / clampedTempo
  const noteBeats = 4 / clampedLength
  let duration = beatDurationMs * noteBeats

  if (isDotted) {
    duration *= 1.5
  }

  return duration
}

/**
 * 숫자를 지정된 범위 내로 클램프한다.
 *
 * @param value 원본 숫자
 * @param min 최소 허용값
 * @param max 최대 허용값
 * @returns 범위 내로 조정된 숫자
 */
function clampNumber(value: number, min: number, max: number): number {
  if (value < min) {
    return min
  }

  if (value > max) {
    return max
  }

  return value
}

/**
 * 입력 문자가 음표 혹은 쉼표 토큰인지 판별한다.
 *
 * @param char 판별 대상 문자
 * @returns 음표/쉼표 여부
 */
function isNoteToken(char: string): boolean {
  return char >= 'A' && char <= 'G' || char === 'R'
}

/**
 * 0~15 볼륨을 0~1 범위로 변환한다.
 *
 * @param volume 원본 볼륨 값
 * @returns AudioContext용 볼륨 값
 */
function convertVolume(volume: number): number {
  const clamped = clampNumber(volume, MIN_VOLUME, MAX_VOLUME)
  if (clamped === 0) {
    return 0
  }

  return clamped / MAX_VOLUME
}
