# API module architecture

VaultStack’s Express API uses **class-based dependency injection** with a layered module layout. All new API work must follow this document.

## Composition root

- `apps/api/src/container/app-container.ts` — `AppContainer` wires every module service.
- `apps/api/src/routes/v1.ts` — mounts routers only; no business logic.
- Register new module dependencies in `AppContainer`, not in route files.

## Module layout

```text
apps/api/src/modules/<module>/
├── <module>.router.ts          # Route wiring (thin)
├── <module>.module.ts          # Module composition root (storage)
├── controllers/                # HTTP handlers (classes)
│   └── <resource>.controller.ts
├── services/                   # Business logic (classes)
│   └── <resource>.service.ts
├── repositories/               # Prisma / data access (when non-trivial)
├── domain/                     # Pure rules and internal types
├── mappers/                    # DB → Public* DTO
└── *.test.ts
```

### Layer rules

| Layer | Responsibility | Must not |
|-------|----------------|----------|
| **Router** | Paths, middleware chain, delegate to controller | Business logic, Prisma |
| **Controller** | Parse validated input, call service, set status/body | Direct Prisma, crypto |
| **Service** | Business rules, audit, orchestration | HTTP headers/cookies |
| **Repository** | Queries and transactions | Authorization decisions |
| **Domain** | Pure functions/types | I/O |
| **Mapper** | Model → `Public*` DTO | Business logic |

Extend `BaseController`, `AuthenticatedController`, `OrganizationScopedController`, or `StorageScopedController` from `apps/api/src/http/`.

## Naming

| Artifact | Pattern | Example |
|----------|---------|---------|
| Router file | `<module>.router.ts` | `auth.router.ts` |
| Controller class | `<Resource>Controller` | `AuthController` |
| Service class | `<Resource>Service` | `AuthService` |
| Module root | `<module>.module.ts` | `storage.module.ts` |
| Manager (infra) | `<Thing>Manager` | `SessionManager`, `CookieManager` |
| Factory (legacy) | `create<Resource>Service()` | Deprecated; prefer `new` via `AppContainer` |

## Types and validation

| Concern | Location |
|---------|----------|
| Public API DTOs | `@vaultstack/types` (`PublicUser`, …) |
| HTTP meta | `@vaultstack/types` (`RequestMeta`, `RequestCookies`) |
| Request validation | `@vaultstack/validation` (Zod, split by domain file) |
| Internal module types | `modules/<module>/domain/` or `<module>.types.ts` |
| Express augmentation | `apps/api/src/types/express.d.ts` |

Validation files in `@vaultstack/validation`:

```text
packages/validation/src/
├── common.schemas.ts
├── auth.schemas.ts
├── organization.schemas.ts
├── storage.schemas.ts
└── index.ts              # re-exports all
```

## Security (centralized classes)

| Concern | Class / package |
|---------|-----------------|
| Password hashing | `PasswordService` (`@vaultstack/auth`) |
| JWT / session / CSRF tokens | `TokenService` (`@vaultstack/auth`) |
| API keys | `ApiKeyService` (`@vaultstack/auth`) |
| Session persistence | `SessionManager` |
| Cookie read/write | `CookieManager` |
| Request authentication | `AuthenticationService` |
| Storage presigned URLs | `StorageTokenManager` |

## Migration status

| Module | Router | Controller | Service class | Mappers |
|--------|--------|------------|---------------|---------|
| auth | ✅ | ✅ | ✅ | ✅ api-key |
| organizations | ✅ | ✅ | ✅ | ✅ |
| users | ✅ | ✅ | ✅ | ✅ |
| teams | ✅ | ✅ | ✅ | ✅ |
| roles | ✅ | ✅ | ✅ | ✅ |
| audit | ✅ | ✅ | ✅ | ✅ |
| permissions | ✅ | ✅ | ✅ | ✅ |
| storage | ✅ | ✅ | partial classes | ✅ |
| s3-gateway | ✅ | ✅ | — | — |

Nested organization routes:

```text
/api/v1/organizations/:organizationId/users      → users.router.ts
/api/v1/organizations/:organizationId/teams      → teams.router.ts
/api/v1/organizations/:organizationId/roles      → roles.router.ts
/api/v1/organizations/:organizationId/api-keys   → auth/api-keys.router.ts
/api/v1/organizations/:organizationId/audit-logs → audit.router.ts
```

`lib/serializers.ts` re-exports module mappers for backward compatibility.

## Checklist for new endpoints

- [ ] Zod schema in `@vaultstack/validation`
- [ ] Controller method on a class extending a base controller
- [ ] Service method on a class; wired in `AppContainer`
- [ ] Mapper for new `Public*` types
- [ ] Permission check via `createRequirePermission` or org-scoped variant
- [ ] Audit log for destructive / important actions
- [ ] Tests (unit and/or integration)
