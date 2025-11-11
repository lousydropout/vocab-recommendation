import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getClassMetrics, getAssignment, type ClassMetricsResponse, type AssignmentResponse } from '@/lib/api';
import { logout } from '@/lib/auth';
import { Loader2, LogOut, BarChart3, TrendingUp, Users, FileText, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export function ClassDashboard() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<ClassMetricsResponse | null>(null);
  const [assignment, setAssignment] = useState<AssignmentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!assignmentId) {
      setError('Assignment ID is required');
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        const [metricsData, assignmentData] = await Promise.all([
          getClassMetrics(assignmentId),
          getAssignment(assignmentId),
        ]);
        setMetrics(metricsData);
        setAssignment(assignmentData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load class metrics');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [assignmentId]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
      navigate('/login');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !metrics || !assignment) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Class Dashboard</h1>
            <Button onClick={handleLogout} variant="outline" size="sm" className="shadow-sm">
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
          <Alert variant="destructive" className="border-2">
            <AlertDescription>{error || 'Failed to load class metrics'}</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  // Prepare data for charts
  const correctnessData = [
    { name: 'Correct', value: metrics.stats.correctness.correct, color: '#10b981' },
    { name: 'Incorrect', value: metrics.stats.correctness.incorrect, color: '#ef4444' },
  ];

  const avgTtrData = [
    { name: 'Average TTR', value: metrics.stats.avg_ttr },
  ];

  const avgFreqRankData = [
    { name: 'Avg Word Difficulty', value: Math.round(metrics.stats.avg_freq_rank) },
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
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Class Dashboard</h1>
              <p className="text-muted-foreground mt-1">Assignment performance metrics</p>
            </div>
          </div>
          <Button onClick={handleLogout} variant="outline" size="sm" className="shadow-sm">
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>

        {/* Assignment Info */}
        <Card className="mb-8 shadow-xl border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <FileText className="h-6 w-6 text-primary" />
              {assignment.name}
            </CardTitle>
            <CardDescription className="text-base">{assignment.description || 'No description'}</CardDescription>
          </CardHeader>
        </Card>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="shadow-lg border-2 hover:shadow-xl transition-shadow">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Total Essays</p>
                  <p className="text-3xl font-bold">{metrics.stats.essay_count}</p>
                </div>
                <Users className="h-10 w-10 text-primary opacity-60" />
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
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Avg Word Difficulty</p>
                  <p className="text-3xl font-bold">{Math.round(metrics.stats.avg_freq_rank)}</p>
                </div>
                <BarChart3 className="h-10 w-10 text-purple-600 opacity-60" />
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-lg border-2 hover:shadow-xl transition-shadow">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Correct Rate</p>
                  <p className="text-3xl font-bold">
                    {metrics.stats.essay_count > 0
                      ? (
                          (metrics.stats.correctness.correct / 
                           (metrics.stats.correctness.correct + metrics.stats.correctness.incorrect)) * 100
                        ).toFixed(1)
                      : '0.0'}%
                  </p>
                </div>
                <CheckCircle2 className="h-10 w-10 text-green-600 opacity-60" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Correctness Distribution Pie Chart */}
          <Card className="shadow-xl border-2">
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
          <Card className="shadow-xl border-2">
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
        <Card className="mt-6 shadow-xl border-2">
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
      </div>
    </div>
  );
}

