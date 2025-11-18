import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Textarea } from '../components/ui/textarea'
import { Alert, AlertDescription } from '../components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import { Loader2, CheckCircle2, XCircle, LogIn, BookOpen } from 'lucide-react'
import { config } from '../utils/config'
import type { EssayResponse } from '../types/api'

export const Route = createFileRoute('/')({
  component: HomePage,
})

// Available example essays
const EXAMPLE_ESSAYS = [
  { filename: 'Brooks_Jackson.txt', displayName: 'Essay 1 - Brooks Jackson' },
  { filename: 'Carter_Zoe.txt', displayName: 'Essay 2 - Carter Zoe' },
  { filename: 'Cooper_Dylan.txt', displayName: 'Essay 3 - Cooper Dylan' },
  { filename: 'Greene_Ethan.txt', displayName: 'Essay 4 - Greene Ethan' },
  { filename: 'Hassan_Aria.txt', displayName: 'Essay 5 - Hassan Aria' },
  { filename: 'Johnson_Marcus.txt', displayName: 'Essay 6 - Johnson Marcus' },
  { filename: 'Kim_Ava.txt', displayName: 'Essay 7 - Kim Ava' },
  { filename: 'Lopez_Sofia.txt', displayName: 'Essay 8 - Lopez Sofia' },
  { filename: 'Martinez_Chloe.txt', displayName: 'Essay 9 - Martinez Chloe' },
  { filename: 'Nguyen_Emily.txt', displayName: 'Essay 10 - Nguyen Emily' },
  { filename: 'Patel_Noah.txt', displayName: 'Essay 11 - Patel Noah' },
  { filename: 'Reyes_Natalie.txt', displayName: 'Essay 12 - Reyes Natalie' },
  { filename: 'Rodriguez_Liam.txt', displayName: 'Essay 13 - Rodriguez Liam' },
  { filename: 'Thompson_Maya.txt', displayName: 'Essay 14 - Thompson Maya' },
  { filename: 'Walsh_Henry.txt', displayName: 'Essay 15 - Walsh Henry' },
]

function HomePage() {
  const [essayText, setEssayText] = useState('')
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'completed' | 'error'>('idle')
  const [essay, setEssay] = useState<EssayResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null)
  const [selectedEssay, setSelectedEssay] = useState<string>('none')
  const [isLoadingEssay, setIsLoadingEssay] = useState(false)

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
      // Call public endpoint for demo
      const response = await fetch(`${config.API_URL}/essays/public`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          essay_text: essayText,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText)
        throw new Error(`Failed to upload essay: ${response.status} ${errorText}`)
      }

      const result = await response.json()
      const essayId = result.essay_id

      // Start polling for results
      setStatus('processing')
      startPolling(essayId)
    } catch (err: any) {
      setError(err.message || 'Failed to upload essay')
      setStatus('error')
    }
  }

  const startPolling = (essayId: string) => {
    // Clear any existing polling
    if (pollingInterval) {
      clearInterval(pollingInterval)
    }

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${config.API_URL}/essays/${essayId}`)
        if (!response.ok) {
          if (response.status === 404) {
            // Essay not found yet, keep polling
            return
          }
          throw new Error(`Failed to fetch essay: ${response.status}`)
        }

        const result: EssayResponse = await response.json()
        setEssay(result)
        
        if (result.status === 'processed') {
          setStatus('completed')
          clearInterval(interval)
          setPollingInterval(null)
        } else if (result.status === 'pending') {
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
    setSelectedEssay('none')
    if (pollingInterval) {
      clearInterval(pollingInterval)
      setPollingInterval(null)
    }
  }

  const loadEssay = async (filename: string) => {
    if (filename === 'none') {
      setEssayText('')
      setSelectedEssay('none')
      setError(null)
      return
    }

    setIsLoadingEssay(true)
    setError(null)
    try {
      const response = await fetch(`/essays/${filename}`)
      if (!response.ok) {
        throw new Error(`Failed to load essay: ${response.statusText}`)
      }
      const text = await response.text()
      setEssayText(text)
      setSelectedEssay(filename)
      // Reset status when loading a new essay
      setStatus('idle')
      setEssay(null)
    } catch (err: any) {
      setError(err.message || 'Failed to load essay')
      setSelectedEssay('none')
    } finally {
      setIsLoadingEssay(false)
    }
  }

  const handleEssaySelect = (value: string) => {
    loadEssay(value)
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
              <div className="space-y-2">
                <label htmlFor="essay-select" className="text-sm font-medium">
                  Load Example Essay (Optional)
                </label>
                <Select
                  value={selectedEssay}
                  onValueChange={handleEssaySelect}
                  disabled={status === 'uploading' || status === 'processing' || isLoadingEssay}
                >
                  <SelectTrigger id="essay-select">
                    <SelectValue placeholder="Select an example essay..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {EXAMPLE_ESSAYS.map((essay) => (
                      <SelectItem key={essay.filename} value={essay.filename}>
                        {essay.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Textarea
                value={essayText}
                onChange={(e) => {
                  setEssayText(e.target.value)
                  // Clear selection if user manually edits
                  if (selectedEssay !== 'none') {
                    setSelectedEssay('none')
                  }
                }}
                placeholder="Paste your essay here or select an example essay above..."
                rows={12}
                disabled={status === 'uploading' || status === 'processing' || isLoadingEssay}
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
              // Essay processed but no vocabulary_analysis available
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    Analysis Complete
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Essay has been processed, but vocabulary analysis is not available.
                  </p>
                </CardContent>
              </Card>
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
