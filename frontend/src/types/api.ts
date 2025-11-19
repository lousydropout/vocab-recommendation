// API Type Definitions

export interface VocabularyAnalysis {
  correctness_review: string;
  vocabulary_used: string[];
  recommended_vocabulary: string[];
}

export interface EssayResponse {
  essay_id: string;
  assignment_id: string;
  student_id: string;
  status: "pending" | "processed";
  essay_text?: string;
  vocabulary_analysis?: VocabularyAnalysis;
  created_at: string;
  processed_at?: string;
}

export interface EssayItem {
  filename: string;
  text: string;
}

export interface BatchEssayRequest {
  assignment_id: string;
  student_id?: string;
  essays: EssayItem[];
}

export interface BatchEssayResponse {
  essay_id: string;
  status: string;
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
  // Backend returns vocabulary_analysis as metrics for backward compatibility
  metrics: VocabularyAnalysis;
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

