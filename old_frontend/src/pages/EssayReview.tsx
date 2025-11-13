import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getEssay, overrideEssayFeedback, type EssayResponse } from '@/lib/api';
import { logout } from '@/lib/auth';
import { Loader2, LogOut, ArrowLeft, Save, CheckCircle2, XCircle, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';

interface FeedbackItem {
  word: string;
  correct: boolean;
  comment: string;
}

export function EssayReview() {
  const { essayId } = useParams<{ essayId: string }>();
  const navigate = useNavigate();
  const [essay, setEssay] = useState<EssayResponse | null>(null);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [originalFeedback, setOriginalFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!essayId) {
      setError('Essay ID is required');
      setLoading(false);
      return;
    }

    const fetchEssay = async () => {
      try {
        setLoading(true);
        const essayData = await getEssay(essayId);
        setEssay(essayData);
        const initialFeedback = essayData.feedback || [];
        setFeedback(initialFeedback);
        setOriginalFeedback(JSON.parse(JSON.stringify(initialFeedback))); // Deep copy
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load essay');
      } finally {
        setLoading(false);
      }
    };

    fetchEssay();
  }, [essayId]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
      navigate('/login');
    }
  };

  const toggleCorrectness = (index: number) => {
    const newFeedback = [...feedback];
    newFeedback[index].correct = !newFeedback[index].correct;
    setFeedback(newFeedback);
  };

  const updateComment = (index: number, comment: string) => {
    const newFeedback = [...feedback];
    newFeedback[index].comment = comment;
    setFeedback(newFeedback);
  };

  const handleSave = async () => {
    if (!essayId) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      await overrideEssayFeedback(essayId, feedback);
      setOriginalFeedback(JSON.parse(JSON.stringify(feedback))); // Update original
      setSuccess('Feedback override saved successfully. Metrics will be recomputed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save feedback override');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = () => {
    return JSON.stringify(feedback) !== JSON.stringify(originalFeedback);
  };

  const renderEssayWithFeedback = () => {
    if (!essay || !essay.feedback || essay.feedback.length === 0) {
      return <p className="text-gray-600">No feedback available for this essay.</p>;
    }

    // For simplicity, we'll show the feedback items in a list
    // In a production app, you'd want to highlight words in the actual essay text
    return (
      <div className="space-y-3">
        {feedback.map((item, index) => (
          <Card
            key={index}
            className={`border-2 shadow-md hover:shadow-lg transition-shadow ${
              item.correct
                ? 'border-green-300 bg-green-50/50 hover:bg-green-50'
                : 'border-red-300 bg-red-50/50 hover:bg-red-50'
            }`}
          >
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl font-bold">{item.word}</span>
                    <button
                      onClick={() => toggleCorrectness(index)}
                      className={`px-3 py-1 rounded-md text-sm font-semibold transition-colors ${
                        item.correct
                          ? 'bg-green-600 text-white hover:bg-green-700'
                          : 'bg-red-600 text-white hover:bg-red-700'
                      }`}
                    >
                      {item.correct ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 inline mr-1" />
                          Correct
                        </>
                      ) : (
                        <>
                          <XCircle className="h-4 w-4 inline mr-1" />
                          Incorrect
                        </>
                      )}
                    </button>
                  </div>
                  {editingIndex === index ? (
                    <div className="space-y-2">
                      <Textarea
                        value={item.comment}
                        onChange={(e) => updateComment(index, e.target.value)}
                        rows={3}
                        className="w-full"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => setEditingIndex(null)}
                        >
                          Done
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-gray-700">{item.comment}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2"
                        onClick={() => setEditingIndex(index)}
                      >
                        <Edit2 className="h-3 w-3 mr-1" />
                        Edit Comment
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !essay) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Essay Review</h1>
            <Button onClick={handleLogout} variant="outline" size="sm" className="shadow-sm">
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
          <Alert variant="destructive" className="border-2">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  if (!essay) {
    return null;
  }

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
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Essay Review</h1>
              <p className="text-muted-foreground mt-1">Review and override AI-generated feedback</p>
            </div>
          </div>
          <Button onClick={handleLogout} variant="outline" size="sm" className="shadow-sm">
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>

        {/* Alerts */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert className="mb-6 border-green-500 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        {/* Essay Info */}
        <Card className="mb-8 shadow-xl border-2">
          <CardHeader>
            <CardTitle>Essay ID: {essay.essay_id}</CardTitle>
            <CardDescription>
              Status: {essay.status} • Created: {essay.created_at ? new Date(essay.created_at).toLocaleString() : 'N/A'}
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Metrics Summary */}
        {essay.metrics && (
          <Card className="mb-6 shadow-xl border-2">
            <CardHeader>
              <CardTitle>Metrics Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Word Count</p>
                  <p className="text-2xl font-bold">{essay.metrics.word_count}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Unique Words</p>
                  <p className="text-2xl font-bold">{essay.metrics.unique_words}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Type-Token Ratio</p>
                  <p className="text-2xl font-bold">{essay.metrics.type_token_ratio.toFixed(2)}</p>
                </div>
                {essay.metrics.avg_word_freq_rank && (
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Frequency Rank</p>
                    <p className="text-2xl font-bold">{Math.round(essay.metrics.avg_word_freq_rank)}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Feedback Section */}
        <Card className="mb-6 shadow-xl">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Word-Level Feedback</CardTitle>
                <CardDescription>
                  Review and override AI-generated feedback. Changes will trigger metric recomputation.
                </CardDescription>
              </div>
              {hasChanges() && (
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {renderEssayWithFeedback()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

