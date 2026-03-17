# Walkthrough API – Brief

## Overview

The walkthrough system provides guided tours within Remix IDE. Walkthroughs are managed by admins, targeted to users via **audience rules** (same system as notifications & feedback), and tracked per-user with completion status so the frontend can distinguish seen vs unseen.

All walkthrough endpoints live on the **notification** service (port 3013).

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `walkthroughs` | Walkthrough definitions (slug, name, description, source_plugin, active/dates/priority, soft delete) |
| `walkthrough_steps` | Ordered steps with target_selector, title, content, placement, click interaction, pre_action JSON |
| `walkthrough_audience` | Audience rules (same 9 types as notifications/feedback) |
| `walkthrough_completions` | Tracks which users have seen each walkthrough (UNIQUE walkthrough_id + user_id) |

### Audience Rule Types

`all_users`, `account_group`, `feature_group`, `product`, `subscription_plan`, `credit_min`, `credit_max`, `tag`, `provider`

Multiple rules use OR logic — user matches if **any** rule matches.

---

## WalkthroughDefinition

The user endpoint returns a **JSON array** of walkthrough objects with embedded steps.

| Field          | Type                | Required | Description                                  |
|----------------|---------------------|----------|----------------------------------------------|
| `id`           | `number`            | yes      | Auto-increment ID                            |
| `slug`         | `string`            | yes      | Unique slug identifier                       |
| `name`         | `string`            | yes      | Display name shown in the UI                 |
| `description`  | `string`            | no       | Short description of the walkthrough         |
| `source_plugin`| `string`            | no       | Plugin that registered it (defaults to `"api"`) |
| `priority`     | `number`            | yes      | Sort priority (higher = more important)      |
| `completed`    | `boolean`           | yes      | Whether the current user has completed it    |
| `completed_at` | `string \| null`    | yes      | ISO timestamp or null                        |
| `steps`        | `WalkthroughStep[]` | yes      | Ordered list of steps                        |

## WalkthroughStep

| Field            | Type                                       | Required | Description                                              |
|------------------|--------------------------------------------|----------|----------------------------------------------------------|
| `sort_order`     | `number`                                   | yes      | Step order index (0-based)                               |
| `target_selector`| `string`                                   | yes      | CSS selector for the element to highlight                |
| `title`          | `string`                                   | yes      | Popover title                                            |
| `content`        | `string`                                   | yes      | Body content (supports HTML)                             |
| `placement`      | `"top" \| "bottom" \| "left" \| "right"`   | no       | Popover placement relative to the target                 |
| `click_selector` | `string`                                   | no       | CSS selector of an element to click before showing step  |
| `click_delay`    | `number`                                   | no       | Delay in ms after click before showing step (default 500)|
| `pre_action`     | `PreAction`                                | no       | Plugin call to execute before showing this step          |

## PreAction

| Field    | Type     | Required | Description                      |
|----------|----------|----------|----------------------------------|
| `plugin` | `string` | yes      | Plugin name to call              |
| `method` | `string` | yes      | Method to invoke on the plugin   |
| `args`   | `any[]`  | no       | Arguments passed to the method   |

---

## User Endpoints

Base path: `/walkthroughs` (requires auth)

### Get My Walkthroughs
```
GET /walkthroughs
```
Returns all walkthroughs that are active, within date window, and match the user's audience.

### Mark Walkthrough as Completed
```
POST /walkthroughs/:id/complete
```
Idempotent — calling multiple times is safe.

---

## Admin Endpoints

Base path: `/walkthroughs/admin` (requires auth + admin)

- `GET /walkthroughs/admin` — List all walkthroughs
- `GET /walkthroughs/admin/:id` — Get walkthrough with steps + audience
- `POST /walkthroughs/admin` — Create walkthrough
- `PATCH /walkthroughs/admin/:id` — Update walkthrough
- `DELETE /walkthroughs/admin/:id` — Soft delete
- `PUT /walkthroughs/admin/:id/steps` — Replace steps
- `GET /walkthroughs/admin/:id/steps` — Get steps
- `PUT /walkthroughs/admin/:id/audience` — Replace audience rules
- `GET /walkthroughs/admin/:id/audience` — Get audience rules
- `DELETE /walkthroughs/admin/:id/completions/:userId` — Reset user completion

---

## Frontend Integration (implemented)

### Files Changed

| File | Purpose |
|------|---------|
| `libs/endpoints-helper/src/index.ts` | Added `walkthroughs` endpoint URL |
| `libs/remix-api/src/lib/plugins/walkthrough-api.ts` | Added `ApiWalkthrough`, `ApiWalkthroughStep`, `ApiWalkthroughsResponse` types, `completed`/`apiId`/`priority` fields on `WalkthroughDefinition`, and `markCompleted` method |
| `apps/remix-ide/src/walkthroughService.tsx` | API client integration, auth listener, fetch-on-login, snake_case→camelCase mapping, completion tracking |
| `libs/remix-ui/walkthrough/src/lib/remix-ui-walkthrough.tsx` | Seen/unseen badges, sorted list (new first), replay button for completed |

### Data Flow

```
App startup / user login
  │
  ├─ authStateChanged  →  set token on ApiClient
  │
  ├─ GET /walkthroughs  →  fetch audience-matched walkthroughs
  │
  ├─ Map snake_case → camelCase WalkthroughDefinition
  │
  ├─ Merge with built-in walkthroughs, render list
  │     (unseen first, sorted by priority, completed shown with ✓)
  │
  ├─ User clicks "Start Tour"  →  execute steps via driver.js
  │
  └─ Last step finished  →  POST /walkthroughs/:apiId/complete
       │
       └─ Update local state (mark as completed, re-render)
```

### Example payload

```json
{
  "walkthroughs": [
    {
      "id": 1,
      "slug": "remix-intro",
      "name": "Getting Started with Remix",
      "description": "A quick tour of the Remix IDE interface.",
      "source_plugin": "walkthrough",
      "priority": 10,
      "completed": false,
      "completed_at": null,
      "steps": [
        {
          "sort_order": 0,
          "target_selector": "[data-id=\"verticalIconsHomeIcon\"]",
          "title": "Welcome",
          "content": "This is your home button.",
          "placement": "right",
          "click_selector": null,
          "click_delay": null,
          "pre_action": null
        }
      ]
    }
  ],
  "count": 1
}
```
