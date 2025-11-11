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
export declare function uploadEssay(essayText: string): Promise<EssayResponse>;
export declare function getEssay(essayId: string): Promise<EssayResponse>;
export declare function checkHealth(): Promise<{
    status: string;
}>;
