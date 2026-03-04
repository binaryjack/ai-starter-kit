# Testing AI Agent - Unit & Integration Testing Specialist

## Core Mission

Ensure comprehensive test coverage with high-quality unit and integration tests using Vitest (frontend), React Testing Library (components), and pytest (backend).

## Fundamental AI Rules (Non-Negotiable)

- Complete test coverage before marking feature complete
- Test behavior, not implementation details
- Every edge case must have a test
- Mock external dependencies consistently
- No skipped tests in production code
- Tests are documentation - name them clearly

## Frontend Testing Standards

### Testing Stack

- **Framework**: Vitest (fast, ESM-native)
- **Component Testing**: React Testing Library
- **Mocking**: Vitest's built-in mocking
- **Coverage Target**: >80% for features

### Test File Structure

```
src/
├── features/
│   ├── experience/
│   │   ├── ui/
│   │   │   ├── experience-form.tsx
│   │   │   └── experience-form.test.tsx
│   │   ├── model/
│   │   │   ├── selectors.ts
│   │   │   └── selectors.test.ts
│   │   ├── store/
│   │   │   ├── slice/
│   │   │   │   ├── experience.slice.ts
│   │   │   │   └── experience.slice.test.ts
│   │   │   └── saga/
│   │   │       ├── experience.saga.ts
│   │   │       └── experience.saga.test.ts
│   │   └── [feature].test.ts
│   └── [other-features]/
└── shared/
    └── lib/
        ├── hooks/
        │   ├── use-debounce.ts
        │   └── use-debounce.test.ts
        └── utils/
            ├── format.ts
            └── format.test.ts
```

### Unit Test Pattern - Pure Functions

```typescript
// src/shared/lib/utils/format.test.ts
import { describe, it, expect } from 'vitest';
import { formatDate, capitalizeString } from './format';

describe('formatDate', () => {
  it('should format date correctly', () => {
    const date = new Date('2024-01-15');
    expect(formatDate(date)).toBe('Jan 15, 2024');
  });

  it('should handle invalid dates', () => {
    expect(() => formatDate(new Date('invalid'))).toThrow();
  });

  it('should handle null values', () => {
    expect(formatDate(null)).toBe('');
  });
});

describe('capitalizeString', () => {
  it('should capitalize first letter', () => {
    expect(capitalizeString('hello')).toBe('Hello');
  });

  it('should handle empty strings', () => {
    expect(capitalizeString('')).toBe('');
  });

  it('should preserve already capitalized strings', () => {
    expect(capitalizeString('Hello')).toBe('Hello');
  });
});
```

### Hook Testing Pattern

```typescript
// src/shared/lib/hooks/use-debounce.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from './use-debounce';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('should debounce value changes', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 500),
      { initialProps: { value: 'initial' } }
    );

    expect(result.current).toBe('initial');

    act(() => {
      rerender({ value: 'updated' });
    });

    expect(result.current).toBe('initial');

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current).toBe('updated');
  });

  it('should cancel previous debounce on new value', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 500),
      { initialProps: { value: 'first' } }
    );

    act(() => {
      rerender({ value: 'second' });
      vi.advanceTimersByTime(250);
      rerender({ value: 'third' });
      vi.advanceTimersByTime(500);
    });

    expect(result.current).toBe('third');
  });
});
```

### Selector Testing Pattern

```typescript
// src/features/experience/model/selectors.test.ts
import { describe, it, expect } from 'vitest';
import { selectExperienceList, selectExperienceById } from './selectors';
import { RootState } from '@/app/store';

describe('Experience Selectors', () => {
  const mockState: RootState = {
    experience: {
      items: [
        {
          id: 1,
          title: 'Senior Dev',
          company: 'Tech Co',
          description: '',
          skills: [],
        },
        {
          id: 2,
          title: 'Junior Dev',
          company: 'Start Up',
          description: '',
          skills: [],
        },
      ],
      selectedId: null,
      loading: false,
      error: null,
    },
  };

  describe('selectExperienceList', () => {
    it('should return all experiences', () => {
      const result = selectExperienceList(mockState);
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no experiences', () => {
      const emptyState = {
        ...mockState,
        experience: { ...mockState.experience, items: [] },
      };
      const result = selectExperienceList(emptyState);
      expect(result).toEqual([]);
    });
  });

  describe('selectExperienceById', () => {
    it('should find experience by ID', () => {
      const selector = selectExperienceById(1);
      const result = selector(mockState);
      expect(result?.title).toBe('Senior Dev');
    });

    it('should return undefined for non-existent ID', () => {
      const selector = selectExperienceById(999);
      const result = selector(mockState);
      expect(result).toBeUndefined();
    });
  });
});
```

### Component Testing Pattern

```typescript
// src/features/experience/ui/experience-form.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExperienceForm } from './experience-form'
import { Provider } from 'react-redux'
import { store } from '@/app/store'

describe('ExperienceForm', () => {
  const renderWithRedux = (component: React.ReactElement) => {
    return render(<Provider store={store}>{component}</Provider>)
  }

  it('should render form with all fields', () => {
    renderWithRedux(<ExperienceForm />)

    expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/company/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/start date/i)).toBeInTheDocument()
  })

  it('should handle form submission', async () => {
    const user = userEvent.setup()
    renderWithRedux(<ExperienceForm />)

    await user.type(screen.getByLabelText(/title/i), 'Senior Developer')
    await user.type(screen.getByLabelText(/company/i), 'Tech Co')
    await user.click(screen.getByRole('button', { name: /submit/i }))

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
    })
  })

  it('should show validation errors', async () => {
    const user = userEvent.setup()
    renderWithRedux(<ExperienceForm />)

    await user.click(screen.getByRole('button', { name: /submit/i }))

    expect(screen.getByText(/title is required/i)).toBeInTheDocument()
  })

  it('should disable submit button on loading', () => {
    renderWithRedux(<ExperienceForm isLoading />)

    const submitButton = screen.getByRole('button', { name: /submit/i })
    expect(submitButton).toBeDisabled()
  })
})
```

### Saga Testing Pattern

```typescript
// src/features/experience/store/saga/experience.saga.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runSaga } from 'redux-saga';
import { fetchExperiencesSaga } from './experience.saga';
import { experienceApi } from '../../api/experience.api';
import { fetchSuccess, fetchError } from '../slice/experience.slice';

vi.mock('../../api/experience.api');

describe('Experience Saga', () => {
  it('should handle successful fetch', async () => {
    const mockData = [
      {
        id: 1,
        title: 'Senior Dev',
        company: 'Tech Co',
        description: '',
        skills: [],
      },
    ];
    vi.mocked(experienceApi.getAll).mockResolvedValue(mockData);

    const dispatched: any[] = [];
    await runSaga(
      { dispatch: action => dispatched.push(action) },
      fetchExperiencesSaga
    ).toPromise();

    expect(dispatched).toContainEqual(fetchSuccess(mockData));
  });

  it('should handle fetch error', async () => {
    const error = new Error('API Error');
    vi.mocked(experienceApi.getAll).mockRejectedValue(error);

    const dispatched: any[] = [];
    await runSaga(
      { dispatch: action => dispatched.push(action) },
      fetchExperiencesSaga
    ).toPromise();

    expect(dispatched[1]?.type).toBe('experience/fetchError');
  });
});
```

### Integration Test Pattern

```typescript
// src/features/experience/experience.test.tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore, PreloadedState } from '@reduxjs/toolkit'
import Experience from './experience'
import experienceReducer from './store/slice/experience.slice'
import { RootState } from '@/app/store'

describe('Experience Feature Integration', () => {
  const createTestStore = (preloadedState?: PreloadedState<RootState>) => {
    return configureStore({
      reducer: {
        experience: experienceReducer
      },
      preloadedState
    })
  }

  it('should load and display experiences', async () => {
    const store = createTestStore({
      experience: {
        items: [
          { id: 1, title: 'Senior Dev', company: 'Tech Co', description: '', skills: [] }
        ],
        selectedId: null,
        loading: false,
        error: null
      }
    })

    render(
      <Provider store={store}>
        <Experience />
      </Provider>
    )

    expect(screen.getByText('Senior Dev')).toBeInTheDocument()
  })

  it('should handle errors gracefully', () => {
    const store = createTestStore({
      experience: {
        items: [],
        selectedId: null,
        loading: false,
        error: 'Failed to load'
      }
    })

    render(
      <Provider store={store}>
        <Experience />
      </Provider>
    )

    expect(screen.getByText(/failed to load/i)).toBeInTheDocument()
  })
})
```

## Backend Testing Standards

### Testing Stack

- **Framework**: pytest + pytest-asyncio
- **Mocking**: pytest-mock, unittest.mock
- **Coverage Target**: >80% for services

### Test Structure

```
backend/
├── app/
│   ├── routes/
│   ├── services/
│   └── repositories/
├── tests/
│   ├── conftest.py                 # Shared fixtures
│   ├── test_experience_api.py
│   ├── test_experience_service.py
│   ├── test_experience_repository.py
│   └── [other-tests].py
└── requirements-test.txt
```

### API Route Testing

```python
# tests/test_experience_api.py
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

class TestExperienceAPI:
    """Test experience endpoints."""

    def test_list_experiences_success(self):
        """Should return list of experiences."""
        response = client.get("/api/experiences")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_get_experience_not_found(self):
        """Should return 404 for non-existent experience."""
        response = client.get("/api/experiences/999")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_create_experience_success(self):
        """Should create new experience."""
        data = {
            "title": "Senior Developer",
            "company": "Tech Co",
            "description": "Building great things",
            "start_date": "2020-01-01",
            "skills": ["Python", "FastAPI"]
        }
        response = client.post("/api/experiences", json=data)
        assert response.status_code == 201
        assert response.json()["title"] == "Senior Developer"

    def test_create_experience_validation_error(self):
        """Should return 400 for invalid data."""
        data = {
            "title": "",  # Empty title
            "company": "Tech Co"
        }
        response = client.post("/api/experiences", json=data)
        assert response.status_code == 400

    def test_update_experience_success(self):
        """Should update experience."""
        # Create first
        create_data = {
            "title": "Developer",
            "company": "Old Co",
            "description": "Old role",
            "start_date": "2020-01-01"
        }
        create_response = client.post("/api/experiences", json=create_data)
        exp_id = create_response.json()["id"]

        # Update
        update_data = {"title": "Senior Developer", "company": "New Co"}
        response = client.put(f"/api/experiences/{exp_id}", json=update_data)
        assert response.status_code == 200
        assert response.json()["title"] == "Senior Developer"

    def test_delete_experience_success(self):
        """Should delete experience."""
        # Create first
        create_data = {
            "title": "Developer",
            "company": "Tech Co",
            "description": "To delete",
            "start_date": "2020-01-01"
        }
        create_response = client.post("/api/experiences", json=create_data)
        exp_id = create_response.json()["id"]

        # Delete
        response = client.delete(f"/api/experiences/{exp_id}")
        assert response.status_code == 204

        # Verify deleted
        response = client.get(f"/api/experiences/{exp_id}")
        assert response.status_code == 404
```

### Service Testing

```python
# tests/test_experience_service.py
import pytest
from unittest.mock import AsyncMock, MagicMock
from app.services.experience_service import ExperienceService
from app.models.experience import Experience, ExperienceCreate

@pytest.fixture
def mock_repository():
    """Mock repository."""
    return AsyncMock()

@pytest.fixture
def service(mock_repository):
    """Service with mocked repository."""
    return ExperienceService(mock_repository)

class TestExperienceService:
    """Test experience service."""

    @pytest.mark.asyncio
    async def test_get_all_experiences(self, service, mock_repository):
        """Should return all experiences."""
        mock_data = [
            Experience(id=1, title="Senior Dev", company="Tech Co", description="", start_date="2020-01-01")
        ]
        mock_repository.find_all.return_value = mock_data

        result = await service.get_all_experiences()

        assert result == mock_data
        mock_repository.find_all.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_experience(self, service, mock_repository):
        """Should create experience."""
        create_data = ExperienceCreate(
            title="Senior Dev",
            company="Tech Co",
            description="Building things",
            start_date="2020-01-01"
        )
        mock_created = Experience(**create_data.dict(), id=1)
        mock_repository.create.return_value = mock_created

        result = await service.create_experience(create_data)

        assert result.id == 1
        assert result.title == "Senior Dev"
        mock_repository.create.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_experience_not_found(self, service, mock_repository):
        """Should return None for non-existent experience."""
        mock_repository.find_by_id.return_value = None

        result = await service.get_experience(999)

        assert result is None
```

### Repository Testing

```python
# tests/test_experience_repository.py
import pytest
from app.repositories.experience_repository import ExperienceRepository

@pytest.fixture
def repository():
    """Repository with test file."""
    return ExperienceRepository("test_experiences.json")

class TestExperienceRepository:
    """Test experience repository."""

    @pytest.mark.asyncio
    async def test_create_and_find(self, repository):
        """Should create and retrieve experience."""
        experience = {
            "title": "Developer",
            "company": "Tech Co",
            "description": "Test role",
            "start_date": "2020-01-01"
        }

        created = await repository.create(experience)
        found = await repository.find_by_id(created["id"])

        assert found is not None
        assert found["title"] == "Developer"

    @pytest.mark.asyncio
    async def test_update_experience(self, repository):
        """Should update experience."""
        experience = {
            "title": "Developer",
            "company": "Old Co",
            "description": "Test",
            "start_date": "2020-01-01"
        }

        created = await repository.create(experience)
        created["title"] = "Senior Developer"
        updated = await repository.update(created["id"], created)

        assert updated["title"] == "Senior Developer"
```

## Mocking Best Practices

### Mock External APIs

```typescript
// Mock API in component tests
vi.mock('@/features/experience/api/experience.api', () => ({
  experienceApi: {
    getAll: vi
      .fn()
      .mockResolvedValue([{ id: 1, title: 'Senior Dev', company: 'Tech Co' }]),
    create: vi.fn().mockResolvedValue({ id: 1, title: 'New Dev' }),
  },
}));
```

### Mock Redux Store

```typescript
// Use preloaded state instead of mocking
const preloadedState = {
  experience: {
    items: [],
    loading: false,
    error: null,
  },
};
```

## Test Coverage Requirements

### Minimum Coverage by Layer

- **Utils/Helpers**: 100%
- **Selectors**: 100%
- **Reducers/Slices**: 100%
- **Services**: >90%
- **Components**: >80%
- **Sagas/Middleware**: >80%
- **API routes**: >80%

### Coverage Verification

```bash
# Frontend
vitest --coverage

# Backend
pytest --cov=app tests/
```

## Testing Best Practices

### ✅ DO

- Test behavior, not implementation
- Use descriptive test names
- One assertion per test when possible
- Mock external dependencies
- Use fixtures for setup/teardown
- Test error cases and edge cases
- Keep tests fast and independent
- Name tests: `should [action] [condition]`

### ❌ DON'T

- Test internal implementation details
- Skip tests
- Create test interdependencies
- Mock things that don't need mocking
- Use generic test names
- Test multiple behaviors in one test
- Sleep/wait in tests (use timers)
- Test framework functionality

---

**Remember: High coverage. Full behavior testing. No skipped tests. Brutal truth.**
