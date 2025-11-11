import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadEssay, getEssay, type EssayResponse } from '@/lib/api';
import { logout } from '@/lib/auth';
import { Loader2, Upload, FileText, CheckCircle2, AlertCircle, LogOut } from 'lucide-react';
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header with Logout */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Vocabulary Essay Analyzer</h1>
          <Button
            onClick={handleLogout}
            variant="outline"
            size="sm"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>

        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle className="text-4xl">Vocabulary Essay Analyzer</CardTitle>
            <CardDescription className="text-base">
              Upload your essay to receive vocabulary analysis and feedback
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
                  <label htmlFor="essay" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Essay Text
                  </label>
                  <Textarea
                    id="essay"
                    rows={12}
                    value={essayText}
                    onChange={(e) => setEssayText(e.target.value)}
                    placeholder="Paste your essay here..."
                    disabled={isUploading}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isUploading || !essayText.trim()}
                  className="w-full"
                  size="lg"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Analyze Essay
                    </>
                  )}
                </Button>
              </form>
            ) : (
              <div className="space-y-6">
                {/* Status Indicator */}
                <Alert className={essayData.status === 'processed' ? 'border-green-500 bg-green-50' : 'border-blue-500 bg-blue-50'}>
                  <div className="flex items-center gap-3">
                    {essayData.status === 'processed' ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <div>
                          <p className="font-medium text-green-800">Processing Complete</p>
                          <p className="text-sm text-green-600">Your essay has been analyzed</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                        <div>
                          <p className="font-medium text-blue-800">
                            {essayData.status === 'processing' ? 'Processing...' : 'Queued for Processing'}
                          </p>
                          <p className="text-sm text-blue-600">
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
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-6 w-6" />
                        Metrics
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-muted p-4 rounded-lg">
                          <p className="text-sm text-muted-foreground">Word Count</p>
                          <p className="text-2xl font-bold">{essayData.metrics.word_count}</p>
                        </div>
                        <div className="bg-muted p-4 rounded-lg">
                          <p className="text-sm text-muted-foreground">Unique Words</p>
                          <p className="text-2xl font-bold">{essayData.metrics.unique_words}</p>
                        </div>
                        <div className="bg-muted p-4 rounded-lg">
                          <p className="text-sm text-muted-foreground">Type-Token Ratio</p>
                          <p className="text-2xl font-bold">
                            {essayData.metrics.type_token_ratio.toFixed(2)}
                          </p>
                        </div>
                        {essayData.metrics.avg_word_freq_rank && (
                          <div className="bg-muted p-4 rounded-lg">
                            <p className="text-sm text-muted-foreground">Avg Frequency Rank</p>
                            <p className="text-2xl font-bold">
                              {Math.round(essayData.metrics.avg_word_freq_rank)}
                            </p>
                          </div>
                        )}
                      </div>
                      {essayData.metrics.noun_ratio && (
                        <div className="mt-4 pt-4 border-t">
                          <p className="text-sm font-medium mb-2">Part of Speech Distribution</p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div>
                              <p className="text-xs text-muted-foreground">Nouns</p>
                              <p className="text-lg font-semibold">{(essayData.metrics.noun_ratio * 100).toFixed(1)}%</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Verbs</p>
                              <p className="text-lg font-semibold">{(essayData.metrics.verb_ratio! * 100).toFixed(1)}%</p>
                            </div>
                            {essayData.metrics.adj_ratio && (
                              <div>
                                <p className="text-xs text-muted-foreground">Adjectives</p>
                                <p className="text-lg font-semibold">{(essayData.metrics.adj_ratio * 100).toFixed(1)}%</p>
                              </div>
                            )}
                            {essayData.metrics.adv_ratio && (
                              <div>
                                <p className="text-xs text-muted-foreground">Adverbs</p>
                                <p className="text-lg font-semibold">{(essayData.metrics.adv_ratio * 100).toFixed(1)}%</p>
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
                  <Card>
                    <CardHeader>
                      <CardTitle>Word-Level Feedback</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {essayData.feedback.map((item, index) => (
                          <Alert
                            key={index}
                            variant={item.correct ? 'default' : 'destructive'}
                            className={item.correct ? 'border-green-500 bg-green-50' : ''}
                          >
                            <div className="flex-1">
                              <p className="font-semibold">
                                <span className="text-lg">{item.word}</span>
                                <span className={`ml-2 text-sm ${
                                  item.correct ? 'text-green-700' : 'text-red-700'
                                }`}>
                                  {item.correct ? '✓ Correct' : '✗ Incorrect'}
                                </span>
                              </p>
                              {item.comment && (
                                <AlertDescription className="mt-2">
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

                {/* Reset Button */}
                <Button
                  onClick={() => {
                    setEssayText('');
                    setEssayId(null);
                    setEssayData(null);
                    setError(null);
                    setIsPolling(false);
                  }}
                  variant="secondary"
                  className="w-full"
                  size="lg"
                >
                  Analyze Another Essay
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

