import { getToken } from './auth';

const API_BASE_URL = import.meta.env.VITE_API_URL || "https://m18eg6bei9.execute-api.us-east-1.amazonaws.com/prod";

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

