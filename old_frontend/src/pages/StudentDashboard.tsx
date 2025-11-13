import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getStudentMetrics, getStudent, type StudentMetricsResponse, type StudentResponse } from '@/lib/api';
import { logout } from '@/lib/auth';
import { Loader2, LogOut, TrendingUp, TrendingDown, Minus, ArrowLeft, User, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export function StudentDashboard() {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<StudentMetricsResponse | null>(null);
  const [student, setStudent] = useState<StudentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) {
      setError('Student ID is required');
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        const [metricsData, studentData] = await Promise.all([
          getStudentMetrics(studentId),
          getStudent(studentId),
        ]);
        setMetrics(metricsData);
        setStudent(studentData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load student metrics');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [studentId]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
      navigate('/login');
    }
  };

  const getTrendIcon = () => {
    if (!metrics) return null;
    switch (metrics.stats.trend) {
      case 'improving':
        return <TrendingUp className="h-5 w-5 text-green-600" />;
      case 'declining':
        return <TrendingDown className="h-5 w-5 text-red-600" />;
      default:
        return <Minus className="h-5 w-5 text-gray-600" />;
    }
  };

  const getTrendColor = () => {
    if (!metrics) return 'text-gray-600';
    switch (metrics.stats.trend) {
      case 'improving':
        return 'text-green-600';
      case 'declining':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !metrics || !student) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Student Dashboard</h1>
            <Button onClick={handleLogout} variant="outline" size="sm" className="shadow-sm">
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
          <Alert variant="destructive" className="border-2">
            <AlertDescription>{error || 'Failed to load student metrics'}</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  // Mock time-series data (in production, this would come from the API)
  // For now, we'll show a simple representation
  const timeSeriesData = [
    { date: 'Week 1', ttr: metrics.stats.avg_ttr * 0.9, wordCount: metrics.stats.avg_word_count * 0.9 },
    { date: 'Week 2', ttr: metrics.stats.avg_ttr * 0.95, wordCount: metrics.stats.avg_word_count * 0.95 },
    { date: 'Week 3', ttr: metrics.stats.avg_ttr, wordCount: metrics.stats.avg_word_count },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => navigate('/')}
              variant="outline"
              size="sm"
              className="shadow-sm"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Student Dashboard</h1>
              <p className="text-muted-foreground mt-1">Individual student performance tracking</p>
            </div>
          </div>
          <Button onClick={handleLogout} variant="outline" size="sm" className="shadow-sm">
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>

        {/* Student Info */}
        <Card className="mb-8 shadow-xl border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <User className="h-6 w-6 text-primary" />
              {student.name}
            </CardTitle>
            <CardDescription className="text-base">
              {student.grade_level ? `Grade ${student.grade_level}` : 'No grade level specified'}
              {student.notes && ` • ${student.notes}`}
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="shadow-lg border-2 hover:shadow-xl transition-shadow">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Total Essays</p>
                  <p className="text-3xl font-bold">{metrics.stats.total_essays}</p>
                </div>
                <FileText className="h-10 w-10 text-primary opacity-60" />
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-lg border-2 hover:shadow-xl transition-shadow">
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
          <Card className="shadow-lg border-2 hover:shadow-xl transition-shadow">
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
          <Card className="shadow-lg border-2 hover:shadow-xl transition-shadow">
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
        <Card className="mb-6 shadow-xl border-2">
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

        {/* Additional Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="shadow-xl border-2">
            <CardHeader>
              <CardTitle>Average Unique Words</CardTitle>
              <CardDescription>Lexical diversity indicator</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold">{Math.round(metrics.stats.avg_unique_words)}</p>
            </CardContent>
          </Card>
          <Card className="shadow-xl border-2">
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
          <Card className="mt-6 shadow-xl">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Last Essay Submitted</p>
              <p className="text-lg font-semibold">
                {new Date(metrics.stats.last_essay_date).toLocaleDateString()}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

