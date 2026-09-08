# Infrastructure monitoring

Phase 13 exposes **controlled collectors** for the host, disks, storage engine, and Docker Engine. The dashboard never offers a shell, and the API does not implement `/api/exec`, `/api/shell`, or any other command-execution endpoint.

```text
Dashboard  /infrastructure/*
        →  GET /api/v1/infrastructure/{summary,server,disks,storage,docker}
        →  InfrastructureService
        →  OsServerCollector | StatfsDiskCollector | PrismaStorageMonitorCollector | DockerSocketCollector
```

Host metrics are process-wide (`node:os`, `fs.statfs`, optional `/proc/net/dev`). Storage metrics are organization-scoped (Prisma aggregates + `StorageProvider.healthCheck()`). All routes still require organization context and `infrastructure.read`.

## Collectors

| Collector                         | Source                                      | Metrics                                                                 |
| --------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------- |
| `OsServerCollector`               | `node:os`, `/proc/net/dev`                  | CPU cores/model, load averages, RAM, uptime, network addresses/counters |
| `StatfsDiskCollector`             | `fs.statfs`                                 | Storage root, `/`, and `INFRASTRUCTURE_DISK_PATHS`                      |
| `PrismaStorageMonitorCollector`   | Prisma + `StorageService` + process metrics | Bucket/object usage, 24h uploads, provider health, storage-root free space |
| `DockerSocketCollector`           | HTTP GET on `DOCKER_SOCKET`                 | Engine version, container/image counts, running containers              |

Docker requests are limited to `/info` and `/containers/json`. The socket path comes from configuration, not from the UI.

Missing disks, unreachable providers, and an absent Docker socket are returned as **degraded / unavailable** data. They do not fail the request.

## Configuration

| Variable                     | Default                 | Purpose                                      |
| ---------------------------- | ----------------------- | -------------------------------------------- |
| `DOCKER_SOCKET`              | `/var/run/docker.sock`  | Unix socket for the Docker Engine API        |
| `INFRASTRUCTURE_DISK_PATHS`  | unset                   | Extra comma-separated paths to include       |
| `STORAGE_LOCAL_ROOT`         | `/data`                 | Storage-root volume in disk and storage views |

## Dashboard

- `/infrastructure` — summary
- `/infrastructure/server` — CPU, RAM, load, network
- `/infrastructure/disks` — physical disk and storage-root usage
- `/infrastructure/storage` — buckets, objects, upload activity, provider health, free space
- `/infrastructure/docker` — Docker Engine status

`infrastructure.manage` is reserved for later phases. Phase 19 adds production observability (metrics exporters, alerting); this phase is the operator dashboard only.
