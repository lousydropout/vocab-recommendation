import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { requireAuth } from '../utils/route-protection'
import { useQuery } from '@tanstack/react-query'
import { getStudent, getStudentMetrics, listStudentEssays, listAssignments } from '../api/client'
import type { StudentEssayResponse, AssignmentResponse } from '../api/client'
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

  const { data: essays, isLoading: essaysLoading, error: essaysError } = useQuery<StudentEssayResponse[]>({
    queryKey: ['student-essays', studentId],
    queryFn: () => listStudentEssays(studentId),
    enabled: !!studentId,
  })

  const { data: assignments, isLoading: assignmentsLoading } = useQuery<AssignmentResponse[]>({
    queryKey: ['assignments'],
    queryFn: () => listAssignments(),
  })

  const getTrendIcon = () => {
    if (!metrics || metrics.stats.trend === null) return null
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
    if (!metrics || metrics.stats.trend === null) return 'text-gray-600'
    switch (metrics.stats.trend) {
      case 'improving':
        return 'text-green-600'
      case 'declining':
        return 'text-red-600'
      default:
        return 'text-gray-600'
    }
  }

  // Helper function to safely convert to number
  const toNumber = (value: any): number => {
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
      const parsed = parseFloat(value)
      return isNaN(parsed) ? 0 : parsed
    }
    return 0
  }

  // Build time-series data from real essays
  const timeSeriesData = essays && essays.length >= 2 ? essays.map((essay) => {
    const date = new Date(essay.created_at)
    // Format date as "MMM DD" (e.g., "Jan 15")
    const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return {
      date: formattedDate,
      ttr: toNumber(essay.metrics.type_token_ratio),
      wordCount: toNumber(essay.metrics.word_count),
    }
  }) : []

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
                    <p className="text-3xl font-bold">{toNumber(metrics.stats.avg_ttr).toFixed(2)}</p>
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
                    <p className="text-3xl font-bold">{Math.round(toNumber(metrics.stats.avg_word_count))}</p>
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
                    {metrics.stats.trend === null || toNumber(metrics.stats.total_essays) < 2 ? (
                      <p className="text-sm text-muted-foreground">
                        Trend analysis requires at least 2 essays. Submit more essays to see performance trends.
                      </p>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className={`text-2xl font-bold capitalize ${getTrendColor()}`}>
                          {metrics.stats.trend}
                        </p>
                        {getTrendIcon()}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Time Series Chart */}
          {essaysLoading ? (
            <Card className="mb-6">
              <CardContent className="py-12">
                <div className="flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ) : timeSeriesData.length >= 2 ? (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-xl">Performance Over Time</CardTitle>
                <CardDescription>Type-Token Ratio and Word Count trends from actual essay submissions</CardDescription>
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
          ) : metrics && toNumber(metrics.stats.total_essays) === 1 ? (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-xl">Performance Over Time</CardTitle>
                <CardDescription>Type-Token Ratio and Word Count trends</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    Time-series trends require multiple essays. Submit more essays to see performance over time.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

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
                <p className="text-4xl font-bold">{Math.round(toNumber(metrics.stats.avg_freq_rank))}</p>
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

      {/* Assignments Section */}
      {assignmentsLoading ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      ) : assignments && assignments.length > 0 ? (
        <>
          {/* Submitted Assignments */}
          {(() => {
            const submittedAssignments = assignments.filter((assignment) => {
              const assignmentEssays = essays?.filter(
                (essay) => essay.assignment_id === assignment.assignment_id
              ) || []
              return assignmentEssays.length > 0
            })

            return submittedAssignments.length > 0 ? (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Assignments</CardTitle>
                  <CardDescription>
                    Assignments this student has submitted essays for.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-3 font-semibold">Assignment</th>
                          <th className="text-right p-3 font-semibold">Essays Submitted</th>
                          <th className="text-center p-3 font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {submittedAssignments.map((assignment) => {
                          const assignmentEssays = essays?.filter(
                            (essay) => essay.assignment_id === assignment.assignment_id
                          ) || []

                          return (
                            <tr key={assignment.assignment_id} className="border-b hover:bg-gray-50">
                              <td className="p-3">
                                <button
                                  onClick={() =>
                                    navigate({
                                      to: '/assignments/$assignmentId',
                                      params: { assignmentId: assignment.assignment_id },
                                    })
                                  }
                                  className="text-left font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                                >
                                  {assignment.name}
                                </button>
                                {assignment.description && (
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {assignment.description}
                                  </p>
                                )}
                              </td>
                              <td className="p-3 text-right">
                                <span className="font-medium">{assignmentEssays.length}</span>
                              </td>
                              <td className="p-3 text-center">
                                <div className="flex justify-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      navigate({
                                        to: '/assignments/$assignmentId',
                                        params: { assignmentId: assignment.assignment_id },
                                      })
                                    }
                                  >
                                    View Assignment
                                  </Button>
                                  {assignmentEssays.length === 1 ? (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        navigate({
                                          to: '/essays/$essayId',
                                          params: { essayId: assignmentEssays[0].essay_id },
                                        })
                                      }
                                    >
                                      <FileText className="h-4 w-4 mr-1" />
                                      View Essay
                                    </Button>
                                  ) : assignmentEssays.length > 1 ? (
                                    <div className="flex flex-col gap-1">
                                      {assignmentEssays.map((essay, index) => (
                                        <Button
                                          key={essay.essay_id}
                                          variant="outline"
                                          size="sm"
                                          onClick={() =>
                                            navigate({
                                              to: '/essays/$essayId',
                                              params: { essayId: essay.essay_id },
                                            })
                                          }
                                        >
                                          <FileText className="h-4 w-4 mr-1" />
                                          Essay {index + 1}
                                        </Button>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ) : null
          })()}

          {/* Unsubmitted Assignments */}
          {(() => {
            const unsubmittedAssignments = assignments.filter((assignment) => {
              const assignmentEssays = essays?.filter(
                (essay) => essay.assignment_id === assignment.assignment_id
              ) || []
              return assignmentEssays.length === 0
            })

            return unsubmittedAssignments.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Unsubmitted Assignments</CardTitle>
                  <CardDescription>
                    Assignments this student has not yet submitted essays for.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-3 font-semibold">Assignment</th>
                          <th className="text-center p-3 font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unsubmittedAssignments.map((assignment) => (
                          <tr key={assignment.assignment_id} className="border-b hover:bg-gray-50">
                            <td className="p-3">
                              <button
                                onClick={() =>
                                  navigate({
                                    to: '/assignments/$assignmentId',
                                    params: { assignmentId: assignment.assignment_id },
                                  })
                                }
                                className="text-left font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                              >
                                {assignment.name}
                              </button>
                              {assignment.description && (
                                <p className="text-sm text-muted-foreground mt-1">
                                  {assignment.description}
                                </p>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  navigate({
                                    to: '/assignments/$assignmentId',
                                    params: { assignmentId: assignment.assignment_id },
                                  })
                                }
                              >
                                View Assignment
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ) : null
          })()}
        </>
      ) : (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <p className="text-muted-foreground">
                No assignments found. Create assignments to get started.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
