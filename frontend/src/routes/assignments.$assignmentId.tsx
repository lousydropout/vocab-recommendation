import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { requireAuth } from '../utils/route-protection'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getAssignment, getClassMetrics, getAssignmentUploadUrl, listStudents, getStudentMetrics } from '../api/client'
import type { AssignmentResponse, StudentResponse, StudentMetricsResponse } from '../types/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Alert, AlertDescription } from '../components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { ArrowLeft, Loader2, AlertCircle, Upload, BarChart3, Users, TrendingUp, CheckCircle2 } from 'lucide-react'
import { useState, useCallback, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

// Helper function to safely convert to number
function toNumber(value: any): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = parseFloat(value)
    return isNaN(parsed) ? 0 : parsed
  }
  return 0
}

export const Route = createFileRoute('/assignments/$assignmentId')({
  beforeLoad: async () => {
    await requireAuth()
  },
  component: AssignmentDetailPage,
  errorComponent: ({ error }) => {
    console.error('Assignment detail page error:', error)
    return (
      <div className="p-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load assignment detail page: {error instanceof Error ? error.message : String(error)}
          </AlertDescription>
        </Alert>
        <Button onClick={() => window.location.reload()} className="mt-4">
          Reload Page
        </Button>
      </div>
    )
  },
})

function AssignmentDetailPage() {
  const { assignmentId } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  
  // Debug: Log to ensure component is rendering
  console.log('AssignmentDetailPage rendering with assignmentId:', assignmentId)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  // Load uploaded files from localStorage on mount
  const [uploadedFiles, setUploadedFiles] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(`uploaded-files-${assignmentId}`)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })
  
  const { data: assignment, isLoading: assignmentLoading, error: assignmentError } = useQuery<AssignmentResponse>({
    queryKey: ['assignment', assignmentId],
    queryFn: () => {
      console.log('Fetching assignment:', assignmentId)
      return getAssignment(assignmentId)
    },
    retry: 1,
  })
  
  // Log errors separately
  if (assignmentError) {
    console.error('Error fetching assignment:', assignmentError)
  }

  const { data: metrics, isLoading: metricsLoading, error: metricsError } = useQuery({
    queryKey: ['class-metrics', assignmentId],
    queryFn: () => getClassMetrics(assignmentId),
    enabled: !!assignmentId && !!assignment,
    retry: 1,
    refetchInterval: (query) => {
      // Auto-refresh metrics every 10 seconds if we have essays but they might still be processing
      const data = query.state.data as typeof metrics
      if (data && data.stats && toNumber(data.stats.essay_count) > 0) {
        return 10000 // 10 seconds
      }
      return false
    },
  })

  // Fetch students to show individual results
  const { data: students, isLoading: studentsLoading } = useQuery<StudentResponse[]>({
    queryKey: ['students'],
    queryFn: () => listStudents(),
    enabled: !!metrics && toNumber(metrics.stats.essay_count) > 0,
  })
  
  // Save uploaded files to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(`uploaded-files-${assignmentId}`, JSON.stringify(uploadedFiles))
    } catch {
      // Ignore localStorage errors
    }
  }, [uploadedFiles, assignmentId])
  
  // Clear uploaded files when metrics show they've been processed
  useEffect(() => {
    if (metrics && metrics.stats.essay_count > 0 && uploadedFiles.length > 0) {
      // Clear the list after a delay to show they've been processed
      const timer = setTimeout(() => {
        setUploadedFiles([])
      }, 60000) // Clear after 1 minute
      return () => clearTimeout(timer)
    }
  }, [metrics, uploadedFiles.length])

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleFiles = useCallback(async (files: File[]) => {
    setIsUploading(true)
    setUploadError(null)
    setUploadSuccess(null)

    try {
      // Filter for .txt files or .zip files
      const validFiles = files.filter(
        (file) => file.name.endsWith('.txt') || file.name.endsWith('.zip')
      )

      if (validFiles.length === 0) {
        setUploadError('Please upload .txt files or a .zip archive')
        setIsUploading(false)
        return
      }

      const uploadedFileNames: string[] = []
      
      // Upload each file
      for (const file of validFiles) {
        try {
          // Get presigned URL
          const uploadData = await getAssignmentUploadUrl(assignmentId, file.name)

          // Upload to S3 using presigned URL
          const uploadResponse = await fetch(uploadData.presigned_url, {
            method: 'PUT',
            body: file,
            headers: {
              'Content-Type': file.type || 'text/plain',
            },
          })

          if (!uploadResponse.ok) {
            throw new Error(`Failed to upload ${file.name}`)
          }
          
          uploadedFileNames.push(file.name)
        } catch (err) {
          console.error(`Error uploading ${file.name}:`, err)
          setUploadError(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
        }
      }

      if (uploadedFileNames.length > 0) {
        setUploadedFiles(prev => [...prev, ...uploadedFileNames])
        setUploadSuccess(`Successfully uploaded ${uploadedFileNames.length} file(s). Processing will begin shortly.`)
        // Invalidate metrics query to trigger refresh
        queryClient.invalidateQueries({ queryKey: ['class-metrics', assignmentId] })
        // Also set up delayed refreshes to check for updates
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['class-metrics', assignmentId] })
        }, 5000)
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['class-metrics', assignmentId] })
        }, 15000)
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to upload files')
    } finally {
      setIsUploading(false)
    }
  }, [assignmentId, queryClient])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files))
    }
  }, [handleFiles])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files))
    }
  }, [handleFiles])

  if (assignmentLoading) {
    return (
      <div className="p-8">
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Loading assignment...</p>
        </div>
      </div>
    )
  }

  if (assignmentError) {
    return (
      <div className="p-8">
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {assignmentError instanceof Error ? assignmentError.message : 'Failed to load assignment'}
          </AlertDescription>
        </Alert>
        <Button onClick={() => navigate({ to: '/assignments' })}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Assignments
        </Button>
      </div>
    )
  }

  if (!assignment) {
    return (
      <div className="p-8">
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Assignment not found
          </AlertDescription>
        </Alert>
        <Button onClick={() => navigate({ to: '/assignments' })}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Assignments
        </Button>
      </div>
    )
  }

  // Component to render a student row with their metrics
  function StudentRow({ student }: { student: StudentResponse }) {
    const { data: studentMetrics, isLoading } = useQuery<StudentMetricsResponse>({
      queryKey: ['student-metrics', student.student_id],
      queryFn: () => getStudentMetrics(student.student_id),
      enabled: !!student.student_id,
    })

    const handleStudentClick = () => {
      navigate({ 
        to: '/students/$studentId',
        params: { studentId: student.student_id }
      })
    }

    if (isLoading) {
      return (
        <tr className="border-b">
          <td className="p-3">
            <button
              onClick={handleStudentClick}
              className="text-left font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
            >
              {student.name}
            </button>
          </td>
          <td colSpan={4} className="p-3 text-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground inline" />
          </td>
        </tr>
      )
    }

    if (!studentMetrics || toNumber(studentMetrics.stats.total_essays) === 0) {
      return (
        <tr className="border-b">
          <td className="p-3">
            <button
              onClick={handleStudentClick}
              className="text-left font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
            >
              {student.name}
            </button>
          </td>
          <td colSpan={4} className="p-3 text-center text-muted-foreground text-sm">
            No essays submitted
          </td>
        </tr>
      )
    }

    return (
      <tr className="border-b hover:bg-gray-50">
        <td className="p-3">
          <button
            onClick={handleStudentClick}
            className="text-left font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
          >
            {student.name}
          </button>
        </td>
        <td className="p-3 text-right">{toNumber(studentMetrics.stats.total_essays)}</td>
        <td className="p-3 text-right">{toNumber(studentMetrics.stats.avg_ttr).toFixed(2)}</td>
        <td className="p-3 text-right">{Math.round(toNumber(studentMetrics.stats.avg_word_count))}</td>
        <td className="p-3 text-right">{Math.round(toNumber(studentMetrics.stats.avg_freq_rank))}</td>
      </tr>
    )
  }

  // Prepare chart data (with defensive checks)
  const correctnessData = metrics?.stats?.correctness ? [
    { name: 'Correct', value: toNumber(metrics.stats.correctness.correct), color: '#10b981' },
    { name: 'Incorrect', value: toNumber(metrics.stats.correctness.incorrect), color: '#ef4444' },
  ] : []

  const avgTtrData = metrics?.stats?.avg_ttr !== undefined ? [
    { name: 'Average TTR', value: toNumber(metrics.stats.avg_ttr) },
  ] : []

  const avgFreqRankData = metrics?.stats?.avg_freq_rank !== undefined ? [
    { name: 'Avg Word Difficulty', value: Math.round(toNumber(metrics.stats.avg_freq_rank)) },
  ] : []

  const correctRate = metrics?.stats && metrics.stats.essay_count > 0 && metrics.stats.correctness
    ? ((toNumber(metrics.stats.correctness.correct) / 
        (toNumber(metrics.stats.correctness.correct) + toNumber(metrics.stats.correctness.incorrect))) * 100).toFixed(1)
    : '0.0'

  return (
    <div className="p-8">
      <div className="mb-8">
        <Button
          variant="outline"
          onClick={() => navigate({ to: '/assignments' })}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Assignments
        </Button>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
          {assignment.name}
        </h1>
        <p className="text-muted-foreground mt-2">
          {assignment.description || 'No description'}
        </p>
      </div>

      {/* Upload Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Essays
          </CardTitle>
          <CardDescription>
            Upload .txt files or a .zip archive containing multiple essays
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Upload Status */}
          {uploadedFiles.length > 0 && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm font-medium text-blue-900 mb-2">
                Recently Uploaded ({uploadedFiles.length} file{uploadedFiles.length !== 1 ? 's' : ''})
              </p>
              <div className="flex flex-wrap gap-2">
                {uploadedFiles.slice(-5).map((fileName, idx) => (
                  <span key={idx} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    {fileName}
                  </span>
                ))}
                {uploadedFiles.length > 5 && (
                  <span className="text-xs text-blue-600">
                    +{uploadedFiles.length - 5} more
                  </span>
                )}
              </div>
              <p className="text-xs text-blue-700 mt-2">
                Files are being processed. Metrics will update automatically once processing completes (usually 30-60 seconds).
              </p>
            </div>
          )}
          {uploadError && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{uploadError}</AlertDescription>
            </Alert>
          )}

          {uploadSuccess && (
            <Alert className="mb-4 border-green-500 bg-green-50">
              <AlertCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">{uploadSuccess}</AlertDescription>
            </Alert>
          )}

          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`
              border-2 border-dashed rounded-lg p-12 text-center transition-colors
              ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'}
              ${isUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-blue-400 hover:bg-blue-50/50'}
            `}
          >
            <input
              type="file"
              id="file-upload"
              multiple
              accept=".txt,.zip"
              onChange={handleFileInput}
              disabled={isUploading}
              className="hidden"
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              {isUploading ? (
                <div className="flex flex-col items-center">
                  <Loader2 className="h-12 w-12 animate-spin text-blue-600 mb-4" />
                  <p className="text-lg font-medium">Uploading...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <Upload className="h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-lg font-medium mb-2">
                    Drag and drop files here, or click to select
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Supports .txt files and .zip archives
                  </p>
                </div>
              )}
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Analytics Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="students">By Student</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {metricsError && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Failed to load metrics: {metricsError instanceof Error ? metricsError.message : 'Unknown error'}
              </AlertDescription>
            </Alert>
          )}
          {metricsLoading ? (
            <Card>
              <CardContent className="py-12">
                <div className="flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ) : metrics ? (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Total Essays</p>
                        <p className="text-3xl font-bold">{metrics.stats.essay_count}</p>
                      </div>
                      <Users className="h-10 w-10 text-blue-600 opacity-60" />
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
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Avg Word Difficulty</p>
                        <p className="text-3xl font-bold">{Math.round(toNumber(metrics.stats.avg_freq_rank))}</p>
                      </div>
                      <BarChart3 className="h-10 w-10 text-purple-600 opacity-60" />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Correct Rate</p>
                        <p className="text-3xl font-bold">{correctRate}%</p>
                      </div>
                      <CheckCircle2 className="h-10 w-10 text-green-600 opacity-60" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Correctness Distribution Pie Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-xl">Correctness Distribution</CardTitle>
                    <CardDescription>Percentage of correct vs incorrect word usage</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={correctnessData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name}: ${percent ? (percent * 100).toFixed(0) : 0}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {correctnessData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Average TTR Bar Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-xl">Average Type-Token Ratio</CardTitle>
                    <CardDescription>Lexical diversity measure (higher is better)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={avgTtrData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis domain={[0, 1]} />
                        <Tooltip />
                        <Bar dataKey="value" fill="#3b82f6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Word Difficulty Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">Average Word Difficulty (Frequency Rank)</CardTitle>
                  <CardDescription>Lower rank = more common words, Higher rank = more advanced vocabulary</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={avgFreqRankData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="value" fill="#8b5cf6" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <p className="text-xs text-muted-foreground text-center">
                Last updated: {new Date(metrics.updated_at).toLocaleString()}
              </p>
            </>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Class Metrics</CardTitle>
                <CardDescription>
                  Metrics will appear here once essays are processed
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Upload essays to see class-wide statistics and analytics.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="students" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Student Results</CardTitle>
              <CardDescription>
                Individual student performance for this assignment
              </CardDescription>
            </CardHeader>
            <CardContent>
              {metricsLoading ? (
                <div className="text-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Loading metrics...</p>
                </div>
              ) : metrics && toNumber(metrics.stats.essay_count) > 0 ? (
                <div className="space-y-4">
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm font-medium text-green-900 mb-1">
                      {toNumber(metrics.stats.essay_count)} essay{toNumber(metrics.stats.essay_count) !== 1 ? 's' : ''} processed
                    </p>
                    <p className="text-xs text-green-700">
                      Essays have been analyzed and metrics are available.
                    </p>
                  </div>
                  
                  {studentsLoading ? (
                    <div className="text-center py-4">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Loading student data...</p>
                    </div>
                  ) : students && students.length > 0 ? (
                    <div className="space-y-4">
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left p-3 font-semibold">Student</th>
                              <th className="text-right p-3 font-semibold">Essays</th>
                              <th className="text-right p-3 font-semibold">Avg TTR</th>
                              <th className="text-right p-3 font-semibold">Avg Word Count</th>
                              <th className="text-right p-3 font-semibold">Avg Difficulty</th>
                            </tr>
                          </thead>
                          <tbody>
                            {students.map((student) => (
                              <StudentRow key={student.student_id} student={student} />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-muted-foreground">
                        No students found. Students will appear here once they submit essays.
                      </p>
                    </div>
                  )}
                </div>
              ) : uploadedFiles.length > 0 ? (
                <div className="text-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-2">
                    Essays are being processed...
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Processing typically takes 30-60 seconds per essay. This page will update automatically.
                  </p>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    No essays have been processed yet. Upload essays to see student results.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
