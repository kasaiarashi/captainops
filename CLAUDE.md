# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CapRover — an open-source Docker-based PaaS (Platform as a Service) for deploying and managing applications. TypeScript/Node.js backend using Express.js v5, with Docker Swarm orchestration, nginx reverse proxy, and Let's Encrypt SSL integration.

## Build & Development Commands

```bash
npm install              # Install dependencies
npm run build            # Check circular deps (madge), compile TypeScript to ./built/
npm run test             # Run Jest test suite
npm run lint             # ESLint check
npm run lint-fix         # ESLint auto-fix
npm run formatter        # Prettier check
npm run formatter-write  # Prettier auto-fix

# Run a single test file
npx jest tests/utils.test.ts

# Dev environment (requires Docker, /captain directory, and sudo)
npm run clean            # Build + first-time dev setup
npm run dev              # Build + restart dev service
```

Development requires Docker and a `/captain` directory. On macOS, `/captain` must be set up via `/etc/synthetic.conf` symlink and added to Docker's shared paths. Ubuntu is the recommended dev environment.

## Code Architecture

### Entry Points
- **`src/server.ts`** — HTTP server startup and initialization
- **`src/app.ts`** — Express app setup, middleware chain, route mounting

### Core Layers

**API Routes** (`src/routes/`): Express route handlers organized by auth level
- `login/` — Authentication endpoints
- `user/` — Protected endpoints (JWT required)
- `public/` — Unauthenticated endpoints (theme)
- `download/` — File download endpoints
- All API routes are versioned under `/api/v2/`

**Business Logic** (`src/user/`): Service/Manager pattern
- `system/CaptainManager.ts` — System lifecycle, initialization, singleton via `.get()`
- `ServiceManager.ts` — Docker service orchestration (deploy, scale, update)
- `ImageMaker.ts` — Docker image building from git repos, tarballs, or Dockerfiles
- `Authenticator.ts` — JWT token generation/validation
- `DockerRegistryHelper.ts` — Docker registry push/pull operations
- `oneclick/` — One-click app installation system

**Docker Integration** (`src/docker/`):
- `DockerApi.ts` — Wrapper around `dockerode` for all Docker operations (largest file in codebase)
- `DockerUtils.ts` — Docker helper utilities

**Data Persistence** (`src/datastore/`): File-based storage using `configstore`
- `DataStore.ts` — Main data store
- `AppsDataStore.ts` — Application definitions and state
- `DataStoreProvider.ts` — Singleton provider

**Dependency Injection** (`src/injection/`): Express middleware-based DI
- `Injector.ts` — Injects managers/services into `res.locals` at different auth levels (`injectGlobal`, `injectUser`, `injectUserForRegistryAuth`)
- `InjectionExtractor.ts` — Type-safe extraction of injected dependencies from `res.locals`

**Models** (`src/models/`): TypeScript interfaces (no classes) for all data structures
- `AppDefinition.ts` — Core app definition interface (`IAppDef`)

**Utilities** (`src/utils/`):
- `CaptainConstants.ts` — All global constants, paths, versions, and config overrides
- `EnvVars.ts` — Environment variable access
- `Logger.ts` — Logging utility

### Key Patterns
- **Singletons**: Core services (CaptainManager, DockerApi, DataStore) use `.get()` static accessor pattern
- **Namespace-scoped**: Services are scoped by namespace (currently only `captain` root namespace)
- **No ORM**: Data stored as JSON via `configstore` under `/captain/data/`
- **Circular dependency checking**: Build fails if `madge` detects circular imports

## Configuration

- **TypeScript**: Target ES2018, Node16 module resolution, strict null checks, no implicit any, output to `./built/`
- **Prettier**: 4-space indent, no semicolons, single quotes, trailing commas (es5)
- **ESLint**: Flat config format, TypeScript-ESLint recommended rules
- **Node.js 22** required

## Testing

Tests live in `/tests/` directory, use Jest with `ts-jest` transform. Tests run directly on TypeScript source (no build step needed). Coverage collection is enabled.

## Contributing Guidelines

- No large PRs without prior discussion in Slack
- No refactoring or opinion-based style changes without maintainer approval
- CapRover scope is limited to Docker, nginx, and Let's Encrypt orchestration — avoid adding features that mirror Docker's full API surface
- Prefer customization hooks over adding new config flags for edge cases
- After code changes, restart dev service via `/force-exit` endpoint or `npm run dev`
