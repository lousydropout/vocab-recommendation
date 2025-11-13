import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { requireAuth } from '../utils/route-protection'
import { useQuery } from '@tanstack/react-query'
import { getStudent, getStudentMetrics } from '../api/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Alert, AlertDescription } from '../components/ui/alert'
import { ArrowLeft, Loader2, AlertCircle, User } from 'lucide-react'

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
          Student Details & Analytics
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Student Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Name</p>
              <p className="text-lg">{student.name}</p>
            </div>
            {student.grade_level && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Grade Level</p>
                <p className="text-lg">Grade {student.grade_level}</p>
              </div>
            )}
            {student.notes && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Notes</p>
                <p className="text-lg">{student.notes}</p>
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-muted-foreground">Created</p>
              <p className="text-lg">
                {new Date(student.created_at).toLocaleDateString()}
              </p>
            </div>
          </CardContent>
        </Card>

        {metricsLoading ? (
          <Card>
            <CardContent className="py-12">
              <div className="flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ) : metrics ? (
          <Card>
            <CardHeader>
              <CardTitle>Performance Metrics</CardTitle>
              <CardDescription>Overall student performance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Average Type-Token Ratio</p>
                <p className="text-2xl font-bold">{metrics.stats.avg_ttr.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Essays</p>
                <p className="text-2xl font-bold">{metrics.stats.total_essays}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Trend</p>
                <p className="text-lg capitalize">{metrics.stats.trend}</p>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Student Analytics</CardTitle>
          <CardDescription>
            Detailed analytics and charts will be implemented in Epic 7.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Charts showing student progress over time will be displayed here.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
