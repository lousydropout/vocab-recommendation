const API_BASE_URL = import.meta.env.VITE_API_URL || "https://3uyr4x1nta.execute-api.us-east-1.amazonaws.com/prod";

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
  const response = await fetch(`${API_BASE_URL}/essay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ essay_text: essayText }),
  });

  if (!response.ok) {
    throw new Error(`Failed to upload essay: ${response.statusText}`);
  }

  return response.json();
}

export async function getEssay(essayId: string): Promise<EssayResponse> {
  const response = await fetch(`${API_BASE_URL}/essay/${essayId}`);

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

