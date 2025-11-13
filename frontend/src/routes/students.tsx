import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { requireAuth } from '../utils/route-protection'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { listStudents, createStudent, updateStudent, deleteStudent } from '../api/client'
import type { StudentResponse, StudentCreate } from '../types/api'
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
import { Users, Plus, Pencil, Trash2, Loader2, AlertCircle, User } from 'lucide-react'
import { Textarea } from '../components/ui/textarea'

export const Route = createFileRoute('/students')({
  beforeLoad: async () => {
    await requireAuth()
  },
  component: StudentsPage,
})

function StudentsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingStudent, setEditingStudent] = useState<StudentResponse | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<StudentResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Fetch students
  const { data: students = [], isLoading } = useQuery({
    queryKey: ['students'],
    queryFn: listStudents,
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: createStudent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] })
      setIsDialogOpen(false)
      setEditingStudent(null)
      setError(null)
    },
    onError: (err: Error) => {
      setError(err.message)
    },
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ studentId, data }: { studentId: string; data: Partial<StudentCreate> }) =>
      updateStudent(studentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] })
      setIsDialogOpen(false)
      setEditingStudent(null)
      setError(null)
    },
    onError: (err: Error) => {
      setError(err.message)
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deleteStudent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] })
      setDeleteConfirm(null)
    },
    onError: (err: Error) => {
      setError(err.message)
      setDeleteConfirm(null)
    },
  })

  const handleCreate = () => {
    setEditingStudent(null)
    setError(null)
    setIsDialogOpen(true)
  }

  const handleEdit = (student: StudentResponse) => {
    setEditingStudent(student)
    setError(null)
    setIsDialogOpen(true)
  }

  const handleDelete = async (student: StudentResponse) => {
    try {
      await deleteMutation.mutateAsync(student.student_id)
    } catch {
      // Error handled by mutation
    }
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    const data: StudentCreate = {
      name: formData.get('name') as string,
      grade_level: formData.get('grade_level') ? parseInt(formData.get('grade_level') as string) : undefined,
      notes: formData.get('notes') as string || undefined,
    }

    if (editingStudent) {
      updateMutation.mutate({ studentId: editingStudent.student_id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Students
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage your students
          </p>
        </div>
        <Button onClick={handleCreate} size="lg">
          <Plus className="h-4 w-4 mr-2" />
          Add Student
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Student List
          </CardTitle>
          <CardDescription>
            {students.length} {students.length === 1 ? 'student' : 'students'} total
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : students.length === 0 ? (
            <div className="text-center py-12">
              <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">No students yet</p>
              <Button onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Student
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Grade Level</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student: StudentResponse) => (
                  <TableRow key={student.student_id}>
                    <TableCell className="font-medium">{student.name}</TableCell>
                    <TableCell>{student.grade_level || '-'}</TableCell>
                    <TableCell className="max-w-md truncate">{student.notes || '-'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate({ to: `/students/${student.student_id}` })}
                        >
                          <User className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(student)}
                        >
                          <Pencil className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setDeleteConfirm(student)}
                          className="text-white"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          <span>Delete</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingStudent ? 'Edit Student' : 'Add New Student'}</DialogTitle>
            <DialogDescription>
              {editingStudent ? 'Update student information' : 'Create a new student record'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={editingStudent?.name || ''}
                  required
                  placeholder="Student name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="grade_level">Grade Level</Label>
                <Input
                  id="grade_level"
                  name="grade_level"
                  type="number"
                  min="1"
                  max="12"
                  defaultValue={editingStudent?.grade_level || ''}
                  placeholder="e.g., 5"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  defaultValue={editingStudent?.notes || ''}
                  placeholder="Additional notes about the student"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsDialogOpen(false)
                  setEditingStudent(null)
                  setError(null)
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {editingStudent ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Student</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirm(null)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
