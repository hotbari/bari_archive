# Self-Insight Feature Design

**Date:** 2026-03-21
**Project:** Arkive (bari_archive)
**Status:** Approved

---

## Goal

Turn Arkive from a "read later" bookmark manager into a self-knowledge tool that helps the user discover patterns in their fragmented interests, articulate who they are, and track how their curiosity changes over time.

---

## Approach: Structured Analysis Pass (Option C)

No vector database. Use existing data (categories, notes, status, timestamps) to build a structured summary, then send it to Claude for narrative generation. Results are cached per user.

---

## Architecture

### New Backend Components

**`InsightCache` model** (`backend/app/models/insight.py`)
```
- id: str (UUID, String(36), PK)
- user_id: str (String(36), FK → users.id, nullable=True for consistency with other models)
- generated_at: datetime
- data: JSON  # full InsightData payload
```

**`GET /api/insights`** (`backend/app/api/insights.py`)
- Requires auth (get_current_user dependency)
- Returns cached insight if < 24 hours old
- Otherwise runs analysis pass, stores result, returns it
- Query param: `?refresh=true` to force regeneration

**`services/insight_engine.py`**
- Collects structured data from DB (async, receives AsyncSession)
- Calls Claude Haiku synchronously via `asyncio.to_thread` (same pattern as `reviewer.py`)
- Returns `InsightData` Pydantic model

**Next.js proxy route** (`frontend/src/app/api/insights/route.ts`)
- Follows the same proxy pattern as other routes in `src/app/api/`
- Forwards `X-User-Id` and `X-API-Key` headers to FastAPI
- Forwards `?refresh=true` query param if present (use `request.nextUrl.searchParams`)

---

## Data Models

### Backend: Pydantic response schema (`InsightData`)

```python
class InsightTheme(BaseModel):
    name: str
    description: str

class InsightData(BaseModel):
    portrait: str           # 3-4 sentence description
    themes: list[InsightTheme]  # top 3 themes
    emerging: str           # recently growing interest
    blind_spots: str        # saved-but-not-consumed pattern
    connection: str         # cross-category link discovered
    total_links: int        # for frontend "< 5" check
    generated_at: str       # ISO datetime string
```

`GET /api/insights` returns `InsightData` directly (200), or:
- `204 No Content` if user has 0 links (no data at all)
- `503 Service Unavailable` with `{"detail": "Insight generation failed"}` if Claude call fails

### Frontend: TypeScript interface (`frontend/src/types/insights.ts`)

```typescript
export interface InsightTheme {
  name: string;
  description: string;
}

export interface InsightData {
  portrait: string;
  themes: InsightTheme[];
  emerging: string;
  blind_spots: string;
  connection: string;
  total_links: number;
  generated_at: string;
}
```

---

## Backend: Insight Engine

### Data Collection (DB queries)

1. **Category distribution** — link count + completion rate per category (count where status='done' / total)
2. **Temporal comparison** — category breakdown for last 30 days vs prior period (links where created_at >= now-30d)
3. **Note texts** — all `user_notes` where not null, up to 20 most recent (to cap prompt size)
4. **Behavioral signal** — per category: average days between `created_at` and `updated_at` for links with status='done'. Note: `updated_at` is used as proxy for completion time; it may be slightly inflated if notes were edited after completion, but is sufficient for qualitative signal.
5. **Stalled links** — count of links per category that have been in `pending` or `in_progress` for > 14 days. Used to compute `blind_spots`.

### Claude Prompt Structure

Model: `claude-haiku-4-5-20251001` (verify active before build)
Max tokens: 512

```
User archive summary:
- Total: {N} links across {M} categories
- Category breakdown: [{name}: {count} links, {pct}% done, avg {days}d to complete]
- Last 30 days vs prior: [{name}: was {N}, now {N}]
- User notes sample (recent): ["...", "...", ...]
- Stalled by category (>14 days without action): [{name}: {count} links]

Return JSON only, no markdown fences:
{
  "portrait": "3-4 sentence description of this person based on patterns",
  "themes": [{"name": "...", "description": "one sentence"}, ...],
  "emerging": "one sentence about recently growing interest",
  "blind_spots": "one sentence about the stalled/not-consumed pattern",
  "connection": "one sentence about unexpected cross-category link"
}
```

### Error Handling

Before calling `json.loads()`, strip markdown code fences from Claude's response using the same pattern as `categorizer.py` (lines 77–78): `re.sub(r"^```(?:json)?\s*", "", text)` and `re.sub(r"\s*```$", "", text)`. This prevents a predictable 503 false-alarm when Claude wraps the response in fences despite the instruction.

If Claude returns malformed JSON or raises an exception after fence-stripping:
- Do NOT store anything in `InsightCache`
- Return HTTP 503 with `{"detail": "Insight generation failed"}`
- The dashboard panel handles 503 by hiding itself silently (same as the "< 5 links" hidden state)

Note: the `Anthropic` client must be instantiated inside the thread function passed to `asyncio.to_thread`, not at module level — same as the pattern in `reviewer.py`'s `_call_claude()`.

### Cache Invalidation

- Cache expires after 24 hours (check `generated_at` on read)
- Delete the user's `InsightCache` row at the end of `create_link()`, `update_link()`, and `delete_link()` in `links.py`. All three affect insight quality: creation changes totals, status updates change completion rates and behavioral signals, deletion changes category distribution. This is a direct DB delete, not a background task. Acceptable cross-domain side effect given app scale.
- `?refresh=true` forces regeneration regardless of cache age

---

## Frontend: Dashboard Insight Panel

**Location:** Between the sticky header and the filter bar, inside the sticky group.

**Visibility rule (client-side):** The dashboard already has `links` in state after load. If `links.length < 5`, do not render the panel and do not call `/api/insights`. This avoids a fetch when there is insufficient signal.

**Collapsed state:** One-line summary — top 2 theme names as tags + "전체 보기 →"

**Expanded state (default):**
```
┌─────────────────────────────────────────────┐
│ 나의 관심사                        [접기 ∧] │
│                                             │
│ {portrait — first 1-2 sentences}           │
│                                             │
│ [theme1] [theme2] [theme3] [↑ emerging]    │
│                                 [전체 보기 →]│
└─────────────────────────────────────────────┘
```

**Loading state:** Skeleton shimmer (two lines of gray bars) while fetching
**Error/503 state:** Panel hidden silently — no error shown to user
**Persistence:** Collapsed/expanded state saved in `localStorage` key `mya_insight_panel`. Value: `"collapsed"` when collapsed, key absent when expanded (consistent with `mya_swipe_hint` convention of using presence/absence).

---

## Frontend: `/insights` Page

Three blocks rendered top to bottom.

### Block 1: Portrait
- Full `portrait` text from `InsightData`
- "다시 분석" button top-right → calls `GET /api/insights?refresh=true`, shows spinner during fetch, re-renders on success

### Block 2: Interest Map (quantitative)
Data source: separate `GET /api/categories` and `GET /api/links` calls (existing API endpoints), not from `InsightData`. The `/insights` page fetches these on mount using the same `api.getCategories()` and `api.getLinks()` calls already used in the dashboard. Temporal comparison (30-day tab) filters `links` client-side by `created_at`.

- Horizontal bar chart per category, built with plain CSS bars (no chart library)
  - Bar length = link count relative to max category
  - Secondary green overlay = completion rate percentage
  - "↑ 급증" badge if last-30-day share exceeds prior period by ≥ 10 percentage points
- Tab toggle: `전체 기간` / `최근 30일`

### Block 3: Discovered Patterns (qualitative)
Three cards, each with label and paragraph text from `InsightData`:

| Card label | Field | Description |
|------------|-------|-------------|
| 요즘 관심사 | `emerging` | Recently growing interest |
| 의외의 연결 | `connection` | Cross-category connection |
| 아직 못 읽은 것들 | `blind_spots` | Stalled/saved-but-not-consumed |

---

## Data Flow

```
User opens dashboard
  → links load into state (existing behavior)
  → if links.length >= 5:
      → fetch GET /api/insights
        → 200 + cached (< 24h): render panel immediately
        → 200 + fresh (cache miss or refresh): Claude called, store, return
        → 503: hide panel silently
  → dashboard panel renders portrait excerpt + theme tags
  → user clicks [전체 보기] → /insights renders full breakdown
```

---

## Database Migration

New file: `backend/alembic/versions/0004_add_insight_cache.py`

Creates `insight_cache` table:
```sql
CREATE TABLE insight_cache (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36),
    generated_at DATETIME NOT NULL,
    data JSON NOT NULL
);
```

No changes to existing tables.

---

## What Is Not In Scope

- Vector embeddings / semantic search
- Weekly email/push reports
- Per-link "this connects to X" real-time annotation
- Insight history / diff between past and current portrait (note: retaining old `InsightCache` rows instead of replacing them would enable this later at no schema cost — left as future option)
