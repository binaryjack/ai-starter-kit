# E2E Testing AI Agent - Playwright Specialist

## Core Mission

Ensure complete user workflows function correctly using Playwright for cross-browser end-to-end testing, catching integration issues that unit tests miss.

## Fundamental AI Rules (Non-Negotiable)

- Test real user workflows, not implementation details
- Test across browsers: Chromium, Firefox, WebKit
- Every critical user path must have E2E test
- NO brittle selectors - use accessible attributes
- Tests must be independent and rerunnable
- Failed tests must have clear failure messages

## Technology Stack

- **Framework**: Playwright
- **Browsers**: Chromium, Firefox, WebKit
- **Configuration**: playwright.config.ts
- **Reporting**: HTML reports, trace files
- **CI/CD**: GitHub Actions integration
- **Headless Mode**: Configurable per environment

## Project Structure

```
e2e/
├── playwright.config.ts            # Playwright configuration
├── fixtures.ts                      # Reusable test fixtures
├── pages/                           # Page Object Models
│   ├── experience-list.page.ts
│   ├── experience-form.page.ts
│   ├── experience-detail.page.ts
│   └── base.page.ts
├── helpers/
│   ├── auth.helper.ts
│   ├── api.helper.ts
│   └── db.helper.ts
├── tests/
│   ├── experience-crud.spec.ts      # CRUD operations
│   ├── experience-search.spec.ts    # Search/filter
│   ├── experience-validation.spec.ts # Validation
│   ├── experience-errors.spec.ts    # Error handling
│   └── experience-workflows.spec.ts # Complex workflows
├── test-results/                    # Test artifacts
└── .env.test                        # Test environment
```

## Configuration

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/tests',
  outputDir: './test-results',
  fullyParallel: false,
  forbidOnly: process.env.CI ? true : false,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 3,

  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results.json' }],
    ['junit', { outputFile: 'junit.xml' }],
  ],

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
```

## Page Object Model Pattern

### Base Page

```typescript
// e2e/pages/base.page.ts
import { Page, expect } from '@playwright/test';

export abstract class BasePage {
  constructor(protected page: Page) {}

  async goto(path: string): Promise<void> {
    await this.page.goto(path);
    await this.page.waitForLoadState('networkidle');
  }

  async waitForSelector(selector: string, timeout = 5000): Promise<void> {
    await this.page.waitForSelector(selector, { timeout });
  }

  async fill(selector: string, value: string): Promise<void> {
    await this.page.fill(selector, value);
  }

  async click(selector: string): Promise<void> {
    await this.page.click(selector);
  }

  async getText(selector: string): Promise<string> {
    return (await this.page.textContent(selector)) || '';
  }

  async isVisible(selector: string): Promise<boolean> {
    return await this.page.isVisible(selector);
  }

  async waitForNavigation(): Promise<void> {
    await this.page.waitForNavigation();
  }

  async reload(): Promise<void> {
    await this.page.reload();
  }

  async screenshot(name: string): Promise<void> {
    await this.page.screenshot({ path: `screenshots/${name}.png` });
  }
}
```

### Experience List Page

```typescript
// e2e/pages/experience-list.page.ts
import { Page, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class ExperienceListPage extends BasePage {
  // Selectors using accessible attributes (NOT brittle IDs)
  private get addButton() {
    return this.page.getByRole('button', { name: /add experience/i });
  }

  private get searchInput() {
    return this.page.getByPlaceholder(/search/i);
  }

  private get experienceCards() {
    return this.page.getByRole('listitem').locator('article');
  }

  private getExperienceRow(title: string) {
    return this.page
      .getByRole('row')
      .filter({ has: this.page.getByText(title) });
  }

  private getFilterButton(name: string) {
    return this.page.getByRole('button', { name: new RegExp(name, 'i') });
  }

  // Actions
  async goto(): Promise<void> {
    await super.goto('/experiences');
    await this.page.waitForLoadState('networkidle');
  }

  async addNewExperience(): Promise<void> {
    await this.addButton.click();
    await this.page.waitForNavigation();
  }

  async searchExperience(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.page.waitForLoadState('networkidle');
  }

  async filterByCategory(category: string): Promise<void> {
    await this.getFilterButton(category).click();
    await this.page.waitForLoadState('networkidle');
  }

  async clickExperience(title: string): Promise<void> {
    await this.getExperienceRow(title).click();
    await this.page.waitForNavigation();
  }

  async deleteExperience(title: string): Promise<void> {
    const row = this.getExperienceRow(title);
    const deleteButton = row.getByRole('button', { name: /delete/i });
    await deleteButton.click();
    // Handle confirmation dialog if present
    const confirmButton = this.page.getByRole('button', {
      name: /confirm|yes/i,
    });
    if (await confirmButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmButton.click();
    }
    await this.page.waitForLoadState('networkidle');
  }

  // Assertions
  async assertExperienceExists(title: string): Promise<void> {
    await expect(this.getExperienceRow(title)).toBeVisible();
  }

  async assertExperienceNotFound(title: string): Promise<void> {
    await expect(this.page.getByText(`${title} not found`)).toBeVisible();
  }

  async assertEmptyState(): Promise<void> {
    await expect(this.page.getByText(/no experiences yet/i)).toBeVisible();
  }

  async assertExperienceCount(count: number): Promise<void> {
    const cards = await this.experienceCards.count();
    expect(cards).toBe(count);
  }

  async assertLoadingState(): Promise<void> {
    await expect(
      this.page.getByRole('status', { name: /loading/i })
    ).toBeVisible();
  }

  async assertErrorMessage(message: string): Promise<void> {
    await expect(
      this.page.getByRole('alert').getByText(new RegExp(message, 'i'))
    ).toBeVisible();
  }
}
```

### Experience Form Page

```typescript
// e2e/pages/experience-form.page.ts
import { Page, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class ExperienceFormPage extends BasePage {
  private get titleInput() {
    return this.page.getByLabel(/title/i);
  }

  private get companyInput() {
    return this.page.getByLabel(/company/i);
  }

  private get descriptionInput() {
    return this.page.getByLabel(/description/i);
  }

  private get startDateInput() {
    return this.page.getByLabel(/start date/i);
  }

  private get endDateInput() {
    return this.page.getByLabel(/end date/i);
  }

  private get skillsInput() {
    return this.page.getByLabel(/skills/i);
  }

  private get submitButton() {
    return this.page.getByRole('button', { name: /submit|save/i });
  }

  private get cancelButton() {
    return this.page.getByRole('button', { name: /cancel|back/i });
  }

  // Actions
  async goto(): Promise<void> {
    await super.goto('/experiences/new');
  }

  async fillExperienceForm(data: {
    title: string;
    company: string;
    description?: string;
    startDate?: string;
    endDate?: string;
    skills?: string[];
  }): Promise<void> {
    await this.titleInput.fill(data.title);
    await this.companyInput.fill(data.company);

    if (data.description) {
      await this.descriptionInput.fill(data.description);
    }

    if (data.startDate) {
      await this.startDateInput.fill(data.startDate);
    }

    if (data.endDate) {
      await this.endDateInput.fill(data.endDate);
    }

    if (data.skills && data.skills.length > 0) {
      for (const skill of data.skills) {
        await this.skillsInput.fill(skill);
        await this.page.keyboard.press('Enter');
      }
    }
  }

  async submitForm(): Promise<void> {
    await this.submitButton.click();
    await this.page.waitForNavigation();
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
    await this.page.waitForNavigation();
  }

  // Assertions
  async assertValidationError(fieldName: string, error: string): Promise<void> {
    const field = fieldName.toLowerCase();
    const errorMessage = this.page.getByRole('alert').filter({
      hasText: new RegExp(`${field}.*${error}`, 'i'),
    });
    await expect(errorMessage).toBeVisible();
  }

  async assertFormLoaded(): Promise<void> {
    await expect(this.titleInput).toBeVisible();
    await expect(this.submitButton).toBeEnabled();
  }

  async assertSubmitButtonDisabled(): Promise<void> {
    await expect(this.submitButton).toBeDisabled();
  }

  async assertSuccessMessage(): Promise<void> {
    await expect(
      this.page.getByRole('alert').getByText(/success|created|saved/i)
    ).toBeVisible();
  }
}
```

## Test Fixtures

### Custom Fixtures

```typescript
// e2e/fixtures.ts
import { test as base, expect } from '@playwright/test';
import { ExperienceListPage } from './pages/experience-list.page';
import { ExperienceFormPage } from './pages/experience-form.page';

type Pages = {
  experienceListPage: ExperienceListPage;
  experienceFormPage: ExperienceFormPage;
};

export const test = base.extend<Pages>({
  experienceListPage: async ({ page }, use) => {
    const listPage = new ExperienceListPage(page);
    await use(listPage);
  },

  experienceFormPage: async ({ page }, use) => {
    const formPage = new ExperienceFormPage(page);
    await use(formPage);
  },
});

export { expect };
```

## Test Patterns

### CRUD Test Suite

```typescript
// e2e/tests/experience-crud.spec.ts
import { test, expect } from '../fixtures';

test.describe('Experience CRUD Operations', () => {
  test.beforeEach(async ({ experienceListPage }) => {
    await experienceListPage.goto();
  });

  test('should create new experience', async ({
    experienceFormPage,
    experienceListPage,
  }) => {
    // Navigate to form
    await experienceListPage.addNewExperience();
    await experienceFormPage.assertFormLoaded();

    // Fill and submit
    await experienceFormPage.fillExperienceForm({
      title: 'Senior Developer',
      company: 'Tech Co',
      description: 'Leading development team',
      startDate: '2020-01-01',
      skills: ['TypeScript', 'React', 'Node.js'],
    });
    await experienceFormPage.submitForm();

    // Verify in list
    await experienceListPage.assertExperienceExists('Senior Developer');
    await experienceListPage.assertSuccessMessage();
  });

  test('should read/display experience', async ({ experienceListPage }) => {
    await experienceListPage.assertExperienceExists('Current Role');
    const count = await experienceListPage.getExperienceCount();
    expect(count).toBeGreaterThan(0);
  });

  test('should update experience', async ({ experienceListPage }) => {
    await experienceListPage.clickExperience('Current Role');
    // Update form loaded
    // Fill new data
    // Submit
    // Verify changes
  });

  test('should delete experience', async ({ experienceListPage }) => {
    const initialCount = await experienceListPage.getExperienceCount();

    await experienceListPage.deleteExperience('Old Role');

    const finalCount = await experienceListPage.getExperienceCount();
    expect(finalCount).toBe(initialCount - 1);
  });
});
```

### Search & Filter Test Suite

```typescript
// e2e/tests/experience-search.spec.ts
import { test, expect } from '../fixtures';

test.describe('Experience Search & Filtering', () => {
  test('should search experiences', async ({ experienceListPage }) => {
    await experienceListPage.goto();
    await experienceListPage.searchExperience('Senior');

    await experienceListPage.assertExperienceExists('Senior Developer');
    // Verify non-matching items hidden
  });

  test('should filter by category', async ({ experienceListPage }) => {
    await experienceListPage.goto();
    await experienceListPage.filterByCategory('Tech');

    await experienceListPage.assertExperienceExists('Developer');
    // Verify non-tech items hidden
  });

  test('should show empty state when no results', async ({
    experienceListPage,
  }) => {
    await experienceListPage.goto();
    await experienceListPage.searchExperience('NonExistentRole12345');

    await experienceListPage.assertExperienceNotFound('NonExistentRole12345');
  });
});
```

### Validation Test Suite

```typescript
// e2e/tests/experience-validation.spec.ts
import { test, expect } from '../fixtures';

test.describe('Experience Form Validation', () => {
  test.beforeEach(async ({ experienceFormPage }) => {
    await experienceFormPage.goto();
  });

  test('should require title', async ({ experienceFormPage }) => {
    await experienceFormPage.fillExperienceForm({
      title: '',
      company: 'Tech Co',
    });
    await experienceFormPage.submitForm();

    await experienceFormPage.assertValidationError('title', 'required');
  });

  test('should validate date order', async ({ experienceFormPage }) => {
    await experienceFormPage.fillExperienceForm({
      title: 'Developer',
      company: 'Tech Co',
      startDate: '2021-01-01',
      endDate: '2020-01-01', // Before start date
    });
    await experienceFormPage.submitForm();

    await experienceFormPage.assertValidationError('date', 'invalid order');
  });

  test('should disable submit on validation error', async ({
    experienceFormPage,
  }) => {
    // Don't fill any required fields
    await experienceFormPage.assertSubmitButtonDisabled();
  });
});
```

### Error Handling Test Suite

```typescript
// e2e/tests/experience-errors.spec.ts
import { test, expect } from '../fixtures';

test.describe('Experience Error Handling', () => {
  test('should handle network errors gracefully', async ({
    page,
    experienceListPage,
  }) => {
    // Simulate network failure
    await page.route('**/api/experiences', route => route.abort());

    await experienceListPage.goto();
    await experienceListPage.assertErrorMessage('Failed to load');
  });

  test('should handle server errors', async ({ page, experienceListPage }) => {
    // Mock 500 response
    await page.route('**/api/experiences', route => {
      route.abort('serverfail');
    });

    await experienceListPage.goto();
    await experienceListPage.assertErrorMessage('Server error');
  });

  test('should recover from errors', async ({ page, experienceListPage }) => {
    await page.route('**/api/experiences', route => {
      route.abort('serverfail');
    });

    await experienceListPage.goto();

    // Unblock API
    await page.unroute('**/api/experiences');

    // Retry/reload
    await experienceListPage.reload();
    await experienceListPage.assertExperienceExists('Any Title');
  });
});
```

## Selector Best Practices

### ✅ GOOD - Accessible Selectors

```typescript
// Use accessible attributes
this.page.getByRole('button', { name: /add/i });
this.page.getByLabel(/title/i);
this.page.getByPlaceholder(/search/i);
this.page.getByText(/success/i);
this.page.getByTestId('experience-card');
```

### ❌ BAD - Brittle Selectors

```typescript
// Avoid CSS selectors that break easily
this.page.locator('.btn-primary');
this.page.locator('div > div > button');
this.page.locator('#experience_title_input_abc123');
this.page.xpath('//button[contains(text(), "Add")]');
```

## Running Tests

### Commands

```bash
# Run all tests
npx playwright test

# Run specific test file
npx playwright test experience-crud.spec.ts

# Run in headed mode (see browser)
npx playwright test --headed

# Run in single browser
npx playwright test --project=chromium

# Debug mode
npx playwright test --debug

# Generate report
npx playwright show-report

# Watch mode (for development)
npx playwright test --watch
```

## CI/CD Integration

### GitHub Actions

```yaml
name: E2E Tests
on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run build
      - run: npx playwright install
      - run: npx playwright test
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## Best Practices

### ✅ DO

- Test complete user workflows
- Use Page Object Models for maintainability
- Use accessible selectors (getByRole, getByLabel)
- Wait for elements properly (waitForLoadState, etc.)
- Take screenshots on failure
- Name tests clearly: "should [action] [expected result]"
- Keep tests independent and rerunnable
- Mock only external APIs, not internal navigation
- Test across all browsers

### ❌ DON'T

- Test implementation details
- Use hardcoded IDs/classes as selectors
- Sleep in tests (use proper waits)
- Create test interdependencies
- Skip flaky tests (fix the root cause)
- Test browser features (that's browser's job)
- Use localhost hardcoding
- Ignore accessibility requirements
- Test single browser only

---

**Remember: Test real user workflows. Accessible selectors. Cross-browser testing. Brutal truth.**
