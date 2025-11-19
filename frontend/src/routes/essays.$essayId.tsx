import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { requireAuth } from '../utils/route-protection'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getEssay, getStudent, getAssignment, deleteEssay } from '../api/client'
import type { EssayResponse, StudentResponse, AssignmentResponse } from '../types/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Alert, AlertDescription } from '../components/ui/alert'
import { ArrowLeft, Loader2, AlertCircle, CheckCircle2, FileText, User, BookOpen, Trash2 } from 'lucide-react'
import { useState } from 'react'

export const Route = createFileRoute('/essays/$essayId')({
  beforeLoad: async () => {
    await requireAuth()
  },
  component: EssayReviewPage,
})

function EssayReviewPage() {
  const { essayId } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const { data: essay, isLoading, error } = useQuery<EssayResponse>({
    queryKey: ['essay', essayId],
    queryFn: () => getEssay(essayId),
  })

  // Fetch student info if available
  const { data: student } = useQuery<StudentResponse>({
    queryKey: ['student', essay?.student_id],
    queryFn: () => getStudent(essay!.student_id),
    enabled: !!essay?.student_id,
  })

  // Fetch assignment info if available
  const { data: assignment } = useQuery<AssignmentResponse>({
    queryKey: ['assignment', essay?.assignment_id],
    queryFn: () => getAssignment(essay!.assignment_id),
    enabled: !!essay?.assignment_id,
  })

  // Compute basic metrics from essay text
  const essayMetrics = essay?.essay_text ? (() => {
    const words = essay.essay_text.toLowerCase().match(/\b[a-z]+\b/g) || []
    const wordCount = words.length
    const uniqueWords = new Set(words).size
    const ttr = wordCount > 0 ? uniqueWords / wordCount : 0
    return { wordCount, uniqueWords, ttr }
  })() : null

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => deleteEssay(essayId),
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['essay', essayId] })
      if (essay?.student_id) {
        queryClient.invalidateQueries({ queryKey: ['student', essay.student_id] })
        queryClient.invalidateQueries({ queryKey: ['student-essays', essay.student_id] })
      }
      if (essay?.assignment_id) {
        queryClient.invalidateQueries({ queryKey: ['assignment-essays', essay.assignment_id] })
        queryClient.invalidateQueries({ queryKey: ['class-metrics', essay.assignment_id] })
      }
      
      // Navigate back
      if (essay?.student_id) {
        navigate({ to: '/students/$studentId', params: { studentId: essay.student_id } })
      } else if (essay?.assignment_id) {
        navigate({ to: '/assignments/$assignmentId', params: { assignmentId: essay.assignment_id } })
      } else {
        navigate({ to: '/' })
      }
    },
    onError: (err: Error) => {
      setDeleteError(err.message || 'Failed to delete essay')
      setShowDeleteConfirm(false)
    },
  })

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true)
    setDeleteError(null)
  }

  const handleDeleteConfirm = () => {
    deleteMutation.mutate()
  }

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false)
    setDeleteError(null)
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

  const handleBack = () => {
    if (essay?.student_id) {
      navigate({ 
        to: '/students/$studentId',
        params: { studentId: essay.student_id }
      })
    } else {
      navigate({ to: '/' })
    }
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
        <Button onClick={handleBack} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {essay?.student_id ? 'Back to Student' : 'Back to Dashboard'}
        </Button>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="outline"
            onClick={handleBack}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {essay.student_id ? 'Back to Student' : 'Back to Dashboard'}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDeleteClick}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Essay
              </>
            )}
          </Button>
        </div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
          Essay Review
        </h1>
        <p className="text-muted-foreground mt-2">
          Review and override AI-generated feedback
        </p>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>Are you sure you want to delete this essay? This action cannot be undone.</span>
            <div className="flex gap-2 ml-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeleteCancel}
                disabled={deleteMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteConfirm}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Delete Error */}
      {deleteError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{deleteError}</AlertDescription>
        </Alert>
      )}

      {/* Essay Info */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Essay Information
          </CardTitle>
          <CardDescription className="space-y-1">
            <div className="flex items-center gap-4 flex-wrap">
              <span>Status: <span className="font-medium">{essay.status}</span></span>
              {essay.created_at && (
                <span>Created: <span className="font-medium">{new Date(essay.created_at).toLocaleString()}</span></span>
              )}
              {essay.processed_at && (
                <span>Processed: <span className="font-medium">{new Date(essay.processed_at).toLocaleString()}</span></span>
              )}
            </div>
            {student && (
              <div className="flex items-center gap-2 mt-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>Student: </span>
                <button
                  onClick={() => navigate({ to: '/students/$studentId', params: { studentId: student.student_id } })}
                  className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                >
                  {student.name}
                </button>
              </div>
            )}
            {assignment && (
              <div className="flex items-center gap-2 mt-1">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                <span>Assignment: </span>
                <button
                  onClick={() => navigate({ to: '/assignments/$assignmentId', params: { assignmentId: assignment.assignment_id } })}
                  className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                >
                  {assignment.name}
                </button>
              </div>
            )}
            {essayMetrics && (
              <div className="flex items-center gap-4 mt-2 text-sm">
                <span>Word Count: <span className="font-medium">{essayMetrics.wordCount}</span></span>
                <span>Unique Words: <span className="font-medium">{essayMetrics.uniqueWords}</span></span>
                <span>TTR: <span className="font-medium">{essayMetrics.ttr.toFixed(3)}</span></span>
              </div>
            )}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Essay Text */}
      {essay.essay_text && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Essay Text</CardTitle>
            <CardDescription>
              Full essay content for reference
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-50 p-6 rounded-lg border">
              <div className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-gray-900 max-h-[600px] overflow-y-auto">
                {essay.essay_text}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vocabulary Analysis */}
      {essay.vocabulary_analysis ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Vocabulary Analysis
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
                      Vocabulary Demonstrating Current Level
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
                      Recommended Vocabulary to Expand Skills
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
                      These words match or slightly exceed the current level and would help the student grow as a writer.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : essay.status === 'processed' ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Analysis Complete</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Essay has been processed, but vocabulary analysis is not available.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Processing</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              <p className="text-muted-foreground">
                This essay is currently being processed. Please check back in a few moments.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
