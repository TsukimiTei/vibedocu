export type SmartAgentMode = 'off' | 'mark-only' | 'auto-answer'

export interface StyleQARecord {
  question: string
  questionType: 'open-ended' | 'multiple-choice'
  answer: string
  category: string
  timestamp: number
}

export interface StyleProfile {
  styleSummary: string
  typicalExamples: StyleQARecord[]
  totalAnswered: number
  lastUpdated: number
  allRecords: StyleQARecord[]
}

export interface StylePrediction {
  questionId: string
  predictedAnswer: string
  predictedOptionIndex?: number
  confidence: number
}
