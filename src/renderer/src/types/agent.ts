export interface QuestionOption {
  text: string
  type?: 'select-all'
}

export interface Question {
  id: string
  type: 'open-ended' | 'multiple-choice'
  text: string
  category: string
  options?: QuestionOption[]
  answered: boolean
  answer?: string
}

export interface DimensionScore {
  dimension: string
  score: number
  suggestion: string
}

export interface CompletenessScore {
  overall: number
  breakdown: DimensionScore[]
}

export interface AgentResponse {
  questions: Omit<Question, 'id' | 'answered'>[]
  completeness: CompletenessScore
}

export interface AgentSession {
  id: string
  timestamp: number
  questions: Question[]
  completeness: CompletenessScore
  pageIndex: number
}
