import { createFileRoute, useNavigate, Outlet, useLocation } from '@tanstack/react-router'
import { requireAuth } from '../utils/route-protection'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { listAssignments, createAssignment } from '../api/client'
import type { AssignmentResponse, AssignmentCreate } from '../types/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Alert, AlertDescription } from '../components/ui/alert'
import { BookOpen, Plus, Loader2, AlertCircle, Eye } from 'lucide-react'
import { Textarea } from '../components/ui/textarea'

export const Route = createFileRoute('/assignments')({
  beforeLoad: async () => {
    await requireAuth()
  },
  component: AssignmentsPage,
})

function AssignmentsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Check if we're on a child route (assignment detail)
  const isDetailPage = location.pathname !== '/assignments'

  // Fetch assignments
  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['assignments'],
    queryFn: listAssignments,
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: createAssignment,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] })
      setIsDialogOpen(false)
      setError(null)
      // Navigate to the new assignment detail page
      navigate({ 
        to: '/assignments/$assignmentId',
        params: { assignmentId: data.assignment_id }
      })
    },
    onError: (err: Error) => {
      setError(err.message)
    },
  })

  const handleCreate = () => {
    setError(null)
    setIsDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    const data: AssignmentCreate = {
      name: formData.get('name') as string,
      description: formData.get('description') as string || undefined,
    }

    createMutation.mutate(data)
  }

  // If we're on a detail page, just render the outlet (child route)
  if (isDetailPage) {
    return <Outlet />
  }

  // Otherwise, render the assignments list
  return (
    <div className="p-8">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Assignments
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage and view your assignments
          </p>
        </div>
        <Button onClick={handleCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Assignment
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      ) : assignments.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No assignments yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first assignment to get started
              </p>
              <Button onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Assignment
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>All Assignments ({assignments.length})</CardTitle>
            <CardDescription>
              Click on an assignment to view details and upload essays
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((assignment: AssignmentResponse) => (
                  <TableRow key={assignment.assignment_id}>
                    <TableCell className="font-medium">{assignment.name}</TableCell>
                    <TableCell className="max-w-md truncate">{assignment.description || '-'}</TableCell>
                    <TableCell>
                      {new Date(assignment.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate({ 
                          to: '/assignments/$assignmentId',
                          params: { assignmentId: assignment.assignment_id }
                        })}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create Assignment Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Assignment</DialogTitle>
            <DialogDescription>
              Create a new assignment to collect and analyze student essays
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="name">Assignment Name *</Label>
                <Input
                  id="name"
                  name="name"
                  required
                  placeholder="e.g., Fall 2024 Essay Assignment"
                  disabled={createMutation.isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="Add any notes or instructions for this assignment..."
                  disabled={createMutation.isPending}
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Assignment'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
