import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { uploadEssay, getEssay } from '../api/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Textarea } from '../components/ui/textarea'
import { Alert, AlertDescription } from '../components/ui/alert'
import { Loader2, CheckCircle2, XCircle, LogIn, BookOpen } from 'lucide-react'
import type { EssayResponse } from '../types/api'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const [essayText, setEssayText] = useState('')
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'completed' | 'error'>('idle')
  const [essay, setEssay] = useState<EssayResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!essayText.trim()) {
      setError('Please enter some essay text')
      return
    }

    setError(null)
    setStatus('uploading')
    setEssay(null)

    try {
      const response = await uploadEssay(essayText)
      setStatus('processing')
      
      // Start polling for results
      startPolling(response.essay_id)
    } catch (err: any) {
      setError(err.message || 'Failed to upload essay')
      setStatus('error')
    }
  }

  const startPolling = (id: string) => {
    // Clear any existing polling
    if (pollingInterval) {
      clearInterval(pollingInterval)
    }

    const interval = setInterval(async () => {
      try {
        const result = await getEssay(id)
        setEssay(result)
        
        if (result.status === 'processed') {
          setStatus('completed')
          clearInterval(interval)
          setPollingInterval(null)
        } else if (result.status === 'processing' || result.status === 'awaiting_processing') {
          setStatus('processing')
        }
      } catch (err: any) {
        console.error('Polling error:', err)
        // Continue polling even on error (might be temporary)
      }
    }, 3000) // Poll every 3 seconds

    setPollingInterval(interval)
  }

  useEffect(() => {
    // Cleanup polling on unmount
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval)
      }
    }
  }, [pollingInterval])

  const handleReset = () => {
    setEssayText('')
    setStatus('idle')
    setEssay(null)
    setError(null)
    if (pollingInterval) {
      clearInterval(pollingInterval)
      setPollingInterval(null)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent mb-4">
            Vocabulary Essay Analyzer
          </h1>
          <p className="text-lg text-muted-foreground mb-6">
            Analyze your essay's vocabulary diversity, difficulty, and contextual correctness
          </p>
          <Link to="/login">
            <Button variant="outline" className="gap-2">
              <LogIn className="h-4 w-4" />
              Teacher Login
            </Button>
          </Link>
        </div>

        {/* Upload Form */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Upload Essay
            </CardTitle>
            <CardDescription>
              Paste your essay text below and click "Analyze" to get started
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Textarea
                value={essayText}
                onChange={(e) => setEssayText(e.target.value)}
                placeholder="Paste your essay here..."
                rows={12}
                disabled={status === 'uploading' || status === 'processing'}
                className="font-mono text-sm"
              />
              
              {error && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={status === 'uploading' || status === 'processing' || !essayText.trim()}
                  className="flex-1"
                >
                  {status === 'uploading' || status === 'processing' ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {status === 'uploading' ? 'Uploading...' : 'Processing...'}
                    </>
                  ) : (
                    'Analyze Essay'
                  )}
                </Button>
                {(status === 'completed' || status === 'error') && (
                  <Button type="button" variant="outline" onClick={handleReset}>
                    Reset
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Status Indicator */}
        {status === 'processing' && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex items-center justify-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                <p className="text-muted-foreground">
                  Your essay is being processed. This may take 30-60 seconds...
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {status === 'completed' && essay && (
          <div className="space-y-6">
            {essay.vocabulary_analysis ? (
              // New OpenAI-based vocabulary analysis (legacy/public version)
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      Vocabulary Analysis Complete
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {/* Correctness Review */}
                      <div>
                        <h3 className="text-lg font-semibold mb-2">Overall Review</h3>
                        <p className="text-muted-foreground leading-relaxed">
                          {essay.vocabulary_analysis.correctness_review}
                        </p>
                      </div>

                      {/* Vocabulary Used */}
                      {essay.vocabulary_analysis.vocabulary_used.length > 0 && (
                        <div>
                          <h3 className="text-lg font-semibold mb-3">
                            Vocabulary Demonstrating Your Current Level
                          </h3>
                          <div className="flex flex-wrap gap-2">
                            {essay.vocabulary_analysis.vocabulary_used.map((word, index) => (
                              <span
                                key={index}
                                className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium"
                              >
                                {word}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Recommended Vocabulary */}
                      {essay.vocabulary_analysis.recommended_vocabulary.length > 0 && (
                        <div>
                          <h3 className="text-lg font-semibold mb-3">
                            Recommended Vocabulary to Expand Your Skills
                          </h3>
                          <div className="flex flex-wrap gap-2">
                            {essay.vocabulary_analysis.recommended_vocabulary.map((word, index) => (
                              <span
                                key={index}
                                className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium"
                              >
                                {word}
                              </span>
                            ))}
                          </div>
                          <p className="text-sm text-muted-foreground mt-3">
                            These words match or slightly exceed your current level and would help you grow as a writer.
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              // Legacy metrics/feedback format (for teacher version)
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      Analysis Complete
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {essay.metrics && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <p className="text-sm text-muted-foreground">Word Count</p>
                            <p className="text-2xl font-bold">{essay.metrics.word_count}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Unique Words</p>
                            <p className="text-2xl font-bold">{essay.metrics.unique_words}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Type-Token Ratio</p>
                            <p className="text-2xl font-bold">
                              {essay.metrics.type_token_ratio?.toFixed(3) || 'N/A'}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Avg Word Frequency</p>
                            <p className="text-2xl font-bold">
                              {essay.metrics.avg_word_freq_rank?.toFixed(0) || 'N/A'}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {essay.feedback && essay.feedback.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Word-Level Feedback</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {essay.feedback.map((item, index) => (
                          <div
                            key={index}
                            className={`p-3 rounded-lg border-2 ${
                              item.correct
                                ? 'border-green-200 bg-green-50'
                                : 'border-red-200 bg-red-50'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold">{item.word}</span>
                              <span
                                className={`text-xs px-2 py-1 rounded ${
                                  item.correct
                                    ? 'bg-green-200 text-green-800'
                                    : 'bg-red-200 text-red-800'
                                }`}
                              >
                                {item.correct ? 'Correct' : 'Incorrect'}
                              </span>
                            </div>
                            {item.comment && (
                              <p className="text-sm text-muted-foreground mt-1">{item.comment}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            <div className="text-center">
              <Link to="/login">
                <Button variant="outline" className="gap-2">
                  <LogIn className="h-4 w-4" />
                  Login for Full Features
                </Button>
              </Link>
              <p className="text-sm text-muted-foreground mt-2">
                Teachers can create assignments, track students, and view detailed analytics
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
