import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { requireAuth } from '../utils/route-protection'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getEssay, overrideEssayFeedback } from '../api/client'
import type { EssayResponse } from '../types/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Alert, AlertDescription } from '../components/ui/alert'
import { Textarea } from '../components/ui/textarea'
import { ArrowLeft, Loader2, AlertCircle, Save, CheckCircle2, XCircle, Edit2 } from 'lucide-react'
import { useState, useEffect } from 'react'

export const Route = createFileRoute('/essays/$essayId')({
  beforeLoad: async () => {
    await requireAuth()
  },
  component: EssayReviewPage,
})

interface FeedbackItem {
  word: string
  correct: boolean
  comment: string
}

function EssayReviewPage() {
  const { essayId } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [feedback, setFeedback] = useState<FeedbackItem[]>([])
  const [originalFeedback, setOriginalFeedback] = useState<FeedbackItem[]>([])
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const { data: essay, isLoading, error } = useQuery<EssayResponse>({
    queryKey: ['essay', essayId],
    queryFn: () => getEssay(essayId),
  })

  useEffect(() => {
    if (essay?.feedback) {
      const initialFeedback = essay.feedback
      setFeedback(initialFeedback)
      setOriginalFeedback(JSON.parse(JSON.stringify(initialFeedback))) // Deep copy
    }
  }, [essay])

  const overrideMutation = useMutation({
    mutationFn: (feedback: FeedbackItem[]) => overrideEssayFeedback(essayId, feedback),
    onSuccess: () => {
      setOriginalFeedback(JSON.parse(JSON.stringify(feedback))) // Update original
      setSuccess('Feedback override saved successfully. Metrics will be recomputed.')
      queryClient.invalidateQueries({ queryKey: ['essay', essayId] })
      // Clear success message after 5 seconds
      setTimeout(() => setSuccess(null), 5000)
    },
  })

  const toggleCorrectness = (index: number) => {
    const newFeedback = [...feedback]
    newFeedback[index].correct = !newFeedback[index].correct
    setFeedback(newFeedback)
  }

  const updateComment = (index: number, comment: string) => {
    const newFeedback = [...feedback]
    newFeedback[index].comment = comment
    setFeedback(newFeedback)
  }

  const handleSave = () => {
    overrideMutation.mutate(feedback)
  }

  const hasChanges = () => {
    return JSON.stringify(feedback) !== JSON.stringify(originalFeedback)
  }

  const renderEssayWithFeedback = () => {
    if (!essay || !essay.feedback || essay.feedback.length === 0) {
      return <p className="text-muted-foreground">No feedback available for this essay.</p>
    }

    return (
      <div className="space-y-3">
        {feedback.map((item, index) => (
          <Card
            key={index}
            className={`border-2 transition-shadow ${
              item.correct
                ? 'border-green-300 bg-green-50/50 hover:bg-green-50'
                : 'border-red-300 bg-red-50/50 hover:bg-red-50'
            }`}
          >
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl font-bold">{item.word}</span>
                    <Button
                      onClick={() => toggleCorrectness(index)}
                      size="sm"
                      variant={item.correct ? 'default' : 'destructive'}
                      className={item.correct ? 'bg-green-600 hover:bg-green-700' : ''}
                    >
                      {item.correct ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Correct
                        </>
                      ) : (
                        <>
                          <XCircle className="h-4 w-4 mr-1" />
                          Incorrect
                        </>
                      )}
                    </Button>
                  </div>
                  {editingIndex === index ? (
                    <div className="space-y-2">
                      <Textarea
                        value={item.comment}
                        onChange={(e) => updateComment(index, e.target.value)}
                        rows={3}
                        className="w-full"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => setEditingIndex(null)}
                        >
                          Done
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">{item.comment || 'No comment'}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingIndex(index)}
                      >
                        <Edit2 className="h-3 w-3 mr-1" />
                        Edit Comment
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (error || !essay) {
    return (
      <div className="p-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error instanceof Error ? error.message : 'Failed to load essay'}
          </AlertDescription>
        </Alert>
        <Button onClick={() => navigate({ to: '/' })} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <Button
          variant="outline"
          onClick={() => navigate({ to: '/' })}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
          Essay Review
        </h1>
        <p className="text-muted-foreground mt-2">
          Review and override AI-generated feedback
        </p>
      </div>

      {/* Alerts */}
      {overrideMutation.isError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {overrideMutation.error instanceof Error ? overrideMutation.error.message : 'Failed to save feedback override'}
          </AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert className="mb-6 border-green-500 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{success}</AlertDescription>
        </Alert>
      )}

      {/* Essay Info */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Essay ID: {essay.essay_id}</CardTitle>
          <CardDescription>
            Status: {essay.status} • Created: {essay.created_at ? new Date(essay.created_at).toLocaleString() : 'N/A'}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Metrics Summary */}
      {essay.metrics && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Metrics Summary</CardTitle>
          </CardHeader>
          <CardContent>
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
                <p className="text-2xl font-bold">{typeof essay.metrics.type_token_ratio === 'number' 
                  ? essay.metrics.type_token_ratio.toFixed(2) 
                  : parseFloat(String(essay.metrics.type_token_ratio || 0)).toFixed(2)}</p>
              </div>
              {essay.metrics.avg_word_freq_rank && (
                <div>
                  <p className="text-sm text-muted-foreground">Avg Frequency Rank</p>
                  <p className="text-2xl font-bold">{Math.round(essay.metrics.avg_word_freq_rank)}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Feedback Section */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Word-Level Feedback</CardTitle>
              <CardDescription>
                Review and override AI-generated feedback. Changes will trigger metric recomputation.
              </CardDescription>
            </div>
            {hasChanges() && (
              <Button
                onClick={handleSave}
                disabled={overrideMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {overrideMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {renderEssayWithFeedback()}
        </CardContent>
      </Card>
    </div>
  )
}
