import { describe, it, expect, vi, beforeEach } from 'vitest'
import { uploadEssay, getEssay, checkHealth, type EssayResponse } from './api'

// Mock fetch
const mockFetch = vi.fn()
globalThis.fetch = mockFetch as any

describe('API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('uploadEssay', () => {
    it('should upload essay successfully', async () => {
      const mockResponse: EssayResponse = {
        essay_id: 'test-id-123',
        status: 'awaiting_processing',
        file_key: 'essays/test-id-123.txt',
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await uploadEssay('Test essay text')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/essay'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ essay_text: 'Test essay text' }),
        })
      )
      expect(result).toEqual(mockResponse)
    })

    it('should throw error on failed upload', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
      })

      await expect(uploadEssay('Test')).rejects.toThrow('Failed to upload essay')
    })
  })

  describe('getEssay', () => {
    it('should fetch essay successfully', async () => {
      const mockResponse: EssayResponse = {
        essay_id: 'test-id-123',
        status: 'processed',
        metrics: {
          word_count: 100,
          unique_words: 80,
          type_token_ratio: 0.8,
        },
        feedback: [],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await getEssay('test-id-123')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/essay/test-id-123')
      )
      expect(result).toEqual(mockResponse)
    })

    it('should throw error for 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      await expect(getEssay('non-existent')).rejects.toThrow('Essay not found')
    })

    it('should throw error on other failures', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })

      await expect(getEssay('test-id')).rejects.toThrow('Failed to fetch essay')
    })
  })

  describe('checkHealth', () => {
    it('should check health successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' }),
      })

      const result = await checkHealth()

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/health')
      )
      expect(result).toEqual({ status: 'ok' })
    })

    it('should throw error on health check failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      })

      await expect(checkHealth()).rejects.toThrow('Health check failed')
    })
  })
})

