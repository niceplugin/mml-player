export type InstrumentName = string
export type FrequencyHz = number
export type AudioBufferStore = Record<InstrumentName, Record<FrequencyHz, AudioBuffer>>

export type AudioFilePath = {
  name: InstrumentName
  note: string
  path: string
}
