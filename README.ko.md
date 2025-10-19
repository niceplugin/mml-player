# mml-player

“music make language”(MML) 문자열을 해석해 Web Audio API로 재생하는 TypeScript 라이브러리입니다. 디코딩된 오디오 샘플이 준비됐을 때는 이를 사용하고, 실패하면 사인파로 자동 대체합니다.

## 특징
- 표준 `MML@ ... ;` 문자열을 음표·타이밍·볼륨 정보로 파싱
- URL, `File`, `Blob` 등을 `fetch`로 불러와 악기별 샘플 버퍼 생성
- 주파수가 가장 가까운 샘플을 찾아 자동으로 재생 속도 보정
- 샘플이 없거나 로딩에 실패하면 `OscillatorNode` 사인파로 폴백
- 재생 중인 노드를 추적해 부드러운 페이드 아웃으로 정지

## 설치
모듈이 npm 에 배포된 후 다음과 같이 설치합니다.

```bash
npm install mml-player
```

## 빠른 시작
```ts
import { MML } from 'mml-player'

const player = new MML()

// 샘플 선로딩 (결과는 boolean 또는 boolean[] 반환)
await player.loadSamples([
  { name: 'piano', note: 'C4', path: '/audio/piano-c4.wav' },
  { name: 'piano', note: 'E4', path: '/audio/piano-e4.wav' },
])

// 기본 “music make language” 문자열
const score = 'MML@ T120 O4 V12 L4 cdefgab>c;'

// 악기 이름을 생략하면 사인파로 재생됨
player.play(score, 'piano')
```

대부분의 브라우저에서는 사용자 동작 이후에만 오디오 재생이 허용되므로, 클릭/탭 이벤트 처리 후 `MML` 인스턴스를 만들고 재생을 호출하세요.

## 샘플 로딩
- `player.loadSamples(source)` 는 단일 `AudioFilePath` 혹은 배열을 받습니다.
- 각 항목에는 `name`, `note`, `path` 가 필요합니다.
- 성공 시 `true`, 실패 시 `false` 를 반환하며 런타임에는 자동으로 사인파 폴백이 사용됩니다.
- 샘플은 악기/주파수별로 저장되며, 정확한 음정이 없으면 가장 가까운 주파수를 선택하고 재생 속도를 보정합니다.

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
- `player.stop()`: 모든 활성 노드를 페이드 아웃하며 정지합니다.
- `player.stopped`: 활성 노드가 없으면 `true` 를 반환하는 읽기 전용 getter 입니다.

`playSample` 에 전달할 수 있는 예시는 다음과 같습니다.

```ts
player.playSample(
  {
    name: 'pad',
    note: 'C#5',
    duration: 800, // 밀리초 단위
    volume: 0.6,   // 0~1 선형 볼륨
  },
  {
    contextTime: player.ctx.currentTime,
    delay: 0.25,   // 초 단위
  },
)
```

모든 Web Audio 노드는 내부 마스터 게인을 경유합니다. 인스턴스를 만든 뒤 `player.masterGain` 을 조정하거나 원하는 이펙트 체인에 연결할 수 있습니다.

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
  volume?: number     // 0~1, 청감 보정을 위해 equal-power 게인으로 변환
}
```

`mmlToNote` 는 `T`, `O`, `V`, `L`, `R`, `<`, `>`, `.`, `+`/`-` 조표를 포함한 일반적인 MML 지시어를 지원합니다.
