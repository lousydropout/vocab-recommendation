import { getToken } from '../utils/auth';
import { config } from '../utils/config';

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

// Import types for use in this file
import type {
  EssayResponse,
  BatchEssayResponse,
} from '../types/api';

// Re-export types for external use
export type {
  EssayResponse,
  BatchEssayRequest,
  BatchEssayResponse,
  EssayItem,
  ClassMetricsResponse,
  StudentMetricsResponse,
  StudentEssayResponse,
  EssayOverrideRequest,
  EssayOverrideResponse,
  AssignmentResponse,
  AssignmentCreate,
  StudentResponse,
  StudentCreate,
} from '../types/api';

// Health check endpoints
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

// Essay endpoints
export async function getEssay(essayId: string): Promise<EssayResponse> {
  const response = await apiRequest(`${API_BASE_URL}/essays/${essayId}`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Essay not found");
    }
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Failed to fetch essay: ${response.status} ${errorText}`);
  }
  return response.json();
}

export async function uploadBatchEssays(
  assignmentId: string,
  studentId: string | undefined,
  essays: Array<{ filename: string; text: string }>
): Promise<BatchEssayResponse[]> {
  const response = await apiRequest(`${API_BASE_URL}/essays/batch`, {
    method: 'POST',
    body: JSON.stringify({
      assignment_id: assignmentId,
      student_id: studentId,
      essays: essays,
    }),
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Failed to upload batch essays: ${response.status} ${errorText}`);
  }
  return response.json();
}

// Metrics endpoints
export async function getClassMetrics(assignmentId: string) {
  const response = await apiRequest(`${API_BASE_URL}/metrics/class/${assignmentId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch class metrics: ${response.statusText}`);
  }
  return response.json();
}

export async function getStudentMetrics(studentId: string) {
  const response = await apiRequest(`${API_BASE_URL}/metrics/student/${studentId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch student metrics: ${response.statusText}`);
  }
  return response.json();
}

// Essay Override endpoints
export async function overrideEssayFeedback(
  essayId: string,
  feedback: Array<{
    word: string;
    correct: boolean;
    comment: string;
  }>
) {
  const response = await apiRequest(`${API_BASE_URL}/essays/${essayId}/override`, {
    method: 'PATCH',
    body: JSON.stringify({ feedback }),
  });
  if (!response.ok) {
    throw new Error(`Failed to override essay feedback: ${response.statusText}`);
  }
  return response.json();
}

// Assignments endpoints
export async function createAssignment(assignment: { name: string; description?: string }) {
  const response = await apiRequest(`${API_BASE_URL}/assignments`, {
    method: 'POST',
    body: JSON.stringify(assignment),
  });
  if (!response.ok) {
    throw new Error(`Failed to create assignment: ${response.statusText}`);
  }
  return response.json();
}

export async function listAssignments() {
  const response = await apiRequest(`${API_BASE_URL}/assignments`);
  if (!response.ok) {
    throw new Error(`Failed to list assignments: ${response.statusText}`);
  }
  return response.json();
}

export async function getAssignment(assignmentId: string) {
  const response = await apiRequest(`${API_BASE_URL}/assignments/${assignmentId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch assignment: ${response.statusText}`);
  }
  return response.json();
}

export async function getAssignmentUploadUrl(assignmentId: string, fileName: string) {
  const response = await apiRequest(`${API_BASE_URL}/assignments/${assignmentId}/upload-url`, {
    method: 'POST',
    body: JSON.stringify({ file_name: fileName }),
  });
  if (!response.ok) {
    throw new Error(`Failed to get upload URL: ${response.statusText}`);
  }
  return response.json();
}

// Students endpoints
export async function createStudent(student: { name: string; grade_level?: number; notes?: string }) {
  const response = await apiRequest(`${API_BASE_URL}/students`, {
    method: 'POST',
    body: JSON.stringify(student),
  });
  if (!response.ok) {
    throw new Error(`Failed to create student: ${response.statusText}`);
  }
  return response.json();
}

export async function listStudents() {
  const response = await apiRequest(`${API_BASE_URL}/students`);
  if (!response.ok) {
    throw new Error(`Failed to list students: ${response.statusText}`);
  }
  return response.json();
}

export async function getStudent(studentId: string) {
  const response = await apiRequest(`${API_BASE_URL}/students/${studentId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch student: ${response.statusText}`);
  }
  return response.json();
}

export async function updateStudent(studentId: string, student: { name?: string; grade_level?: number; notes?: string }) {
  const response = await apiRequest(`${API_BASE_URL}/students/${studentId}`, {
    method: 'PATCH',
    body: JSON.stringify(student),
  });
  if (!response.ok) {
    throw new Error(`Failed to update student: ${response.statusText}`);
  }
  return response.json();
}

export async function deleteStudent(studentId: string) {
  const response = await apiRequest(`${API_BASE_URL}/students/${studentId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`Failed to delete student: ${response.statusText}`);
  }
}

export async function listStudentEssays(studentId: string) {
  try {
    const response = await apiRequest(`${API_BASE_URL}/essays/student/${studentId}`);
    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Failed to list student essays: ${response.status} ${errorText}`);
    }
    return response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to list student essays: ${String(error)}`);
  }
}

