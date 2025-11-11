import { getToken } from './auth';
import { config } from '../config';

const API_BASE_URL = config.API_URL;

/**
 * Make an authenticated API request
 */
async function apiRequest(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle 401/403 - token might be expired
  if (response.status === 401 || response.status === 403) {
    // Clear invalid token
    localStorage.removeItem('cognito_id_token');
    throw new Error('Authentication required. Please log in again.');
  }

  return response;
}

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

export async function uploadEssay(essayText: string): Promise<EssayResponse> {
  const response = await apiRequest(`${API_BASE_URL}/essay`, {
    method: "POST",
    body: JSON.stringify({ essay_text: essayText }),
  });

  if (!response.ok) {
    throw new Error(`Failed to upload essay: ${response.statusText}`);
  }

  return response.json();
}

export async function getEssay(essayId: string): Promise<EssayResponse> {
  const response = await apiRequest(`${API_BASE_URL}/essay/${essayId}`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Essay not found");
    }
    throw new Error(`Failed to fetch essay: ${response.statusText}`);
  }

  return response.json();
}

export async function checkHealth(): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE_URL}/health`);
  if (!response.ok) {
    throw new Error("Health check failed");
  }
  return response.json();
}

/**
 * Check auth health (requires authentication)
 */
export async function checkAuthHealth(): Promise<{
  status: string;
  teacher_id: string;
  email: string;
  name?: string;
}> {
  const response = await apiRequest(`${API_BASE_URL}/auth/health`);
  if (!response.ok) {
    throw new Error("Auth health check failed");
  }
  return response.json();
}

// Epic 8: Metrics API
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
    trend: 'improving' | 'stable' | 'declining';
    last_essay_date?: string;
  };
  updated_at: string;
}

export async function getClassMetrics(assignmentId: string): Promise<ClassMetricsResponse> {
  const response = await apiRequest(`${API_BASE_URL}/metrics/class/${assignmentId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch class metrics: ${response.statusText}`);
  }
  return response.json();
}

export async function getStudentMetrics(studentId: string): Promise<StudentMetricsResponse> {
  const response = await apiRequest(`${API_BASE_URL}/metrics/student/${studentId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch student metrics: ${response.statusText}`);
  }
  return response.json();
}

// Epic 8: Essay Override API
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

export async function overrideEssayFeedback(
  essayId: string,
  feedback: EssayOverrideRequest['feedback']
): Promise<EssayOverrideResponse> {
  const response = await apiRequest(`${API_BASE_URL}/essays/${essayId}/override`, {
    method: 'PATCH',
    body: JSON.stringify({ feedback }),
  });
  if (!response.ok) {
    throw new Error(`Failed to override essay feedback: ${response.statusText}`);
  }
  return response.json();
}

// Epic 7: Assignments API
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

export async function createAssignment(assignment: AssignmentCreate): Promise<AssignmentResponse> {
  const response = await apiRequest(`${API_BASE_URL}/assignments`, {
    method: 'POST',
    body: JSON.stringify(assignment),
  });
  if (!response.ok) {
    throw new Error(`Failed to create assignment: ${response.statusText}`);
  }
  return response.json();
}

export async function listAssignments(): Promise<AssignmentResponse[]> {
  const response = await apiRequest(`${API_BASE_URL}/assignments`);
  if (!response.ok) {
    throw new Error(`Failed to list assignments: ${response.statusText}`);
  }
  return response.json();
}

export async function getAssignment(assignmentId: string): Promise<AssignmentResponse> {
  const response = await apiRequest(`${API_BASE_URL}/assignments/${assignmentId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch assignment: ${response.statusText}`);
  }
  return response.json();
}

// Epic 7: Students API
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

export async function createStudent(student: StudentCreate): Promise<StudentResponse> {
  const response = await apiRequest(`${API_BASE_URL}/students`, {
    method: 'POST',
    body: JSON.stringify(student),
  });
  if (!response.ok) {
    throw new Error(`Failed to create student: ${response.statusText}`);
  }
  return response.json();
}

export async function listStudents(): Promise<StudentResponse[]> {
  const response = await apiRequest(`${API_BASE_URL}/students`);
  if (!response.ok) {
    throw new Error(`Failed to list students: ${response.statusText}`);
  }
  return response.json();
}

export async function getStudent(studentId: string): Promise<StudentResponse> {
  const response = await apiRequest(`${API_BASE_URL}/students/${studentId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch student: ${response.statusText}`);
  }
  return response.json();
}
