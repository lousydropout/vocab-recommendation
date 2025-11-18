import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { requireAuth } from '../utils/route-protection'
import { useQuery } from '@tanstack/react-query'
import { getEssay } from '../api/client'
import type { EssayResponse } from '../types/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Alert, AlertDescription } from '../components/ui/alert'
import { ArrowLeft, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'

export const Route = createFileRoute('/essays/$essayId')({
  beforeLoad: async () => {
    await requireAuth()
  },
  component: EssayReviewPage,
})

function EssayReviewPage() {
  const { essayId } = Route.useParams()
  const navigate = useNavigate()

  const { data: essay, isLoading, error } = useQuery<EssayResponse>({
    queryKey: ['essay', essayId],
    queryFn: () => getEssay(essayId),
  })

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
        <Button
          variant="outline"
          onClick={handleBack}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {essay.student_id ? 'Back to Student' : 'Back to Dashboard'}
        </Button>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
          Essay Review
        </h1>
        <p className="text-muted-foreground mt-2">
          Review and override AI-generated feedback
        </p>
      </div>

      {/* Essay Info */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Essay ID: {essay.essay_id}</CardTitle>
          <CardDescription>
            Status: {essay.status} • Created: {essay.created_at ? new Date(essay.created_at).toLocaleString() : 'N/A'}
            {essay.processed_at && ` • Processed: ${new Date(essay.processed_at).toLocaleString()}`}
          </CardDescription>
        </CardHeader>
      </Card>

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
