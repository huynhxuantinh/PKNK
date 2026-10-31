---
name: pknk-frontend
description: >
  Comprehensive frontend skill for the PKNK Dental Clinic Chain project.
  Covers the tech stack, project structure, design system, API conventions,
  routing, auth, and coding standards specific to this codebase. Read before
  building or modifying any frontend UI in the PKNK project.
---

# PKNK Frontend Skill

> **Read `frontend/DESIGN.md` before touching any UI.**  It is the single
> source of truth for colours, typography, spacing, components, and
> do's/don'ts.  The frontmatter YAML contains every design token; the
> prose body explains how to combine them.

## 1  Tech Stack

| Layer | Tool | Version | Notes |
|---|---|---|---|
| Framework | React | 19 | Function components, hooks only |
| Router | react-router-dom | 7 | `createBrowserRouter` + nested `<Route>` |
| Language | TypeScript | 6 | `strict: true`, `noEmit`, Bundler module resolution |
| Bundler | Vite | 8 | `@vitejs/plugin-react`, dev proxy to Django at `/api` |
| Font | Montserrat Variable | `@fontsource-variable/montserrat` | Substitute for Gotham (see DESIGN.md) |
| Map | Leaflet | 1.9 | `@types/leaflet` for TS |
| Testing | Vitest 5 | `vitest run` | `vitest/globals` in tsconfig types |
| Lint | ESLint 10 | `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` |
| Schema validation | zod | (in node_modules) | Used for form/data validation |

### What is NOT in the stack

- **No Tailwind CSS** — all styling is vanilla CSS in `src/styles.css` using
  CSS custom properties.
- **No component library** (no shadcn, no MUI, no Ant Design).
- **No TanStack Query** — data fetching uses plain `fetch` via `src/api/client.ts`.
- **No state management library** — state lives in React context
  (`AuthContext`) and local `useState`/`useReducer`.

## 2  Project Structure

```
frontend/
├── src/
│   ├── api/            # API client, endpoint modules (booking, billing, dentist, management, organization)
│   ├── auth/           # AuthContext, AuthBar, RequireRole, roles, authRedirect
│   ├── components/     # Shared UI components
│   │   ├── billing/
│   │   ├── branch-management/
│   │   ├── clinical/
│   │   ├── dentist/
│   │   └── organization-management/
│   ├── features/       # Domain logic (booking, billing, dentist, organization, pricing, profile)
│   ├── pages/          # Route-level page components (one export per route)
│   ├── seo/            # <Seo> component, seoConfig
│   ├── services/       # routing.ts (route constants), routeDisplay
│   ├── types/          # api.ts — shared TypeScript interfaces
│   ├── utils/          # hcmDateTime (timezone-aware date helpers)
│   ├── App.tsx          # Router definition
│   ├── main.tsx         # Entry point
│   ├── styles.css       # ALL CSS lives here
│   └── vite-env.d.ts
├── public/             # Static assets (branding, hero images, robots.txt, sitemap)
├── DESIGN.md           # Design system specification
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### Naming Conventions

| Kind | Convention | Example |
|---|---|---|
| Page component | `PascalCase` + `Page` suffix | `BookingPage.tsx` |
| Feature module | `camelCase` | `bookingState.ts` |
| API module | `camelCase` | `booking.ts` in `api/` |
| Test file | Co-located, `.test.ts(x)` suffix | `bookingState.test.ts` |
| CSS class | `kebab-case` | `.booking-summary` |

## 3  Design System Summary

> Full spec in `frontend/DESIGN.md`.

### CSS Custom Properties (`:root`)

```css
--ink: #162c3a;
--ink-deep: #12384a;
--muted: #61717c;
--line: #dce9ed;
--surface: #ffffff;
--cream: #ffffff;
--primary: #148eb0;
--primary-dark: #087493;
--soft: #f2fafb;
--lime: #dff5f8;
--peach: #f2fafb;
--gold: #148eb0;
--danger: #de2828;
--shadow: 0 4px 16px rgba(18,56,74,.05), 0 16px 40px rgba(18,56,74,.05);
--font-display: "Montserrat Variable", Montserrat, Arial, sans-serif;
```

### Key Design Rules

1. **One CSS file** — all styles go in `src/styles.css`.  No CSS modules,
   no inline `style` objects, no CSS-in-JS.
2. **No Tailwind utility classes** — write semantic class names.
3. **CSS custom properties** for colours/fonts — never hard-code hex values
   that already have a variable.
4. **Button base class** — `.button` + modifier: `.button-primary`,
   `.button-secondary`, `.button-quiet`, `.button-wide`, `.button-light`.
5. **Border-radius** — controls use 2px (`border-radius: 2px`); cards use
   8px; decorative panels go up to 16–32px.  Do not round everything the same.
6. **Elevation** — almost flat.  Use `var(--line)` borders, not box-shadows,
   for card boundaries.  The only shadow is `var(--shadow)` at ~5% opacity.
7. **Responsive breakpoints** — 1120px (tablet), 760px (mobile), 480px
   (small mobile).
8. **Font weight contrast** — headings at 600–750, body at 400.  The
   hierarchy comes from weight, not just size.
9. **Focus visible** — `outline: 3px solid rgba(8, 127, 115, .28)` with
   3px offset.  Always preserve this on interactive elements.

### Component Patterns

- **Cards**: bordered with `var(--line)`, background `var(--surface)` or
  `#fbfdfb`, hover lifts border colour to `#b7ecda` (mint accent).
- **Selected state**: `border-color: var(--primary); background: var(--soft);
  box-shadow: inset 0 0 0 1px var(--primary)`.
- **Disabled**: `cursor: not-allowed; opacity: .55`.
- **Loading spinner**: `.state-loading::before` pseudo-element with `spin`
  animation.
- **Error banner**: `.error-banner` with pink background.
- **Empty state**: `.home-state` or `.state-message`.

## 4  Routing

All routes are defined in `src/App.tsx` using `createBrowserRouter`.

### Route areas (access control)

| Area | Routes | Guard |
|---|---|---|
| Public | `/`, `/chi-nhanh/:branchId`, `/bang-gia`, `/ve-dentavie`, auth pages | None |
| Authenticated | `/doi-mat-khau` | `<RequireRole area="AUTHENTICATED">` |
| Patient | `/dat-lich`, `/ho-so`, `/lich-hen`, etc. | `<RequireRole area="PATIENT">` |
| Dentist | `/bac-si`, `/bac-si/chon-chi-nhanh`, etc. | `<RequireRole area="DENTIST">` |
| Management | `/quan-ly-chi-nhanh/**` | `<RequireRole area="MANAGEMENT">` |
| Organization | `/quan-ly-to-chuc/**` | `<RequireRole area="ORGANIZATION">` |

Route paths are Vietnamese slug-based.  Use `src/services/routing.ts` for
constants; never hard-code path strings in components.

## 5  API Integration

### API client (`src/api/client.ts`)

- Wraps `fetch` with automatic `Authorization: Bearer <token>` header.
- Handles token refresh via `/api/v1/auth/refresh/`.
- Base URL: proxied through Vite dev server (`/api` → Django `8000`).

### API modules

| Module | Endpoints |
|---|---|
| `booking.ts` | Branches, services, slots, holds, confirm |
| `billing.ts` | Patient invoices, payOS |
| `dentist.ts` | Dentist schedule, examinations, clinical encounters |
| `management.ts` | Branch appointments, staff schedules, invoices, config, reports |
| `organization.ts` | Org-level branches, staff, services, audit |

### Data types

All API response types are in `src/types/api.ts`.  When adding new types:
- Use `interface` for API shapes (not `type` alias).
- Keep property names identical to the JSON API.
- Add JSDoc if the field's purpose isn't obvious.

## 6  Auth

- `AuthContext` provides `user`, `login()`, `logout()`, `refreshToken()`.
- `AuthBar` renders the login popover (guest) or the user menu (logged in).
- `RequireRole` wraps `<Outlet>` and redirects unauthorized users.
- Roles: `PATIENT`, `DENTIST`, `BRANCH_ADMIN`, `ADMIN`.
- Auth redirect logic is in `auth/authRedirect.ts`.

## 7  Coding Standards

### TypeScript

- `strict: true` — no `any` unless absolutely necessary (prefer `unknown`).
- No barrel files (`index.ts`) — import directly from the module.
- Prefer `interface` over `type` for object shapes.
- Co-locate tests with source: `feature.ts` → `feature.test.ts`.

### React

- Function components only, no class components.
- Hooks: `useState`, `useEffect`, `useRef`, `useCallback`, `useMemo`.
- No `React.FC` — type props inline: `export function Foo({ bar }: Props)`.
- Use `key` correctly in lists — never use array index as key for dynamic lists.
- Error boundaries: `src/components/ErrorBoundary.tsx` wraps the entire router.

### CSS

- Add new styles to the END of `src/styles.css` (or near related blocks).
- Use the existing CSS variable system — don't create new variables without
  checking DESIGN.md first.
- Mobile-first is NOT the convention here — the base styles are desktop,
  with `@media (max-width: ...)` overrides.
- Minified one-line CSS blocks (like `.branch-management-*`) are acceptable
  for component-scoped styles — match the existing formatting convention
  of the section you're editing.

### Testing

- `vitest run` — tests must pass before commit.
- Test business logic in `features/` — pure functions are easy to test.
- Test presentation logic in `components/` with `.test.tsx`.
- Use `describe` + `it` naming: `describe('bookingState', () => { it('should ...') })`.

## 8  Checklist Before Building UI

1. ☐ Read `frontend/DESIGN.md` — especially the colours, spacing, and
   do's/don'ts sections.
2. ☐ Check `src/types/api.ts` for existing data types.
3. ☐ Check `src/api/` for existing API modules.
4. ☐ Check `src/services/routing.ts` for route constants.
5. ☐ Check `src/styles.css` for existing class names that might conflict or
   that you can reuse.
6. ☐ Verify responsive behaviour at 1120px, 760px, and 480px breakpoints.
7. ☐ Verify `:focus-visible` outlines on all interactive elements.
8. ☐ Run `npm run lint` — zero warnings allowed.
9. ☐ Run `npm run test` — all tests pass.

## 9  Common Gotchas

- **Proxy**: dev proxy only forwards `/api` paths.  Don't use absolute URLs.
- **Vietnamese text**: UI labels use Vietnamese.  Keep translations consistent
  with existing pages — check `HomePage.tsx` and the sidebar nav for the
  established vocabulary.
- **DateTime**: All dates use Asia/Ho_Chi_Minh timezone.  Use
  `src/utils/hcmDateTime.ts` for formatting.
- **Auth tokens**: stored in memory (AuthContext), not localStorage.  Page
  refresh loses the session; the app calls `/api/v1/auth/refresh/` on mount
  to restore.
- **SEO**: public pages should use the `<Seo>` component from `src/seo/`.
- **Leaflet CSS**: imported in HTML, not in JS.  Don't add a second import.
