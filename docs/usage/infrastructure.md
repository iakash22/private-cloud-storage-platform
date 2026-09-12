# Infrastructure monitoring

Live collector snapshots. Host metrics are process-wide; storage metrics are organization-scoped.

There is **no** shell/exec API.

Permission: `infrastructure.read`.

## Routes

| Method | Path | Returns |
| --- | --- | --- |
| `GET` | `/api/v1/infrastructure/summary` | Combined overview |
| `GET` | `/api/v1/infrastructure/server` | CPU, RAM, load, network |
| `GET` | `/api/v1/infrastructure/disks` | Disk + `STORAGE_LOCAL_ROOT` usage |
| `GET` | `/api/v1/infrastructure/storage` | Buckets, objects, uploads, provider health |
| `GET` | `/api/v1/infrastructure/docker` | Docker Engine via `DOCKER_SOCKET` (info + containers list only) |

Degraded paths (missing disk, unhealthy provider, unreachable Docker) appear in the **payload**; HTTP status stays `200`.

## How to use

```bash
curl -sS "$VS_API/api/v1/infrastructure/summary" \
  -H "Authorization: Bearer $VS_KEY" | jq .
```

Dashboard: **Infrastructure** tabs (overview, disks, storage, Docker).

## Related

- [../../infrastructure/monitoring/README.md](../../infrastructure/monitoring/README.md)
- [../api/README.md](../api/README.md) Infrastructure section
