# Frontend PRD - TanStack Router + Bun Version

## Overview

This frontend provides teachers with a user interface for uploading essays, viewing class analytics, tracking student progress, and reviewing AI-generated feedback. It is built using:

- **React 19**
- **TanStack Router (file-router template)**
- **Tailwind CSS**
- **shadcn/ui**
- **Bun runtime + Bun build system**

The frontend interacts with the backend via authenticated JWT-secured API Gateway endpoints. The application must remain stateless, client-side rendered, and optimized for deployment on a static host (CloudFront, S3, or Netlify).

## Core Features

### 2.1 Authentication
- Login page for teacher email & password using Cognito Hosted UI or direct OAuth flow
- Store ID token securely (memory + localStorage)
- Handle token refresh and auto-redirect if unauthenticated
- Protect all internal routes using TanStack Router route guards

### 2.2 Teacher Dashboard (Home)
- Display list of assignments
- Display high-level metrics (optional)
- Provide CTA for creating a new assignment or uploading essays

### 2.3 Students Management
- List of all students associated with the teacher
- Create/edit/delete student entries
- Search and filtering

### 2.4 Assignments
- Create new assignment with name and optional metadata
- Assignment detail page:
  - Upload panel (zip or group of files)
  - Display processing status + aggregated class metrics once available
  - Table view: all students and their results for this assignment

### 2.5 Student Analytics
- Student summary page:
  - Over-time metrics (line charts)
  - Past assignments
  - List of essays with quick access

### 2.6 Essay Review
- Single essay detail view:
  - Raw essay text
  - Highlighted tokens with per-word feedback (correct/incorrect/formality/etc)
  - Allow teacher overrides
  - Submit override changes back to backend

### 2.7 UI/UX Requirements
- Responsive layout (desktop-focused; tablet-friendly)
- Navigation using TanStack Router
- Dark mode optional
- shadcn/ui components for consistency
- Toasts for success/error states
- API client with consistent error handling

## Non-Functional Requirements

- Must build using `bun build` without Vite (Note: Currently using Vite, may need migration)
- All routes must work with static hosting (client-side routing)
- Minimal external dependencies; rely on TanStack Router & shadcn/ui
- Good performance: < 200KB gzipped (excluding icons/fonts)
- All API calls must include JWT and gracefully handle expired sessions
- Declarative route protection using file-router `beforeLoad`

## Implementation Epics

### Epic 1 — Project Setup
- Clean project structure
- Add global providers (AuthProvider, QueryClientProvider, ThemeProvider)
- Setup API client with JWT injection

### Epic 2 — Authentication System
- Login page
- Handle redirect/callback
- Protected routes with `beforeLoad` guards

### Epic 3 — Layout & Navigation
- App shell with sidebar navigation
- Responsive behavior

### Epic 4 — Students CRUD
- List page
- Create/Edit modal
- Delete with confirmation

### Epic 5 — Assignments
- Assignment list
- Assignment creation modal
- Assignment detail page
- Upload component (drag & drop)

### Epic 6 — Class Analytics
- Metrics fetch
- Charts (Recharts or Chart.js)
- UI structure with tabs

### Epic 7 — Student Analytics
- Fetch metrics
- Over-time charts
- Past assignments table

### Epic 8 — Essay Review
- Fetch essay
- Render essay text with tokenized color-coding
- Override editor
- Submit override

### Epic 9 — Polish & Deployment
- Loading & error states
- Dark mode
- Environment config
- Build & deploy instructions

## Current Status

**Status**: Epic 4 Complete - Ready for Epic 5

**Epic 1 Completion (2025-01-XX)**:
- ✅ Directory structure created: `api/`, `components/`, `hooks/`, `pages/`, `utils/`, `types/`
- ✅ Dependencies added: `@tanstack/react-query@5.90.8`, `aws-amplify@6.15.8`
- ✅ Environment configuration (`src/utils/config.ts`) with multi-environment support
- ✅ Authentication utilities (`src/utils/auth.ts`) with AWS Amplify integration
- ✅ API client (`src/api/client.ts`) with JWT injection and error handling
- ✅ TypeScript type definitions (`src/types/api.ts`) for all API responses
- ✅ Global providers: `AuthProvider` and `QueryProvider` configured
- ✅ Build verification: `bun run build` passes successfully
- ✅ Bundle size: ~348KB (gzipped: ~110KB)

**Epic 2 Completion (2025-01-XX)**:
- ✅ Created shadcn/ui components: `Button`, `Card`, `Alert`
- ✅ Added dependency: `@radix-ui/react-slot@1.2.4`
- ✅ Created login page (`src/routes/login.tsx`) with email/password form
- ✅ Implemented error handling for Cognito errors (NotAuthorizedException, UserNotConfirmedException)
- ✅ Created route protection utility (`src/utils/route-protection.ts`) with `requireAuth()` function
- ✅ Added `beforeLoad` guard to index route for authentication protection
- ✅ Updated root route to conditionally hide Header on login page
- ✅ Integrated login with AuthProvider to refresh auth state after login
- ✅ Build verification: `bun run build` passes successfully
- ✅ Bundle size: ~415KB (gzipped: ~127KB) with code splitting

**Epic 3 Completion (2025-01-XX)**:
- ✅ Renamed Header component to Sidebar for better semantic clarity
- ✅ Implemented responsive sidebar navigation with collapsible behavior
- ✅ Added navigation links: Home, Assignments, Students
- ✅ Integrated logout functionality with AWS Amplify
- ✅ Updated root route to conditionally render Sidebar (hidden on login page)
- ✅ Added main content area with proper margin for sidebar (lg:ml-64)
- ✅ Implemented mobile-responsive design with hamburger menu
- ✅ Added user info display in sidebar
- ✅ Build verification: `bun run build` passes successfully
- ✅ Bundle size: ~415KB (gzipped: ~127KB) with code splitting

**Epic 4 Completion (2025-01-XX)**:
- ✅ Created students list page (`src/routes/students.tsx`) with full CRUD operations
- ✅ Added shadcn/ui components: `Dialog`, `Table`, `Input`, `Label`, `Textarea`
- ✅ Implemented create/edit student dialog with form validation
- ✅ Added delete student functionality with confirmation dialog
- ✅ Created student detail page (`src/routes/students.$studentId.tsx`)
- ✅ Integrated TanStack Query for data fetching and mutations
- ✅ Implemented optimistic updates with query invalidation
- ✅ Added loading, empty, and error states
- ✅ Fixed delete button readability (changed destructive variant to use text-white)
- ✅ Build verification: `bun run build` passes successfully
- ✅ Bundle size: ~453KB (gzipped: ~140KB) with code splitting
- ✅ All TypeScript errors resolved

**Current Setup**:
- TanStack Router file-based routing configured
- React 19 + TypeScript
- Tailwind CSS v4 with theme variables
- Responsive Sidebar component with navigation
- Vite build system (PRD requires Bun build - may need migration)
- Global providers configured (Auth, Query)
- API client ready with all endpoints
- Authentication utilities ready
- Login page implemented with AWS Amplify integration
- Route protection using TanStack Router `beforeLoad` guards
- shadcn/ui components (Button, Card, Alert, Dialog, Table, Input, Label, Textarea) available
- Students CRUD fully implemented with TanStack Query
- Student detail page implemented

**Reference Implementation**:
- `old_frontend/` contains complete implementation using:
  - AWS Amplify for authentication
  - React Router (not TanStack Router)
  - All pages implemented (Login, Dashboard, ClassDashboard, StudentDashboard, EssayReview)
  - Complete API client in `old_frontend/src/lib/api.ts`
  - Auth implementation in `old_frontend/src/lib/auth.ts`

**Migration Strategy**:
- Migrate auth from AWS Amplify (keep Amplify for now)
- Migrate API client patterns
- Convert pages to TanStack Router file-based routes
- Add shadcn/ui components as needed

## Key Technical Decisions

1. **Build System**: Currently using Vite. PRD specifies Bun build, but Vite works well with TanStack Router. Decision pending on whether to migrate.

2. **Authentication**: Using AWS Amplify (from old_frontend) for faster migration. Can switch to direct Cognito SDK later if needed.

3. **Chart Library**: To be determined - Recharts recommended for React-friendly API.

4. **API Base URL**: `https://m18eg6bei9.execute-api.us-east-1.amazonaws.com/prod`
5. **Cognito User Pool ID**: `us-east-1_65hpvHpPX`
6. **Cognito Client ID**: `jhnvud4iqcf15vac6nc2d2b9p`

## Implementation Notes

- Each epic must pass `bun run build` before completion
- Wait for approval before proceeding to next epic
- All TypeScript errors must be resolved
- Follow TanStack Router file-based routing conventions
- Use shadcn/ui components for consistency

