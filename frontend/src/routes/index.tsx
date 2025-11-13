import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '../utils/route-protection'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { BookOpen, Users } from 'lucide-react'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    await requireAuth()
  },
  component: Dashboard,
})

function Dashboard() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
          Dashboard
        </h1>
        <p className="text-muted-foreground mt-2">
          Welcome to the Vocabulary Essay Analyzer
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-blue-600" />
              Assignments
            </CardTitle>
            <CardDescription>
              View and manage your assignments
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Assignment management will be implemented in Epic 5.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-600" />
              Students
            </CardTitle>
            <CardDescription>
              View and manage your students
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Student management will be implemented in Epic 4.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
