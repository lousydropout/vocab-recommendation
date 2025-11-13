import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Home, Menu, X, BookOpen, Users, LogOut, BarChart3 } from 'lucide-react'
import { logout } from '../utils/auth'
import { useAuth } from '../providers/AuthProvider'
import { Button } from './ui/button'

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(false)
  const navigate = useNavigate()
  const { checkAuth } = useAuth()

  const handleLogout = async () => {
    try {
      await logout()
      await checkAuth()
      navigate({ to: '/login' })
    } catch (err) {
      console.error('Logout error:', err)
      // Still navigate to login even if logout fails
      navigate({ to: '/login' })
    }
  }

  const navItems = [
    { to: '/', icon: Home, label: 'Dashboard' },
    { to: '/assignments', icon: BookOpen, label: 'Assignments' },
    { to: '/students', icon: Users, label: 'Students' },
  ]

  return (
    <>
      {/* Mobile menu button */}
      <header className="p-4 flex items-center bg-gray-800 text-white shadow-lg lg:hidden">
        <button
          onClick={() => setIsOpen(true)}
          className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          aria-label="Open menu"
        >
          <Menu size={24} />
        </button>
        <h1 className="ml-4 text-xl font-semibold">
          <Link to="/">
            <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
              Vocabulary Analyzer
            </span>
          </Link>
        </h1>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 bg-gray-900 text-white shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <Link to="/" className="flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-blue-400" />
            <span className="text-xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
              Vocabulary Analyzer
            </span>
          </Link>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
                activeProps={{
                  className:
                    'flex items-center gap-3 p-3 rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors mb-2',
                }}
              >
                <Icon size={20} />
                <span className="font-medium">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-gray-700">
          <Button
            onClick={handleLogout}
            variant="ghost"
            className="w-full justify-start text-white hover:bg-gray-800 hover:text-white"
          >
            <LogOut size={20} className="mr-3" />
            <span className="font-medium">Logout</span>
          </Button>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-50 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-80 bg-gray-900 text-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col lg:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold">Navigation</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
                activeProps={{
                  className:
                    'flex items-center gap-3 p-3 rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors mb-2',
                }}
              >
                <Icon size={20} />
                <span className="font-medium">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-gray-700">
          <Button
            onClick={handleLogout}
            variant="ghost"
            className="w-full justify-start text-white hover:bg-gray-800 hover:text-white"
          >
            <LogOut size={20} className="mr-3" />
            <span className="font-medium">Logout</span>
          </Button>
        </div>
      </aside>
    </>
  )
}

