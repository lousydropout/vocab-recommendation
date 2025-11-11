import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadEssay, getEssay, listAssignments, listStudents, type EssayResponse, type AssignmentResponse, type StudentResponse } from '@/lib/api';
import { logout } from '@/lib/auth';
import { Loader2, Upload, FileText, CheckCircle2, AlertCircle, LogOut, BarChart3, Users, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';

export function Dashboard() {
  const navigate = useNavigate();
  const [essayText, setEssayText] = useState('');
  const [essayId, setEssayId] = useState<string | null>(null);
  const [essayData, setEssayData] = useState<EssayResponse | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<AssignmentResponse[]>([]);
  const [students, setStudents] = useState<StudentResponse[]>([]);
  const [loadingNav, setLoadingNav] = useState(true);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
      // Still navigate to login even if logout fails
      navigate('/login');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!essayText.trim()) {
      setError('Please enter some essay text');
      return;
    }

    setIsUploading(true);
    setError(null);
    setEssayData(null);

    try {
      const response = await uploadEssay(essayText);
      setEssayId(response.essay_id);
      setEssayData(response);
      setIsPolling(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload essay');
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    // Load assignments and students for navigation
    const loadNavigation = async () => {
      try {
        setLoadingNav(true);
        const [assignmentsData, studentsData] = await Promise.all([
          listAssignments().catch(() => []),
          listStudents().catch(() => []),
        ]);
        setAssignments(assignmentsData);
        setStudents(studentsData);
      } catch (err) {
        console.error('Failed to load navigation data:', err);
      } finally {
        setLoadingNav(false);
      }
    };
    loadNavigation();
  }, []);

  useEffect(() => {
    if (!essayId || !isPolling) return;

    const pollInterval = setInterval(async () => {
      try {
        const data = await getEssay(essayId);
        setEssayData(data);

        if (data.status === 'processed') {
          setIsPolling(false);
          clearInterval(pollInterval);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch essay status');
        setIsPolling(false);
        clearInterval(pollInterval);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }, [essayId, isPolling]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header with Logout */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-5xl font-extrabold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Vocabulary Essay Analyzer
            </h1>
            <p className="text-gray-600 mt-2 text-lg font-medium">AI-powered vocabulary analysis for educators</p>
          </div>
          <Button
            onClick={handleLogout}
            variant="outline"
            size="sm"
            className="shadow-sm hover:bg-gray-100 hover:border-gray-400 transition-all"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Assignments */}
          <Card className="shadow-lg border-2 bg-white/90 backdrop-blur-sm hover:shadow-xl hover:border-blue-300 transition-all">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-bold">
                <BookOpen className="h-5 w-5 text-blue-600" />
                Assignments
              </CardTitle>
              <CardDescription className="text-gray-600">View class metrics for assignments</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingNav ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : assignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No assignments yet</p>
              ) : (
                <div className="space-y-2">
                  {assignments.slice(0, 5).map((assignment) => (
                    <Button
                      key={assignment.assignment_id}
                      variant="outline"
                      className="w-full justify-start hover:bg-blue-100 hover:border-blue-300 transition-all"
                      onClick={() => navigate(`/assignments/${assignment.assignment_id}`)}
                    >
                      <BarChart3 className="h-4 w-4 mr-2 text-blue-600" />
                      <span className="font-medium">{assignment.name}</span>
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Students */}
          <Card className="shadow-lg border-2 bg-white/90 backdrop-blur-sm hover:shadow-xl hover:border-indigo-300 transition-all">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-bold">
                <Users className="h-5 w-5 text-indigo-600" />
                Students
              </CardTitle>
              <CardDescription className="text-gray-600">View student performance metrics</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingNav ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : students.length === 0 ? (
                <p className="text-sm text-muted-foreground">No students yet</p>
              ) : (
                <div className="space-y-2">
                  {students.slice(0, 5).map((student) => (
                    <Button
                      key={student.student_id}
                      variant="outline"
                      className="w-full justify-start hover:bg-indigo-100 hover:border-indigo-300 transition-all"
                      onClick={() => navigate(`/students/${student.student_id}`)}
                    >
                      <Users className="h-4 w-4 mr-2 text-indigo-600" />
                      <span className="font-medium">{student.name}</span>
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-xl border-2 bg-white/80 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Analyze New Essay
            </CardTitle>
            <CardDescription className="text-base mt-2 text-gray-600">
              Paste your essay text below to receive comprehensive vocabulary analysis and AI-powered feedback
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-6">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {!essayData ? (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label htmlFor="essay" className="text-sm font-semibold text-foreground">
                    Essay Text
                  </label>
                  <Textarea
                    id="essay"
                    rows={14}
                    value={essayText}
                    onChange={(e) => setEssayText(e.target.value)}
                    placeholder="Paste your essay here... The AI will analyze vocabulary usage, word difficulty, and provide detailed feedback on each word."
                    disabled={isUploading}
                    className="font-mono text-sm resize-none border-2 focus:border-blue-400 focus:ring-2 focus:ring-blue-200 transition-all"
                  />
                  <p className="text-xs text-muted-foreground">
                    {essayText.length} characters
                  </p>
                </div>
                <Button
                  type="submit"
                  disabled={isUploading || !essayText.trim()}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg hover:shadow-xl transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  size="lg"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading and Processing...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Analyze Essay
                    </>
                  )}
                </Button>
              </form>
            ) : (
              <div className="space-y-6">
                {/* Status Indicator */}
                <Alert className={`${
                  essayData.status === 'processed' 
                    ? 'border-green-400 bg-gradient-to-r from-green-50 to-emerald-50 shadow-sm' 
                    : 'border-blue-400 bg-gradient-to-r from-blue-50 to-cyan-50 shadow-sm'
                }`}>
                  <div className="flex items-center gap-4">
                    {essayData.status === 'processed' ? (
                      <>
                        <div className="flex-shrink-0">
                          <CheckCircle2 className="h-6 w-6 text-green-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-green-900 text-base">Processing Complete</p>
                          <p className="text-sm text-green-700 mt-0.5">Your essay has been analyzed successfully</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex-shrink-0">
                          <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
                        </div>
                        <div>
                          <p className="font-semibold text-blue-900 text-base">
                            {essayData.status === 'processing' ? 'Processing...' : 'Queued for Processing'}
                          </p>
                          <p className="text-sm text-blue-700 mt-0.5">
                            {essayData.status === 'processing' 
                              ? 'Analyzing your essay with AI' 
                              : 'Your essay is in the queue'}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </Alert>

                {/* Metrics */}
                {essayData.metrics && (
                  <Card className="border-2">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-xl">
                        <FileText className="h-5 w-5 text-primary" />
                        Essay Metrics
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-5 rounded-lg border border-blue-200">
                          <p className="text-xs font-medium text-blue-700 uppercase tracking-wide mb-1">Word Count</p>
                          <p className="text-3xl font-bold text-blue-900">{essayData.metrics.word_count}</p>
                        </div>
                        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 p-5 rounded-lg border border-indigo-200">
                          <p className="text-xs font-medium text-indigo-700 uppercase tracking-wide mb-1">Unique Words</p>
                          <p className="text-3xl font-bold text-indigo-900">{essayData.metrics.unique_words}</p>
                        </div>
                        <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-5 rounded-lg border border-purple-200">
                          <p className="text-xs font-medium text-purple-700 uppercase tracking-wide mb-1">Type-Token Ratio</p>
                          <p className="text-3xl font-bold text-purple-900">
                            {essayData.metrics.type_token_ratio.toFixed(2)}
                          </p>
                        </div>
                        {essayData.metrics.avg_word_freq_rank && (
                          <div className="bg-gradient-to-br from-pink-50 to-pink-100 p-5 rounded-lg border border-pink-200">
                            <p className="text-xs font-medium text-pink-700 uppercase tracking-wide mb-1">Avg Frequency</p>
                            <p className="text-3xl font-bold text-pink-900">
                              {Math.round(essayData.metrics.avg_word_freq_rank)}
                            </p>
                          </div>
                        )}
                      </div>
                      {essayData.metrics.noun_ratio && (
                        <div className="mt-6 pt-6 border-t border-border">
                          <p className="text-sm font-semibold mb-4 text-foreground">Part of Speech Distribution</p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="text-center p-3 bg-slate-50 rounded-lg">
                              <p className="text-xs font-medium text-slate-600 mb-1">Nouns</p>
                              <p className="text-2xl font-bold text-slate-900">{(essayData.metrics.noun_ratio * 100).toFixed(1)}%</p>
                            </div>
                            <div className="text-center p-3 bg-slate-50 rounded-lg">
                              <p className="text-xs font-medium text-slate-600 mb-1">Verbs</p>
                              <p className="text-2xl font-bold text-slate-900">{(essayData.metrics.verb_ratio! * 100).toFixed(1)}%</p>
                            </div>
                            {essayData.metrics.adj_ratio && (
                              <div className="text-center p-3 bg-slate-50 rounded-lg">
                                <p className="text-xs font-medium text-slate-600 mb-1">Adjectives</p>
                                <p className="text-2xl font-bold text-slate-900">{(essayData.metrics.adj_ratio * 100).toFixed(1)}%</p>
                              </div>
                            )}
                            {essayData.metrics.adv_ratio && (
                              <div className="text-center p-3 bg-slate-50 rounded-lg">
                                <p className="text-xs font-medium text-slate-600 mb-1">Adverbs</p>
                                <p className="text-2xl font-bold text-slate-900">{(essayData.metrics.adv_ratio * 100).toFixed(1)}%</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Feedback */}
                {essayData.feedback && essayData.feedback.length > 0 && (
                  <Card className="border-2">
                    <CardHeader>
                      <CardTitle className="text-xl">Word-Level Feedback</CardTitle>
                      <CardDescription>
                        Detailed analysis of vocabulary usage in your essay
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {essayData.feedback.map((item, index) => (
                          <Alert
                            key={index}
                            variant={item.correct ? 'default' : 'destructive'}
                            className={`${
                              item.correct 
                                ? 'border-green-300 bg-green-50/50 hover:bg-green-50 transition-colors' 
                                : 'border-red-300 bg-red-50/50 hover:bg-red-50 transition-colors'
                            }`}
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <span className={`text-xl font-bold ${
                                  item.correct ? 'text-green-700' : 'text-red-700'
                                }`}>
                                  {item.word}
                                </span>
                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                  item.correct 
                                    ? 'bg-green-200 text-green-800' 
                                    : 'bg-red-200 text-red-800'
                                }`}>
                                  {item.correct ? '✓ Correct' : '✗ Needs Review'}
                                </span>
                              </div>
                              {item.comment && (
                                <AlertDescription className="mt-1 text-sm">
                                  {item.comment}
                                </AlertDescription>
                              )}
                            </div>
                          </Alert>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Actions */}
                <div className="flex gap-4 pt-4">
                  {essayData.status === 'processed' && (
                    <Button
                      onClick={() => navigate(`/essays/${essayId}`)}
                      variant="default"
                      className="flex-1 shadow-md hover:shadow-lg transition-shadow"
                      size="lg"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Review & Override Feedback
                    </Button>
                  )}
                  <Button
                    onClick={() => {
                      setEssayText('');
                      setEssayId(null);
                      setEssayData(null);
                      setError(null);
                      setIsPolling(false);
                    }}
                    variant="secondary"
                    className="flex-1 shadow-sm hover:shadow-md transition-shadow"
                    size="lg"
                  >
                    Analyze Another Essay
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

