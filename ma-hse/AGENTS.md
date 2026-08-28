# MA-HSE — Multi-Plant EHS Platform

## Tech Stack
- **Next.js 16.2.6** (App Router, `"use client"` for interactivity, server by default)
- **TypeScript 5.9** strict, `@/*` path alias
- **Prisma 6.19** + PostgreSQL 16 (port 5433, Docker)
- **NextAuth v4** JWT strategy, PrismaAdapter, Credentials + Email providers
- **Tailwind CSS v4** via `@tailwindcss/postcss`, CSS custom properties theming ("normal"/"black")
- **Zod 4** for validation (`lib/validation/dtos.ts`)
- **react-hook-form 7 + zod resolvers** for forms
- **next-intl 4** (cookie-driven, localePrefix: "never", 7 languages: pt/it/en/pl/de/ro/fr)
- **lucide-react** icons, `class-variance-authority` + `clsx` + `tailwind-merge` (`cn()`)
- **BullMQ + Redis** for background jobs (port 6380)
- **MinIO (S3)** for file attachments
- **Pino** structured logging
- **Vitest** (unit) + **Playwright** (e2e)

## Project Structure
```
app/(secure)/app/[plant]/...      Plant pages (dashboards, comms, actions, sewo, smat, etc.)
app/(secure)/app/corporate/...    Cross-plant corporate view
app/(secure)/app/settings/        N0 system settings
components/feature/               Feature components (51 files): tables, forms, managers, dashboards
components/ui/                    Primitives: button, card, badge, app-surface
components/layout/                Providers, PlantNav, ThemeToggle, LogoutButton
lib/auth/                         NextAuth config, session helpers, ensure-default-admin
lib/rbac/                         guards.ts, permissions.ts, evaluator.ts, user-management.ts
lib/services/                     32 services: communication, action, sewo, notification, etc.
lib/validation/dtos.ts            All Zod schemas for API input validation
lib/ui-language.ts                Runtime UI dictionary per module/locale
prisma/schema.prisma              Full schema (1253 lines, ~45 models)
prisma/seed.ts                    Comprehensive seed (1846 lines)
tests/unit/                       36 Vitest files
tests/e2e/                        Playwright smoke test
```

## RBAC Roles (privilege descending)
1. **N0_ADMIN** — System admin, bypasses ALL plant checks (no plantId in session)
2. **N1_CORPORATE** — Cross-plant global role (no plantId in session), creates users, validates, approves S-EWO
3. **N2_PLANT_MANAGER** — Plant-level, approves S-EWO
4. **N3_SAFETY** — Validates communications, manages plant admin
5. **N4_SUPERVISOR** — Creates actions and closes only actions assigned to them
6. **N5_OPERATOR** — Creates communications/actions
7. **N6_HR** — Plant HR role: full Competences access (same as N3), full Communications and Occupational Health access, closes only actions assigned to them, and has read-only S-EWO access

Public QR/link submissions are not user roles; they are represented by `PlantAccessTokenType` and `CommunicationSource`.

## Key Auth Patterns
- Session type: `{ user: { id, language, mustChangePassword, plantRoles: [{ plantId, plantCode, role, canSeeClinical }] } }`
- API guard: `const auth = await requirePlantAccess(plantCode, [RoleCode.N1_CORPORATE, ...]); if ("error" in auth) return auth.error;`
- N0 bypass: `hasPlantAccess()` always returns true for N0; N1 bypasses plant scope for non-N0-only routes
- Scope rule: N0/N1 must have `plantId: null`; N2/N3/N4/N5/N6_HR must have a plant. Multi-plant N3 is represented by one `UserPlantRole` per plant.
- Default admin created on login attempt in non-prod (`ensure-default-admin.ts`)
- Login redirect: N0 → `/app/settings`, N1 → `/app/corporate`, others → `/app/{primaryPlant}/dashboards`

## UI & Styling Conventions
- CSS classes: `.app-card`, `.app-hero`, `.app-kpi-card`, `.app-card-muted`, `.app-panel`
- Tables: `.app-table-shell` wrapper + `.app-table` (uppercase thead, bordered rows)
- Forms: `.app-field` (styled input/select/textarea), `.app-chip` (toggles), `.app-section-eyebrow`
- Status classes: `bg-emerald-100 text-emerald-700` (closed), `bg-amber-100 text-amber-700` (pending), `bg-red-100 text-red-700` (open)
- Navigation: `.app-nav-link`, `.app-toolbar` (horizontal button), `.app-icon-button`
- Empty state: `.app-empty` (dashed border)
- Theme toggle between "normal"/"black" via cookie `ma-hse-theme`

## Key Conventions
- Named exports for all components/functions
- Server components by default; `"use client"` for interactivity
- API envelope: `{ ok: true, data }` / `{ ok: false, errorCode, message }`
- All API inputs validated via Zod in `lib/validation/dtos.ts`
- Critical operations logged via `writeAuditLog()`
- Prisma enum imports from `@prisma/client`
- Mutations use `prisma.$transaction()` for data consistency
- S3 file operations always go through the app server (`StorageService.uploadObject`/`getObjectBuffer`), never a presigned URL handed to the browser — in production the storage endpoint isn't reachable from the browser, only from the app's own network (see `lib/storage-upload.ts`)

## Development Commands
```bash
npm run dev         # Next.js dev server
npm run build       # Full build (includes prisma generate)
npm run test:unit   # Vitest unit tests
npm run test:e2e    # Playwright e2e
npm test            # Both unit + e2e
npx prisma studio   # DB browser
```

## Important Gotchas
- N0_ADMIN has `plantId: null` in session — code must handle null plantId gracefully
- `hasPlantAccess` already handles N0/N1 bypass; no extra guards needed for them
- S-EWO `whereText` stores workstation name at creation time (no direct FK)
- Communication types: UNSAFE_ACT, UNSAFE_CONDITION, NEAR_MISS, FIRST_AID, ACCIDENT
- Action sourceTypes: COMMUNICATION, SEWO, MANUAL, SMAT
- SEWO statuses: DRAFT, IN_APPROVAL, APPROVED, REJECTED, CLOSED
- Locale via cookie `ehs_locale`, resolved: cookie > Accept-Language > "pt"
- `lib/i18n/request.ts` is the next-intl request config (NOT `lib/i18n/routing.ts`)
- Env vars Zod-validated in `lib/env.ts` — production rejects default dev values unless `ALLOW_DEV_DEFAULT_ENV=true`

## Recent Changes (Session 28 May 2026)
1. **N0 plant-independent** — seed.ts + ensure-default-admin.ts: default email is admin@maxsafety.com and the N0 role uses `plantId: null`
2. **Safety Communication Alerts in N0 settings** — added after UserManager in settings/page.tsx
3. **KPI sidebar sticky** — corporate-plant-manager.tsx: `sticky top-6 self-start` (was xl: prefixed)
4. **S-EWO location priority** — sewo/page.tsx: `whereText || workstation?.name || area?.name`
5. **"Back to Corporate" button** — plant layout: visible for N1/N0 at top of content area, links to /app/corporate
