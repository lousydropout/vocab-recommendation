import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import {
  LogIn,
  BookOpen,
  Users,
  Brain,
  BarChart3,
  Download,
  GraduationCap,
  UserCheck,
  School,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent mb-4">
            VocabLens Classroom
          </h1>
          <p className="text-xl text-muted-foreground mb-6">
            Help your students grow from "using words" to{" "}
            <strong>owning</strong> them.
          </p>
          <Link to="/login">
            <Button size="lg" className="gap-2">
              <LogIn className="h-5 w-5" />
              Log in to your account
            </Button>
          </Link>
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent my-12" />

        {/* What this app does */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold mb-6">What this app does</h2>
          <Card className="mb-6">
            <CardContent className="pt-6">
              <p className="text-lg text-muted-foreground mb-6">
                VocabLens helps you quickly understand each student's vocabulary
                level and gives you targeted word recommendations — without
                spending hours grading.
              </p>
              <div className="space-y-4">
                <h3 className="text-xl font-semibold mb-4">You can:</h3>
                <ul className="space-y-3 text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <span className="text-xl">✏️</span>
                    <span>Create assignments for your classes</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-xl">👩‍🎓</span>
                    <span>Add students and track their progress</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-xl">📄</span>
                    <span>Collect essay submissions (DOCX / text)</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-xl">🤖</span>
                    <span>
                      Run AI analysis on each essay:
                      <ul className="ml-8 mt-2 space-y-2 list-disc">
                        <li>
                          Words that signal the student's current vocabulary
                          level
                        </li>
                        <li>
                          Analysis of word and phrase usage (correct vs.
                          incorrect / awkward)
                        </li>
                        <li>Recommended new words tailored to that student</li>
                      </ul>
                    </span>
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </section>

        <div className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent my-12" />

        {/* Who it's for */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold mb-6">Who it's for</h2>
          <Card>
            <CardContent className="pt-6">
              <ul className="space-y-3 text-muted-foreground">
                <li className="flex items-center gap-3">
                  <GraduationCap className="h-5 w-5 text-blue-600" />
                  <span>Middle school and high school English teachers</span>
                </li>
                <li className="flex items-center gap-3">
                  <UserCheck className="h-5 w-5 text-indigo-600" />
                  <span>Tutors and intervention specialists</span>
                </li>
                <li className="flex items-center gap-3">
                  <School className="h-5 w-5 text-purple-600" />
                  <span>
                    Schools that want data-informed writing support without a
                    giant grading platform
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </section>

        <div className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent my-12" />

        {/* How it works */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold mb-6">How it works</h2>
          <div className="space-y-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                    1
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">
                      Create an assignment
                    </h3>
                    <p className="text-muted-foreground">
                      Give it a title, prompt, due date, and class/section
                    </p>
                    <p className="text-sm text-muted-foreground mt-1 italic">
                      Optional: upload instructions or rubric
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
                    2
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">
                      Add or import students
                    </h3>
                    <p className="text-muted-foreground">
                      Add manually or bulk-import from CSV
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Group by class / section
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold">
                    3
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">
                      Collect essays
                    </h3>
                    <p className="text-muted-foreground">
                      Students submit via a simple link or upload
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Support for{" "}
                      <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">
                        .docx
                      </code>{" "}
                      and plain text
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                    4
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">
                      Run AI analysis
                    </h3>
                    <p className="text-muted-foreground mb-2">
                      For each essay, the app generates:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-4">
                      <li>Vocabulary-level indicator words</li>
                      <li>Notes on correct/incorrect phrase usage</li>
                      <li>A recommended word list for that student</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
                    5
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Review & act</h3>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-4">
                      <li>See per-student reports</li>
                      <li>Compare across assignments</li>
                      <li>Export results for conferences or IEP meetings</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-8 text-center">
            <Link to="/login">
              <Button size="lg" className="gap-2">
                <LogIn className="h-5 w-5" />
                Log in to start analyzing essays
              </Button>
            </Link>
          </div>
        </section>

        <div className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent my-12" />

        {/* Key features */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold mb-6">Key features at a glance</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <BookOpen className="h-6 w-6 text-blue-600 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold mb-1">
                      Per-student vocab profiles
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      See how a student changes over time
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Brain className="h-6 w-6 text-indigo-600 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold mb-1">Usage feedback</h3>
                    <p className="text-sm text-muted-foreground">
                      Highlights misused or awkward phrases
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Users className="h-6 w-6 text-purple-600 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold mb-1">
                      Personalized recommendations
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Words just above each student's current level
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <BarChart3 className="h-6 w-6 text-blue-600 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold mb-1">
                      Assignment dashboards
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Quickly scan which students need attention
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Download className="h-6 w-6 text-indigo-600 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold mb-1">Exportable reports</h3>
                    <p className="text-sm text-muted-foreground">
                      Share with parents, admin, or other teachers
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <div className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent my-12" />

        {/* Example workflow */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold mb-6">Example teacher workflow</h2>
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <blockquote className="text-lg italic text-muted-foreground">
                "I give a weekly writing prompt. Students upload their essays.
                <br />
                In a few minutes I get:
                <ul className="list-disc list-inside space-y-1 mt-2 ml-4">
                  <li>A sense of who's coasting vs. stretching</li>
                  <li>Misused phrases I can turn into mini-lessons</li>
                  <li>Personalized vocab lists I can assign as extensions."</li>
                </ul>
              </blockquote>
            </CardContent>
          </Card>
        </section>

        <div className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent my-12" />

        {/* Get started */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold mb-6">Get started</h2>
          <Card>
            <CardContent className="pt-6 space-y-4">
              <p className="text-muted-foreground">
                <strong>New here?</strong> Ask your school leader or admin for
                an invite link.
              </p>
              <p className="text-muted-foreground">
                <strong>Already have an account?</strong>
              </p>
              <div className="pt-4">
                <Link to="/login">
                  <Button size="lg" className="gap-2">
                    <LogIn className="h-5 w-5" />
                    Log in
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
