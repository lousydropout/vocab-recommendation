// API Type Definitions

export interface EssayResponse {
  essay_id: string;
  status: "awaiting_processing" | "processing" | "processed";
  file_key?: string;
  presigned_url?: string;
  expires_in?: number;
  metrics?: {
    word_count: number;
    unique_words: number;
    type_token_ratio: number;
    noun_ratio?: number;
    verb_ratio?: number;
    adj_ratio?: number;
    adv_ratio?: number;
    avg_word_freq_rank?: number;
  };
  feedback?: Array<{
    word: string;
    correct: boolean;
    comment: string;
  }>;
  created_at?: string;
  updated_at?: string;
}

export interface ClassMetricsResponse {
  assignment_id: string;
  stats: {
    avg_ttr: number;
    avg_freq_rank: number;
    correctness: {
      correct: number;
      incorrect: number;
    };
    essay_count: number;
  };
  updated_at: string;
}

export interface StudentMetricsResponse {
  student_id: string;
  stats: {
    avg_ttr: number;
    avg_word_count: number;
    avg_unique_words: number;
    avg_freq_rank: number;
    total_essays: number;
    trend: 'improving' | 'stable' | 'declining' | null;
    last_essay_date?: string;
  };
  updated_at: string;
}

export interface StudentEssayResponse {
  essay_id: string;
  assignment_id?: string;
  created_at: string;
  metrics: {
    type_token_ratio: number;
    word_count: number;
    avg_word_freq_rank?: number;
  };
}

export interface EssayOverrideRequest {
  feedback: Array<{
    word: string;
    correct: boolean;
    comment: string;
  }>;
}

export interface EssayOverrideResponse {
  essay_id: string;
  message: string;
}

export interface AssignmentResponse {
  teacher_id: string;
  assignment_id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface AssignmentCreate {
  name: string;
  description?: string;
}

export interface StudentResponse {
  teacher_id: string;
  student_id: string;
  name: string;
  grade_level?: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface StudentCreate {
  name: string;
  grade_level?: number;
  notes?: string;
}

