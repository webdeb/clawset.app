# Clawset Integration Guide

You are running inside a **clawset-managed instance**. Clawset is an orchestrator that manages your lifecycle, provides credentials, and connects you with peer agents.

## Directory: `$HOME/clawset/.clawset/`

This is the shared communication directory between you and the clawset host.

### Files You Can READ

| File | Purpose |
|------|---------|
| `context.json` | Info about this instance, peer instances, and available auth |
| `auth/{provider}.json` | Credentials for AI providers (e.g., `auth/openai-codex.json`) |
| `CLAWSET.md` | This file |

### Files You Can WRITE

| File | Purpose |
|------|---------|
| `views.json` | Register web UIs that clawset should display as tabs |

---

## Registering Views

To make a web UI visible in the clawset desktop app, write to `views.json`:

```json
{
  "views": [
    {
      "id": "my-dashboard",
      "name": "My Dashboard",
      "port": 8080,
      "path": "/"
    }
  ]
}
```

Each entry becomes a tab in clawset. You can add/remove entries at any time — clawset polls this file periodically.

**Fields:**
- `id` — unique identifier (lowercase, kebab-case)
- `name` — display name shown in the tab
- `port` — port your web service listens on (bound to `0.0.0.0`)
- `path` — URL path (default: `/`)

---

## Reading Context

`context.json` is written by clawset and tells you about your environment:

```json
{
  "orchestrator": "clawset",
  "instance": {
    "id": "clawset-1",
    "ip": "192.168.64.2",
    "provider": "multipass"
  },
  "peers": [
    {
      "id": "clawset-2",
      "ip": "192.168.64.3",
      "apps": ["zeroclaw"],
      "provider": "multipass"
    }
  ],
  "auth": {
    "available": ["openai-codex"],
    "missing": ["anthropic"]
  }
}
```

Use `peers` to discover and communicate with other agent instances.

---

## Using Auth Credentials

Credentials are stored in `auth/{provider-id}.json`. Format depends on the provider type:

**OAuth2 (e.g., openai-codex):**
```json
{
  "type": "oauth2",
  "access": "eyJ...",
  "refresh": "eyJ...",
  "expires": 1709235600,
  "accountId": "user_..."
}
```

**API Key (e.g., anthropic):**
```json
{
  "type": "api_key",
  "key": "sk-ant-..."
}
```

Map these to your own config format as needed.

---

## Important Notes

- **Do not delete** `context.json` or `auth/` files — clawset manages these.
- **Do** update `views.json` whenever you start or stop a web service.
- Bind web services to `0.0.0.0`, not `localhost`, so they're accessible from the host.
- This directory is on a shared mount — changes are visible immediately.
