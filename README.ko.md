# mml-player

“music make language”(MML) 문자열을 해석해 Web Audio API 타임라인에 스케줄링하는 TypeScript 라이브러리입니다. 디코딩된 오디오 샘플이 준비돼 있으면 이를 사용하고, 준비되지 않았을 때는 자동으로 사인파를 합성합니다.

## 특징
- `MML@ … ;` 형식의 스코어를 (템포, 옥타브, 볼륨, 기본 길이, 점음표, 쉼표 포함) 악기별 트랙으로 파싱
- 콤마(`,`)로 구분된 다중 오선지 지원: 모든 트랙은 동일한 시작 시간을 공유하면서 각자 타이밍을 유지
- URL, `File`, `Blob`을 `fetch`로 불러와 악기/주파수별 `AudioBuffer`를 관리
- 가장 가까운 주파수의 샘플을 찾아 재생 속도를 보정하거나, 샘플이 없으면 사인파로 대체
- 모든 소스/게인 쌍을 추적해 `stop()` 호출 시 안정적인 페이드 아웃과 `stopped` 상태 확인
- `mmlToWavUrl`로 스코어를 오프라인 렌더링해 다운로드 가능한 WAV `ObjectURL` 생성

## 설치
npm 에 게시된 뒤 다음과 같이 설치할 수 있습니다.

```bash
npm install mml-player
```

## 빠른 시작
```ts
import { MML } from 'mml-player'

const player = new MML()

// 샘플을 선로딩합니다 (결과는 boolean 또는 boolean[]).
await player.loadSamples([
  { name: 'piano', note: 'C4', path: '/audio/piano-c4.wav' },
  { name: 'piano', note: 'E4', path: '/audio/piano-e4.wav' },
])

// 기본 “music make language” 문자열
const score = 'MML@ T120 O4 V12 L4 cdefgab>c;'

// 악기 이름을 전달하면 파싱된 음표에 해당 버퍼가 연결됩니다.
player.play(score, 'piano')
```

대부분의 브라우저는 사용자 제스처 이후에만 오디오 재생을 허용합니다. 클릭/탭 핸들러 안에서 `MML` 인스턴스를 만들거나 컨텍스트를 재개하세요.

## MML 문자열 다루기
- 스코어는 `MML@` 로 시작하고 `;` 로 끝나야 합니다.
- 동시에 재생할 오선지는 콤마로 구분합니다: `MML@ T96 cdef, O3 V10 g4e4c4;`.
- `T`, `O`, `V`, `L` 지시어는 변경될 때까지 유지됩니다.
- `+`/`-` 로 올림/내림을 표시하고, `.` 은 점음표, `R` 은 쉼표, `<`/`>` 는 옥타브 이동을 뜻합니다.
- `N(0~96)` 문법은 지원하지 않습니다.

파서의 반환값은 스태프마다 하나의 트랙이며, 각 항목에는 악기 이름, 해석된 음정, 밀리초 단위의 지속 시간, 정규화된 볼륨 정보가 담깁니다.

## 샘플 로딩
- `player.loadSamples(source)` 는 단일 `AudioFilePath` 또는 배열을 받습니다.
- 각 항목에는 `name`, `note`, `path` 가 필요합니다.
- 성공하면 `true`, 실패하면 `false` 를 반환하며, 재생 시에는 자동으로 사인파 폴백이 사용됩니다.
- 샘플은 악기/주파수별로 저장됩니다. 요청한 음정이 없으면 가장 가까운 주파수를 선택하고 재생 속도를 보정합니다.

```ts
const success = await player.loadSamples({
  name: 'lead',
  note: 'A4',
  path: new URL('./lead-a4.ogg', import.meta.url).href,
})

if (!success) {
  console.warn('샘플을 불러오지 못했습니다. 재생 시 사인파 폴백이 사용됩니다.')
}
```

## 재생 API
- `player.play(mml, instrument?)`: 전체 MML 문자열을 파싱해 스케줄링합니다. REST 토큰은 타이밍만 소비하고 노드를 만들지 않습니다.
- `player.playSample(options, timing?)`: 개별 음표를 직접 스케줄링합니다. 다른 시퀀서와 연동할 때 유용합니다.
- `player.stop()`: 모든 활성 노드를 페이드 아웃한 뒤 정리하고 마스터 게인을 재구성합니다.
- `player.stopped`: 모든 노드가 종료되었는지 알려주는 읽기 전용 getter 입니다.

예시:

```ts
player.playSample(
  {
    name: 'pad',
    note: 'C#5',
    duration: 800, // 밀리초
    volume: 0.6,   // 0~1 선형 볼륨
  },
  {
    contextTime: player.ctx.currentTime,
    delay: 0.25,   // 초 단위 지연
  },
)
```

모든 Web Audio 노드는 내부 마스터 게인을 지나갑니다. 필요하다면 `player.masterGain` 을 조정하거나 후단 이펙트 체인에 연결할 수 있습니다.

## WAV로 내보내기
`mmlToWavUrl` 을 사용하면 동일한 스코어를 OfflineAudioContext 로 렌더링하고, 바로 다운로드 가능한 WAV Blob URL 을 얻을 수 있습니다. 로드된 샘플이 있으면 그대로 사용하고, 없으면 사인파 폴백을 그대로 따릅니다.

```ts
const url = await player.mmlToWavUrl(score, 'piano')

const link = document.createElement('a')
link.href = url
link.download = 'score.wav'
link.click()

URL.revokeObjectURL(url) // 사용이 끝나면 URL 을 해제하세요.
```

생성된 URL 은 더 이상 필요하지 않을 때 `URL.revokeObjectURL` 로 해제해 메모리를 반환하세요.

## 타입
```ts
type AudioFilePath = {
  name: string        // 악기 식별자
  note: string        // 예: "C4", "A#3"
  path: string        // URL 혹은 브라우저에서 접근 가능한 경로
}

type PlayNoteOptions = {
  name: string
  note: string
  duration?: number   // 기본값 1000 ms
  volume?: number     // 0~1 범위, 가청 보정을 위해 equal-power 게인으로 변환
}

type PlaybackTiming = {
  contextTime: number // 캡처한 AudioContext 시간
  delay: number       // 재생 전 대기 시간 (초)
}

type PlayNoteTrack = PlayNoteOptions[]
```

`mmlToNote` 는 `T`, `O`, `V`, `L`, `R`, `<`, `>`, `.`, `+`/`-` 지시어를 지원하며, 여러 트랙을 병렬로 결합해 재생합니다.
