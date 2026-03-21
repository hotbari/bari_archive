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
- id: str (UUID)
- user_id: str (FK → users.id)
- generated_at: datetime
- data: JSON  # full insight payload
```

**`GET /api/insights`** (`backend/app/api/insights.py`)
- Requires auth (get_current_user dependency)
- Returns cached insight if < 24 hours old
- Otherwise runs analysis pass, stores result, returns it
- Query param: `?refresh=true` to force regeneration

**`services/insight_engine.py`**
- Collects structured data from DB
- Calls Claude Haiku with structured prompt
- Returns typed insight payload

### New Frontend Components

**Dashboard insight panel** — collapsible card between header and filter bar
**`/insights` page** — full analysis view

---

## Backend: Insight Engine

### Data Collection (DB queries)

1. Category distribution — link count + completion rate per category
2. Temporal comparison — category breakdown for last 30 days vs prior period
3. Note texts — all `user_notes` where not null (for Claude to read)
4. Behavioral signal — average time from `created_at` to status=`done`, per category
5. Stalled links — links in `in_progress` or `pending` for longest time, by category

### Claude Prompt Structure

```
User archive summary:
- Total: {N} links across {M} categories
- Category breakdown: [{name}: {count} links, {pct}% done]
- Last 30 days vs prior: [{name}: was {N}, now {N}]
- User notes sample: ["...", "...", ...]
- Slowest completion category: {name} ({avg_days} days avg)

Return JSON only:
{
  "portrait": "3-4 sentence description of this person based on patterns",
  "themes": [{"name": "...", "description": "one sentence"}],  // top 3
  "emerging": "one sentence about recently growing interest",
  "blind_spots": "one sentence about saved-but-not-consumed pattern",
  "connection": "one sentence about cross-category link discovered"
}
```

Model: `claude-haiku-4-5-20251001` (same as categorizer)
Max tokens: 512

### Cache Invalidation

- Cache expires after 24 hours
- New link creation invalidates cache (delete InsightCache row for user)
- `?refresh=true` param forces regeneration on demand

---

## Frontend: Dashboard Insight Panel

**Location:** Between the sticky header and the filter bar, inside the sticky group.

**Collapsed state:** One-line summary — top 2 interest tags + "전체 보기 →"

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

**Loading state:** Skeleton shimmer while fetching
**No data state:** Hidden if user has < 5 links (not enough signal)
**Persistence:** Collapsed/expanded state saved in `localStorage` key `mya_insight_panel`

---

## Frontend: `/insights` Page

Three blocks rendered top to bottom.

### Block 1: Portrait
- Full `portrait` text from Claude
- "다시 분석" button top-right → calls `GET /api/insights?refresh=true`, shows spinner

### Block 2: Interest Map (quantitative)
- Horizontal bar chart per category
  - Bar length = link count (relative to max)
  - Secondary bar overlay = completion rate (green fill)
  - "↑ 급증" badge if last-30-day share > prior period by 10+ percentage points
- Tab toggle: `전체 기간` / `최근 30일`
- Built with plain CSS bars (no chart library dependency)

### Block 3: Discovered Patterns (qualitative)
Three cards, each with an icon, label, and one-paragraph text:

| Card | Source field | Label |
|------|-------------|-------|
| 부상 중인 관심사 | `emerging` | 요즘 관심사 |
| 연결고리 | `connection` | 의외의 연결 |
| 미뤄지는 영역 | `blind_spots` | 아직 못 읽은 것들 |

---

## Data Flow

```
User opens dashboard
  → fetch GET /api/insights (with auth)
    → if cache hit (< 24h): return cached JSON immediately
    → if cache miss:
        1. query DB for structured stats
        2. call Claude Haiku with prompt
        3. parse JSON response
        4. store in InsightCache
        5. return to client
  → dashboard panel renders portrait + themes
  → [전체 보기] → /insights renders full breakdown
```

---

## What Is Not In Scope

- Vector embeddings / semantic search
- Weekly email/push reports (can be added later)
- Per-link "this connects to X" real-time annotation
- Insight history / diff between past and current portrait

---

## Migration

New `insight_cache` table via Alembic migration:
`0004_add_insight_cache.py`

No changes to existing tables.
