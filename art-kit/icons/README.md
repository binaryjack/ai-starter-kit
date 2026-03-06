# AI Agencee Icon System

A comprehensive set of custom SVG icons designed to match the AI Agencee brand identity. All icons feature:

- **Brand Colors**: `#818CF8` (periwinkle accent), `#231F20` (dark), `#FFFFFF` (light)
- **Geometric Style**: Clean, professional design inspired by the AI Agencee logo
- **Dual Themes**: Light and dark variants for every icon
- **Standard Size**: 24×24 viewBox for consistent scaling
- **Transparent Backgrounds**: All icons have transparent backgrounds

## 🔄 Icon Sync for Web Packages

**IMPORTANT**: After adding or modifying icons in this directory, you must sync them to package public folders:

```bash
# From repository root
pnpm sync-icons
```

This copies all icons from `art-kit/icons/` to:
- `packages/showcase-web/public/art-kit/icons/`
- `packages/dag-editor/public/art-kit/icons/`

The sync script is located at `scripts/sync-icons.js` and runs automatically before builds, but should be run manually when:
- Adding new icon files
- Modifying existing icons
- Setting up a fresh clone

## Directory Structure

```
art-kit/icons/
├── nodes/          # DAG editor node type icons
├── agents/         # Agent workflow and demo icons
├── features/       # Showcase website feature icons
└── ui/             # General UI element icons
```

## Node Icons (DAG Editor)

Located in `icons/nodes/`

| Icon | Emoji | Light | Dark | Description |
|------|-------|-------|------|-------------|
| Worker | 🤖 | `worker-light.svg` | `worker-dark.svg` | AI agent/robot worker node |
| Supervisor | 👁 | `supervisor-light.svg` | `supervisor-dark.svg` | Supervisor/oversight node |
| Trigger | ⚡ | `trigger-light.svg` | `trigger-dark.svg` | Event trigger node |
| Budget | 💰 | `budget-light.svg` | `budget-dark.svg` | Cost/budget tracking node |

## Main Agent Icons

Located in `icons/agents/`

| Icon | Emoji | Light | Dark | Description |
|------|-------|-------|------|-------------|
| Business Analyst | 📋 | `business-analyst-light.svg` | `business-analyst-dark.svg` | Requirements/documentation |
| Architecture | 🏗️ | `architecture-light.svg` | `architecture-dark.svg` | System design/blueprint |
| Backend | ⚙️ | `backend-light.svg` | `backend-dark.svg` | Backend development |
| Frontend | 🎨 | `frontend-light.svg` | `frontend-dark.svg` | UI/UX design |
| Testing | 🧪 | `testing-light.svg` | `testing-dark.svg` | Quality assurance |
| E2E | 🌐 | `e2e-light.svg` | `e2e-dark.svg` | End-to-end testing |

## Demo Agent Icons

Located in `icons/agents/`

| Icon | Emoji | Light | Dark | Description |
|------|-------|-------|------|-------------|
| Code Review | 📝 | `code-review-light.svg` | `code-review-dark.svg` | Code inspection/review |
| Summary | 📊 | `summary-light.svg` | `summary-dark.svg` | Analytics/reporting |
| Search | 🔍 | `search-light.svg` | `search-dark.svg` | Search/discovery |
| User | 👤 | `user-light.svg` | `user-dark.svg` | User profile/account |
| Database | 💾 | `database-light.svg` | `database-dark.svg` | Data storage |
| Mobile | 📱 | `mobile-light.svg` | `mobile-dark.svg` | Mobile app/device |
| Target | 🎯 | `target-light.svg` | `target-dark.svg` | Goals/objectives |
| Rocket | 🚀 | `rocket-light.svg` | `rocket-dark.svg` | Launch/deploy |
| Sync | 🔄 | `sync-light.svg` | `sync-dark.svg` | Refresh/synchronize |
| Map | 🗺️ | `map-light.svg` | `map-dark.svg` | Navigation/routing |
| Bug | 🐛 | `bug-light.svg` | `bug-dark.svg` | Debug/issue tracking |
| Idea | 💡 | `idea-light.svg` | `idea-dark.svg` | Innovation/concepts |
| Package | 📦 | `package-light.svg` | `package-dark.svg` | Dependencies/modules |
| Cloud | ☁️ | `cloud-light.svg` | `cloud-dark.svg` | Cloud services |
| Network | 🔌 | `network-light.svg` | `network-dark.svg` | Connections/API |
| Tools | 🔧 | `tools-light.svg` | `tools-dark.svg` | Configuration/settings |
| Metrics | 📈 | `metrics-light.svg` | `metrics-dark.svg` | Performance metrics |
| Mail | 📧 | `mail-light.svg` | `mail-dark.svg` | Notifications/messages |
| Calendar | 📅 | `calendar-light.svg` | `calendar-dark.svg` | Scheduling/timeline |

## Feature Icons

Located in `icons/features/`

| Icon | Emoji | Light | Dark | Description |
|------|-------|-------|------|-------------|
| Branching | 🔀 | `branching-light.svg` | `branching-dark.svg` | Workflow branching |
| Security | 🛡️ | `security-light.svg` | `security-dark.svg` | Security features |
| Performance | ⚡ | `performance-light.svg` | `performance-dark.svg` | Speed/optimization |
| Auth | 🔐 | `auth-light.svg` | `auth-dark.svg` | Authentication |
| Document | 📋 | `document-light.svg` | `document-dark.svg` | Documentation |
| Enterprise | 🏢 | `enterprise-light.svg` | `enterprise-dark.svg` | Enterprise features |
| Encryption | 🔏 | `encryption-light.svg` | `encryption-dark.svg` | Data encryption |
| Plugin | 🔌 | `plugin-light.svg` | `plugin-dark.svg` | Extensions/integrations |
| Modular | 🧱 | `modular-light.svg` | `modular-dark.svg` | Modularity/components |
| API | 📡 | `api-light.svg` | `api-dark.svg` | API/broadcast |

## UI Element Icons

Located in `icons/ui/`

| Icon | Emoji | Light | Dark | Description |
|------|-------|-------|------|-------------|
| Check | ✓ | `check-light.svg` | `check-dark.svg` | Success/confirmation |
| Close | ✗ | `close-light.svg` | `close-dark.svg` | Cancel/close |
| Warning | ⚠️ | `warning-light.svg` | `warning-dark.svg` | Alert/caution |
| Checkbox | ✅ | `checkbox-light.svg` | `checkbox-dark.svg` | Completed task |

## Usage Examples

### React/TypeScript

```tsx
import WorkerIcon from '@/art-kit/icons/nodes/worker-light.svg';

function NodeComponent() {
  return <img src={WorkerIcon} alt="Worker Node" className="w-6 h-6" />;
}
```

### Direct SVG Import

```tsx
import { ReactComponent as WorkerIcon } from '@/art-kit/icons/nodes/worker-light.svg';

function NodeComponent() {
  return <WorkerIcon className="w-6 h-6 text-primary" />;
}
```

### Theme-Aware Usage

```tsx
function ThemedIcon({ name }: { name: string }) {
  const theme = useTheme();
  const variant = theme === 'dark' ? 'dark' : 'light';
  
  return <img src={`/art-kit/icons/nodes/${name}-${variant}.svg`} />;
}
```

## Design Guidelines

### Color Usage
- **Primary Color** (`#818CF8`): Use for accents, highlights, and interactive elements
- **Dark Theme** (`#231F20`): Main fill color for light backgrounds
- **Light Theme** (`#FFFFFF`): Main fill color for dark backgrounds

### Naming Convention
- Pattern: `{category}-{name}-{variant}.svg`
- Categories: `nodes`, `agents`, `features`, `ui`
- Variants: `light`, `dark`

### Technical Specifications
- ViewBox: `0 0 24 24`
- Format: Optimized SVG with embedded styles
- Classes: `.st0` (main fill), `.st1` (accent fill)
- Background: Transparent (no enable-background attribute)

## Migration Guide

Replace emoji usage with icon imports:

**Before:**
```tsx
<span>🤖</span>
```

**After:**
```tsx
import WorkerIcon from '@/art-kit/icons/nodes/worker-light.svg';
<img src={WorkerIcon} className="w-5 h-5" />
```

## Icon Count

- **Node Icons**: 4 unique × 2 variants = 8 files
- **Main Agent Icons**: 6 unique × 2 variants = 12 files
- **Demo Agent Icons**: 19 unique × 2 variants = 38 files
- **Feature Icons**: 10 unique × 2 variants = 20 files
- **UI Icons**: 4 unique × 2 variants = 8 files

**Total**: 43 unique icons, 86 total files

---

*Last Updated: 2024*
*Brand Colors: #818CF8 (accent), #231F20 (dark), #FFFFFF (light)*
