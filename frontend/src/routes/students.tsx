import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '../utils/route-protection'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Users } from 'lucide-react'

export const Route = createFileRoute('/students')({
  beforeLoad: async () => {
    await requireAuth()
  },
  component: StudentsPage,
})

function StudentsPage() {
  return (
    <div className="p-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Students
          </CardTitle>
          <CardDescription>
            Manage and view your students
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Student management will be implemented in Epic 4.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
