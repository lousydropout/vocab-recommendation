# Testing Strategy

## Overview

This project uses a multi-layered testing approach:
- **Unit Tests**: Fast, isolated tests using jsdom (frontend) and mocks (backend)
- **Integration Tests**: Full flow tests using real browser (frontend) and API calls (backend)
- **End-to-End Tests**: Complete system tests from user action to data persistence

## Frontend Testing

### Unit Tests (jsdom)
- **Environment**: jsdom (fast, Node.js-based)
- **Command**: `npm test`
- **Use Cases**:
  - Component rendering
  - Function logic (auth, API client)
  - User interactions (form inputs, button clicks)
  - Error handling
- **Files**: `*.test.tsx`, `*.test.ts`
- **Status**: ✅ 29/29 tests passing

### Integration Tests (Browser)
- **Environment**: Real browser (Chromium via Playwright)
- **Command**: `npm run test:browser`
- **Use Cases**:
  - Complete user flows (login → dashboard → logout)
  - Protected route navigation
  - API calls with real Authorization headers
  - Token storage and retrieval
  - Cross-component interactions
- **Setup**: `@vitest/browser-playwright` configured in `vite.config.ts`
- **Status**: ⏳ Setup complete, tests to be written

### Test Configuration
```typescript
// vite.config.ts
test: {
  globals: true,
  environment: 'jsdom',  // Default for unit tests
  setupFiles: './src/test/setup.ts',
  browser: {
    enabled: true,
    provider: playwright(),
    instances: [{ browser: 'chromium' }],
  },
}
```

## Backend Testing

### Unit Tests (pytest)
- **Environment**: Python virtual environment
- **Command**: `cd lambda/api && source venv/bin/activate && PYTHONPATH=. pytest -v`
- **Use Cases**:
  - JWT validation logic
  - Token parsing and extraction
  - Teacher context injection
  - Error handling
- **Files**: `lambda/api/tests/test_*.py`
- **Status**: ✅ 18/18 tests passing

### Integration Tests (API)
- **Environment**: Real deployed API
- **Command**: `python3 test_auth.py` or `python3 test_api.py`
- **Use Cases**:
  - Endpoint authentication (401/403/200 flows)
  - API request/response validation
  - Error handling
  - End-to-end processing flows
- **Files**: `test_*.py` (root directory)
- **Status**: ✅ All integration tests passing

## Test File Organization

```
frontend/
  src/
    __tests__/
      auth.test.tsx              # Unit tests (jsdom)
      auth.integration.test.tsx  # Integration tests (browser) - planned
    lib/
      api.test.ts                # Unit tests
    App.test.tsx                 # Component unit tests

lambda/
  api/
    tests/
      test_jwt.py                # Backend unit tests

test_auth.py                     # Backend API integration tests
test_api.py                      # API integration tests
test_processing.py               # End-to-end processing tests
```

## Running Tests

### Frontend
```bash
# Unit tests (jsdom - fast)
npm test

# Integration tests (browser - slower but comprehensive)
npm run test:browser

# Test UI (interactive)
npm run test:ui

# Coverage
npm run test:coverage
```

### Backend
```bash
# Unit tests
cd lambda/api
source venv/bin/activate
PYTHONPATH=. pytest -v

# Integration tests
python3 test_auth.py
python3 test_api.py
python3 test_processing.py
```

## Best Practices

1. **Unit Tests**: Use for isolated logic, fast feedback
   - Mock external dependencies (API, Cognito, localStorage)
   - Test edge cases and error conditions
   - Keep tests fast (< 100ms each)

2. **Integration Tests**: Use for user flows and real interactions
   - Test complete workflows (login → action → logout)
   - Use real browser APIs when needed
   - Test cross-component communication

3. **Test Data**: Use factories/fixtures for consistent test data
   - Mock JWT tokens for auth tests
   - Use test databases/tables for backend tests
   - Clean up after tests

4. **CI/CD**: Run both unit and integration tests
   - Unit tests: Fast feedback on every commit
   - Integration tests: Run on PRs and main branch
   - Browser tests: May require longer timeout

## Future Enhancements

- [ ] Add E2E tests with Playwright for complete user journeys
- [ ] Add visual regression tests for UI components
- [ ] Add performance tests for API endpoints
- [ ] Add load tests for concurrent users
- [ ] Add accessibility tests (a11y)

