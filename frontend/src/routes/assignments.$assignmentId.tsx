import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { requireAuth } from '../utils/route-protection'
import { useQuery } from '@tanstack/react-query'
import { getAssignment, getClassMetrics, getAssignmentUploadUrl } from '../api/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Alert, AlertDescription } from '../components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { ArrowLeft, Loader2, AlertCircle, Upload, BarChart3, Users, TrendingUp, CheckCircle2 } from 'lucide-react'
import { useState, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

export const Route = createFileRoute('/assignments/$assignmentId')({
  beforeLoad: async () => {
    await requireAuth()
  },
  component: AssignmentDetailPage,
})

function AssignmentDetailPage() {
  const { assignmentId } = Route.useParams()
  const navigate = useNavigate()
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)

  const { data: assignment, isLoading: assignmentLoading, error: assignmentError } = useQuery({
    queryKey: ['assignment', assignmentId],
    queryFn: () => getAssignment(assignmentId),
  })

  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['class-metrics', assignmentId],
    queryFn: () => getClassMetrics(assignmentId),
    enabled: !!assignmentId,
  })

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files))
    }
  }, [])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files))
    }
  }, [])

  const handleFiles = async (files: File[]) => {
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
        } catch (err) {
          console.error(`Error uploading ${file.name}:`, err)
          setUploadError(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
        }
      }

      if (validFiles.length > 0) {
        setUploadSuccess(`Successfully uploaded ${validFiles.length} file(s). Processing will begin shortly.`)
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to upload files')
    } finally {
      setIsUploading(false)
    }
  }

  if (assignmentLoading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (assignmentError || !assignment) {
    return (
      <div className="p-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {assignmentError instanceof Error ? assignmentError.message : 'Failed to load assignment'}
          </AlertDescription>
        </Alert>
        <Button onClick={() => navigate({ to: '/assignments' })} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Assignments
        </Button>
      </div>
    )
  }

  // Prepare chart data
  const correctnessData = metrics ? [
    { name: 'Correct', value: metrics.stats.correctness.correct, color: '#10b981' },
    { name: 'Incorrect', value: metrics.stats.correctness.incorrect, color: '#ef4444' },
  ] : []

  const avgTtrData = metrics ? [
    { name: 'Average TTR', value: metrics.stats.avg_ttr },
  ] : []

  const avgFreqRankData = metrics ? [
    { name: 'Avg Word Difficulty', value: Math.round(metrics.stats.avg_freq_rank) },
  ] : []

  const correctRate = metrics && metrics.stats.essay_count > 0
    ? ((metrics.stats.correctness.correct / 
        (metrics.stats.correctness.correct + metrics.stats.correctness.incorrect)) * 100).toFixed(1)
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
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Avg Word Difficulty</p>
                        <p className="text-3xl font-bold">{Math.round(metrics.stats.avg_freq_rank)}</p>
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
              {metrics && metrics.stats.essay_count > 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">
                    Student results table will be displayed here once individual essay data is available.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Currently showing aggregate metrics. Individual student breakdown coming soon.
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
