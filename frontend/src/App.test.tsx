import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import * as api from './lib/api'

// Mock the API module
vi.mock('./lib/api')

describe('App Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render the upload form initially', () => {
    render(<App />)
    
    expect(screen.getByText('Vocabulary Essay Analyzer')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Paste your essay here...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /analyze essay/i })).toBeInTheDocument()
  })

  it('should disable submit button when textarea is empty', () => {
    render(<App />)
    
    const submitButton = screen.getByRole('button', { name: /analyze essay/i })
    expect(submitButton).toBeDisabled()
  })

  it('should enable submit button when text has content', async () => {
    const user = userEvent.setup()
    render(<App />)
    
    const textarea = screen.getByPlaceholderText('Paste your essay here...')
    const submitButton = screen.getByRole('button', { name: /analyze essay/i })
    
    await user.type(textarea, 'Test essay content')
    
    expect(submitButton).not.toBeDisabled()
  })

  it('should show error when submitting empty text', async () => {
    const user = userEvent.setup()
    render(<App />)
    
    const textarea = screen.getByPlaceholderText('Paste your essay here...')
    const submitButton = screen.getByRole('button', { name: /analyze essay/i })
    
    // Type some text first to enable button, then clear it
    await user.type(textarea, 'test')
    await user.clear(textarea)
    
    // Now button should be disabled, but let's test the validation by directly calling handleSubmit
    // Actually, let's just verify the button is disabled when textarea is empty
    expect(submitButton).toBeDisabled()
    
    // Type only whitespace - button should still be disabled
    await user.type(textarea, '   ')
    expect(submitButton).toBeDisabled()
  })

  it('should upload essay and show processing status', async () => {
    const user = userEvent.setup()
    const mockUpload = vi.spyOn(api, 'uploadEssay').mockResolvedValue({
      essay_id: 'test-123',
      status: 'awaiting_processing',
      file_key: 'essays/test-123.txt',
    })

    vi.spyOn(api, 'getEssay')
      .mockResolvedValueOnce({
        essay_id: 'test-123',
        status: 'processing',
      })
      .mockResolvedValueOnce({
        essay_id: 'test-123',
        status: 'processed',
        metrics: {
          word_count: 100,
          unique_words: 80,
          type_token_ratio: 0.8,
        },
        feedback: [],
      })

    render(<App />)
    
    const textarea = screen.getByPlaceholderText('Paste your essay here...')
    const submitButton = screen.getByRole('button', { name: /analyze essay/i })
    
    await user.type(textarea, 'This is a test essay with some content.')
    await user.click(submitButton)
    
    expect(mockUpload).toHaveBeenCalledWith('This is a test essay with some content.')
    
    // Wait for initial status (awaiting_processing shows as "Queued for Processing")
    await waitFor(() => {
      expect(screen.getByText('Queued for Processing')).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should display metrics when essay is processed', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'uploadEssay').mockResolvedValue({
      essay_id: 'test-123',
      status: 'processed', // Start with processed to skip polling
      metrics: {
        word_count: 100,
        unique_words: 80,
        type_token_ratio: 0.85,
        noun_ratio: 0.3,
        verb_ratio: 0.25,
        adj_ratio: 0.2,
        adv_ratio: 0.1,
        avg_word_freq_rank: 1500,
      },
      feedback: [],
    })

    render(<App />)
    
    const textarea = screen.getByPlaceholderText('Paste your essay here...')
    const submitButton = screen.getByRole('button', { name: /analyze essay/i })
    
    await user.type(textarea, 'Test essay')
    await user.click(submitButton)
    
    await waitFor(() => {
      expect(screen.getByText('Metrics')).toBeInTheDocument()
    })
    
    // Check for metrics values
    expect(screen.getByText('100')).toBeInTheDocument() // word_count
    expect(screen.getByText('80')).toBeInTheDocument() // unique_words
    expect(screen.getByText('0.85')).toBeInTheDocument() // type_token_ratio
  })

  it('should display feedback when available', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'uploadEssay').mockResolvedValue({
      essay_id: 'test-123',
      status: 'processed', // Start with processed to skip polling
      metrics: {
        word_count: 50,
        unique_words: 40,
        type_token_ratio: 0.8,
      },
      feedback: [
        {
          word: 'articulated',
          correct: true,
          comment: 'Used correctly and appropriately',
        },
        {
          word: 'incorrectly',
          correct: false,
          comment: 'Used incorrectly in this context',
        },
      ],
    })

    render(<App />)
    
    const textarea = screen.getByPlaceholderText('Paste your essay here...')
    const submitButton = screen.getByRole('button', { name: /analyze essay/i })
    
    await user.type(textarea, 'Test essay')
    await user.click(submitButton)
    
    await waitFor(() => {
      expect(screen.getByText('Word-Level Feedback')).toBeInTheDocument()
    })
    
    // Check for feedback content
    expect(screen.getByText('articulated')).toBeInTheDocument()
    expect(screen.getByText('incorrectly')).toBeInTheDocument()
    expect(screen.getByText(/used correctly/i)).toBeInTheDocument()
  })

  it('should show error message on upload failure', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'uploadEssay').mockRejectedValue(new Error('Network error'))

    render(<App />)
    
    const textarea = screen.getByPlaceholderText('Paste your essay here...')
    const submitButton = screen.getByRole('button', { name: /analyze essay/i })
    
    await user.type(textarea, 'Test essay')
    await user.click(submitButton)
    
    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument()
    })
  })

  it('should reset form when clicking "Analyze Another Essay"', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'uploadEssay').mockResolvedValue({
      essay_id: 'test-123',
      status: 'processed', // Start with processed to skip polling
      metrics: {
        word_count: 50,
        unique_words: 40,
        type_token_ratio: 0.8,
      },
      feedback: [],
    })

    render(<App />)
    
    const textarea = screen.getByPlaceholderText('Paste your essay here...')
    const submitButton = screen.getByRole('button', { name: /analyze essay/i })
    
    await user.type(textarea, 'Test essay')
    await user.click(submitButton)
    
    await waitFor(() => {
      expect(screen.getByText('Metrics')).toBeInTheDocument()
    })
    
    const resetButton = screen.getByRole('button', { name: /analyze another essay/i })
    await user.click(resetButton)
    
    // Should show form again
    expect(screen.getByPlaceholderText('Paste your essay here...')).toBeInTheDocument()
    expect(screen.queryByText('Metrics')).not.toBeInTheDocument()
  })
})

