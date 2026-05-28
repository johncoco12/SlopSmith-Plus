# Authentication & Profiles

SlopSmith uses a PIN-based multi-profile system. Each profile is a separate user identity with its own settings, favorites, scores, and loops. There are no passwords — access is controlled by a numeric PIN and optional permission groups.

---

## Profiles

A **Profile** is the top-level identity in SlopSmith. Multiple profiles can exist on a single instance (e.g., family members sharing a device).

### Profile fields

| Field | Description |
|---|---|
| `id` | Auto-incremented integer primary key |
| `name` | Unique display name |
| `avatarId` | Selected avatar index |
| `pinCode` | SHA-256(salt + PIN) — never exposed in API |
| `pinSalt` | Random salt used for PIN hashing |
| `recoveryPhrase` | SHA-256(salt + phrase) — never exposed |
| `recoveryPhraseSalt` | Random salt for recovery phrase |
| `recoveryPhraseHint` | User-visible hint (e.g., "name of first pet") |
| `locked` | Admin-set flag to prevent login |
| `profileSettings` | JSON blob (theme, volume, renderer, etc.) |

---

## Authentication Flow

```
User selects profile → enters PIN
        │
        ▼
POST /api/auth/login
  { profileName, pin }
        │
        │ backend: SHA-256(salt + pin) == stored hash?
        ├── no  → increment fail counter
        │         5 failures → 30-min runtime lockout
        │         return 401
        └── yes → create Session (token UUID, 24h TTL)
                  return { token, expiresAt, profile }
        │
        ▼
Frontend stores token in localStorage
Includes on every request:
  Authorization: Bearer {token}
```

### Session object

```ts
{
  token: string       // UUID
  profileId: number
  profileName: string
  createdAt: number   // Unix ms
  expiresAt: number   // now + 24 hours (Unix ms)
}
```

Sessions are stored in the database. On logout (`POST /api/auth/logout`) the token is immediately invalidated — existing sessions on other devices/tabs stop working.

---

## PIN Security

- PINs are **never stored in plain text**.
- Storage: `SHA-256(salt + pin)` — a random salt per profile is generated at profile creation.
- Lockout: **5 failed attempts** lock the profile for **30 minutes** (in-memory; resets on server restart).
- Recovery: If a user forgets their PIN, they can verify their recovery phrase (`POST /api/auth/recover`) and set a new PIN.

---

## WebSocket Authentication

Browsers cannot send custom headers during a WebSocket upgrade. To authenticate WebSocket connections, pass the token as a query parameter:

```
ws://host:8085/ws/some-endpoint?token={token}
```

The backend auth middleware accepts both `Authorization: Bearer {token}` (REST) and `?token=` (WebSocket). The resulting `req.session` object is identical in both cases.

---

## Permissions

Permissions are coarse-grained capabilities assigned to profiles via **Permission Groups**.

### Built-in permissions

| Permission | What it gates |
|---|---|
| `ADMIN` | Full access; implicitly grants all others |
| `UPLOAD` | Import new songs |
| `EDIT_TRACKS` | Edit song metadata |
| `DELETE_TRACKS` | Delete songs from the library |
| `MANAGE_PROFILES` | Create, update, delete profiles |
| `MANAGE_PERMISSIONS` | Manage permission groups |
| `MANAGE_SETTINGS` | Change app settings, switch active providers |

Plugins can define additional permissions via `ctx.permissions.define(name, description)` — these appear alongside the built-in list in the admin panel.

### Permission Groups

A **PermissionGroup** holds a list of profile IDs and a list of permissions. Profiles in the group receive all listed permissions.

- A profile can belong to multiple groups.
- Permissions are additive — there is no deny override.
- The `ADMIN` permission bypasses all other checks.

---

## Profile API

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/profiles` | None | List all profiles (safe fields only) |
| `GET` | `/api/profiles/:id` | None | Get single profile |
| `POST` | `/api/profiles` | `ADMIN` | Create profile |
| `PATCH` | `/api/profiles/:id` | `ADMIN` | Update profile (name, avatar, settings) |
| `DELETE` | `/api/profiles/:id` | `ADMIN` | Delete profile + invalidate all sessions |
| `POST` | `/api/auth/login` | None | Login, returns token |
| `POST` | `/api/auth/logout` | Required | Invalidate current token |
| `POST` | `/api/auth/recover` | None | Reset PIN via recovery phrase |
| `GET` | `/api/auth/session` | Required | Get current session + profile |

**Safe fields** — sensitive fields (`pinCode`, `pinSalt`, `recoveryPhrase`, `recoveryPhraseSalt`) are stripped from every API response by `ProfileService.sanitize()`.

---

## First-Run Setup

On a fresh install with no profiles, `/api/setup/status` returns `{ configured: false }`. The frontend shows a setup wizard:

1. `GET /api/setup/status` → `{ configured: false, profiles: 0 }`
2. User enters first profile name + PIN
3. `POST /api/setup/init` → creates the first profile with `ADMIN` permission

After setup, the normal login flow applies.

---

## Per-Profile Settings

Each profile stores a `profileSettings` JSON blob that persists personal preferences independently of the global settings file:

| Key | Description |
|---|---|
| `theme` | UI colour theme |
| `renderer` | Preferred highway renderer (`highway2d`, `modernway`, `tabmaster`) |
| `lyricsVisible` | Show/hide lyrics overlay |
| `volume` | Master volume (0–1) |
| `language` | UI locale (`en`, `de`, etc.) |

These are read by the frontend on login and written back via `PATCH /api/profiles/:id`.

---

## See Also

- [Architecture Overview](architecture.md)
- [API Reference](api-reference.md)
- [Database Schema](database-schema.md)
