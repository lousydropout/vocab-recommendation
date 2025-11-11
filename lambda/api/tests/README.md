# API Lambda Tests

## Setup

### Prerequisites

1. Python 3.10+ with `venv` support
2. Install system package (if needed):
   ```bash
   sudo apt install python3.10-venv
   ```

### Create Virtual Environment

```bash
cd lambda/api
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

Or use the setup script:
```bash
cd /path/to/vocab_recommendation
./setup_venv.sh
source venv/bin/activate
cd lambda/api
pip install -r requirements.txt
```

## Running Tests

### All Tests
```bash
cd lambda/api
source venv/bin/activate  # If not already activated
PYTHONPATH=. pytest -v
```

### Specific Test File
```bash
cd lambda/api
source venv/bin/activate
PYTHONPATH=. pytest tests/test_jwt.py -v
```

### With Coverage
```bash
cd lambda/api
source venv/bin/activate
pip install pytest-cov
PYTHONPATH=. pytest --cov=app --cov-report=html tests/
```

## Test Structure

- `test_jwt.py` - Unit tests for JWT validation and authentication
  - JWKS fetching and caching
  - Token verification
  - Teacher context injection
  - Error handling

## Notes

- Tests use mocking to avoid requiring actual Cognito User Pool
- Environment variables are set via pytest fixtures
- Async tests use `pytest-asyncio`

