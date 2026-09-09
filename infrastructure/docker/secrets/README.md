# Production Compose secrets

Create these files on the production host; never commit their contents:

```text
database_url
jwt_secret
postgres_password
```

`database_url` must contain the complete PostgreSQL connection string, for
example:

```text
postgresql://vaultstack:password@postgres:5432/vaultstack
```

`jwt_secret` must be at least 32 characters. `postgres_password` must match
the password embedded in `database_url`.

The default Compose paths are relative to this directory. To keep secrets
elsewhere, set `VAULTSTACK_DATABASE_URL_FILE`,
`VAULTSTACK_JWT_SECRET_FILE`, and `VAULTSTACK_POSTGRES_PASSWORD_FILE` in the
deployment environment.
