import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '../utils/route-protection'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { BookOpen } from 'lucide-react'

export const Route = createFileRoute('/assignments')({
  beforeLoad: async () => {
    await requireAuth()
  },
  component: AssignmentsPage,
})

function AssignmentsPage() {
  return (
    <div className="p-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Assignments
          </CardTitle>
          <CardDescription>
            Manage and view your assignments
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Assignment management will be implemented in Epic 5.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
