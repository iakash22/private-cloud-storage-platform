# Production Compose secrets

Create these files on the production host; never commit their contents:

```text
database_url
jwt_secret
postgres_password
metrics_token
grafana_admin_password
```

`database_url` must contain the complete PostgreSQL connection string, for
example:

```text
postgresql://vaultstack:password@postgres:5432/vaultstack
```

`jwt_secret` must be at least 32 characters. `postgres_password` must match
the password embedded in `database_url`. `metrics_token` authenticates
Prometheus to the private API metrics endpoint. `grafana_admin_password` is
the local Grafana administrator password.

Secret files must be mode `0644` (directory `0700`) so the non-root API
container user can read Docker file secrets. `init-secrets.sh` sets this.

The default Compose paths are relative to this directory. To keep secrets
elsewhere, set the `VAULTSTACK_*_FILE` variables in the deployment
environment.

For THANOS / `ivaultstack.com`, also set `REDIS_PASSWORD` and `REDIS_URL` in
`compose.env` and enable `docker-compose.ivaultstack.yml` (Caddy on LAN IP,
Postgres `:5433`, Redis `:6380`, data on the backup disk).
