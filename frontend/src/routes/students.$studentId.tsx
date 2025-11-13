import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { requireAuth } from '../utils/route-protection'
import { useQuery } from '@tanstack/react-query'
import { getStudent, getStudentMetrics } from '../api/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Alert, AlertDescription } from '../components/ui/alert'
import { ArrowLeft, Loader2, AlertCircle, FileText, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export const Route = createFileRoute('/students/$studentId')({
  beforeLoad: async () => {
    await requireAuth()
  },
  component: StudentDetailPage,
})

function StudentDetailPage() {
  const { studentId } = Route.useParams()
  const navigate = useNavigate()

  const { data: student, isLoading: studentLoading, error: studentError } = useQuery({
    queryKey: ['student', studentId],
    queryFn: () => getStudent(studentId),
  })

  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['student-metrics', studentId],
    queryFn: () => getStudentMetrics(studentId),
    enabled: !!studentId,
  })

  const getTrendIcon = () => {
    if (!metrics) return null
    switch (metrics.stats.trend) {
      case 'improving':
        return <TrendingUp className="h-5 w-5 text-green-600" />
      case 'declining':
        return <TrendingDown className="h-5 w-5 text-red-600" />
      default:
        return <Minus className="h-5 w-5 text-gray-600" />
    }
  }

  const getTrendColor = () => {
    if (!metrics) return 'text-gray-600'
    switch (metrics.stats.trend) {
      case 'improving':
        return 'text-green-600'
      case 'declining':
        return 'text-red-600'
      default:
        return 'text-gray-600'
    }
  }

  // Mock time-series data (in production, this would come from the API)
  // For now, we'll show a simple representation based on current metrics
  const timeSeriesData = metrics ? [
    { date: 'Week 1', ttr: metrics.stats.avg_ttr * 0.9, wordCount: metrics.stats.avg_word_count * 0.9 },
    { date: 'Week 2', ttr: metrics.stats.avg_ttr * 0.95, wordCount: metrics.stats.avg_word_count * 0.95 },
    { date: 'Week 3', ttr: metrics.stats.avg_ttr, wordCount: metrics.stats.avg_word_count },
  ] : []

  if (studentLoading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (studentError || !student) {
    return (
      <div className="p-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {studentError instanceof Error ? studentError.message : 'Failed to load student'}
          </AlertDescription>
        </Alert>
        <Button onClick={() => navigate({ to: '/students' })} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Students
        </Button>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <Button
          variant="outline"
          onClick={() => navigate({ to: '/students' })}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Students
        </Button>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
          {student.name}
        </h1>
        <p className="text-muted-foreground mt-2">
          {student.grade_level ? `Grade ${student.grade_level}` : 'No grade level specified'}
          {student.notes && ` • ${student.notes}`}
        </p>
      </div>

      {/* Summary Stats */}
      {metricsLoading ? (
        <Card className="mb-6">
          <CardContent className="py-12">
            <div className="flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      ) : metrics ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Total Essays</p>
                    <p className="text-3xl font-bold">{metrics.stats.total_essays}</p>
                  </div>
                  <FileText className="h-10 w-10 text-blue-600 opacity-60" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Avg Type-Token Ratio</p>
                    <p className="text-3xl font-bold">{metrics.stats.avg_ttr.toFixed(2)}</p>
                  </div>
                  <TrendingUp className="h-10 w-10 text-green-600 opacity-60" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Avg Word Count</p>
                    <p className="text-3xl font-bold">{Math.round(metrics.stats.avg_word_count)}</p>
                  </div>
                  <FileText className="h-10 w-10 text-purple-600 opacity-60" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Trend</p>
                    <div className="flex items-center gap-2">
                      <p className={`text-2xl font-bold capitalize ${getTrendColor()}`}>
                        {metrics.stats.trend}
                      </p>
                      {getTrendIcon()}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Time Series Chart */}
          {timeSeriesData.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-xl">Performance Over Time</CardTitle>
                <CardDescription>Type-Token Ratio and Word Count trends</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={timeSeriesData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="ttr"
                      stroke="#3b82f6"
                      name="Type-Token Ratio"
                      strokeWidth={2}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="wordCount"
                      stroke="#8b5cf6"
                      name="Word Count"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Additional Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <Card>
              <CardHeader>
                <CardTitle>Average Unique Words</CardTitle>
                <CardDescription>Lexical diversity indicator</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold">{Math.round(metrics.stats.avg_unique_words)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Average Word Difficulty</CardTitle>
                <CardDescription>Frequency rank (lower = more common)</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold">{Math.round(metrics.stats.avg_freq_rank)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Last Essay Date */}
          {metrics.stats.last_essay_date && (
            <Card className="mb-6">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Last Essay Submitted</p>
                <p className="text-lg font-semibold">
                  {new Date(metrics.stats.last_essay_date).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Performance Metrics</CardTitle>
            <CardDescription>No metrics available yet</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Metrics will appear here once the student has submitted essays.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Past Assignments Table */}
      <Card>
        <CardHeader>
          <CardTitle>Past Assignments</CardTitle>
          <CardDescription>
            All essays submitted by this student
          </CardDescription>
        </CardHeader>
        <CardContent>
          {metrics && metrics.stats.total_essays > 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                Past assignments table will be displayed here once individual essay data is available.
              </p>
              <p className="text-sm text-muted-foreground">
                Currently showing aggregate metrics. Individual essay breakdown coming soon.
              </p>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                No essays have been submitted yet. Essays will appear here once they are processed.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
