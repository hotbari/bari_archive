# Self-Insight Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-insight system that analyzes saved links, notes, and behavior to generate an AI portrait and interest map — displayed as a dashboard panel and a dedicated `/insights` page.

**Architecture:** A new `InsightCache` table stores per-user AI-generated insight payloads. A `GET /api/insights` FastAPI endpoint collects structured stats from the DB and calls Claude Haiku when cache is stale. Three mutation endpoints (create/update/delete link) invalidate the cache. The Next.js proxy forwards auth headers. Two new frontend surfaces render the result.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, Claude Haiku (`claude-haiku-4-5-20251001`), Next.js 15 App Router, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-21-self-insight-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/app/models/insight.py` | Create | `InsightCache` SQLAlchemy model |
| `backend/alembic/versions/0004_add_insight_cache.py` | Create | DB migration for `insight_cache` table |
| `backend/app/services/insight_engine.py` | Create | Data collection queries + Claude call → `InsightData` |
| `backend/app/api/insights.py` | Create | `GET /api/insights` FastAPI router |
| `backend/app/main.py` | Modify | Register insights router |
| `backend/app/api/links.py` | Modify | Invalidate cache in create/update/delete |
| `frontend/src/types/insights.ts` | Create | TypeScript `InsightData` + `InsightTheme` interfaces |
| `frontend/src/lib/api.ts` | Modify | Add `api.getInsights()` method |
| `frontend/src/app/api/insights/route.ts` | Create | Next.js proxy route to FastAPI |
| `frontend/src/app/dashboard/page.tsx` | Modify | Add `InsightPanel` component |
| `frontend/src/app/insights/page.tsx` | Create | Full `/insights` page |

---

## Task 1: `InsightCache` model + migration

**Files:**
- Create: `backend/app/models/insight.py`
- Create: `backend/alembic/versions/0004_add_insight_cache.py`

- [ ] **Step 1: Create the model**

Create `backend/app/models/insight.py`:

```python
import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class InsightCache(Base):
    __tablename__ = "insight_cache"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    generated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    data: Mapped[dict] = mapped_column(JSON, nullable=False)
```

- [ ] **Step 2: Create the Alembic migration**

Create `backend/alembic/versions/0004_add_insight_cache.py`:

```python
"""Add insight_cache table

Revision ID: 0004
Revises: 0003
Create Date: 2026-03-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "insight_cache",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), nullable=True),
        sa.Column("generated_at", sa.DateTime, nullable=False),
        sa.Column("data", sa.JSON, nullable=False),
    )


def downgrade() -> None:
    op.drop_table("insight_cache")
```

- [ ] **Step 3: Run migration**

```bash
cd /Users/yeonsu/2026/bari_archive
docker compose exec backend alembic upgrade head
```

Expected output: `Running upgrade 0003 -> 0004, Add insight_cache table`

- [ ] **Step 4: Verify table exists**

```bash
docker compose exec db psql -U postgres -d arkive -c "\d insight_cache"
```

Expected: table with columns `id`, `user_id`, `generated_at`, `data`

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/insight.py backend/alembic/versions/0004_add_insight_cache.py
git commit -m "feat: add InsightCache model and migration"
```

---

## Task 2: Insight Engine service

**Files:**
- Create: `backend/app/services/insight_engine.py`

This service collects stats from the DB, builds a structured prompt, calls Claude, and returns a dict matching the `InsightData` schema.

- [ ] **Step 1: Create the service**

Create `backend/app/services/insight_engine.py`:

```python
import asyncio
import json
import re
from datetime import datetime, timedelta

import anthropic
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.link import Link
from app.models.category import Category


def _strip_fences(text: str) -> str:
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _call_claude(prompt: str) -> dict | None:
    if not settings.claude_api_key:
        return None
    try:
        client = anthropic.Anthropic(api_key=settings.claude_api_key)
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = _strip_fences(message.content[0].text)
        return json.loads(raw)
    except Exception:
        return None


async def generate_insight(db: AsyncSession, user_id: str) -> dict | None:
    """Collect structured stats and call Claude. Returns InsightData dict or None on failure."""
    now = datetime.utcnow()
    cutoff_30d = now - timedelta(days=30)
    stale_cutoff = now - timedelta(days=14)

    # 1. All links for user
    all_links_q = await db.execute(
        select(Link).where(Link.user_id == user_id)
    )
    all_links = all_links_q.scalars().all()
    total = len(all_links)

    if total == 0:
        return None

    # 2. Category names
    cat_ids = {l.category_id for l in all_links if l.category_id}
    cat_map: dict[str, str] = {}
    if cat_ids:
        cats_q = await db.execute(select(Category).where(Category.id.in_(cat_ids)))
        for cat in cats_q.scalars().all():
            cat_map[cat.id] = cat.name

    # 3. Category distribution: count + done count + avg days to complete
    cat_stats: dict[str, dict] = {}
    for link in all_links:
        name = cat_map.get(link.category_id or "", "Uncategorized")
        if name not in cat_stats:
            cat_stats[name] = {"count": 0, "done": 0, "days_sum": 0, "days_count": 0}
        cat_stats[name]["count"] += 1
        if link.status == "done":
            cat_stats[name]["done"] += 1
            days = (link.updated_at - link.created_at).days
            cat_stats[name]["days_sum"] += days
            cat_stats[name]["days_count"] += 1

    # 4. Temporal comparison: last 30d vs prior
    recent_counts: dict[str, int] = {}
    prior_counts: dict[str, int] = {}
    for link in all_links:
        name = cat_map.get(link.category_id or "", "Uncategorized")
        if link.created_at >= cutoff_30d:
            recent_counts[name] = recent_counts.get(name, 0) + 1
        else:
            prior_counts[name] = prior_counts.get(name, 0) + 1

    # 5. Note texts (up to 20 most recent non-null)
    notes = [l.user_notes for l in sorted(all_links, key=lambda x: x.created_at, reverse=True)
             if l.user_notes][:20]

    # 6. Stalled links by category (pending/in_progress for > 14 days)
    stalled: dict[str, int] = {}
    for link in all_links:
        if link.status in ("pending", "in_progress") and link.updated_at < stale_cutoff:
            name = cat_map.get(link.category_id or "", "Uncategorized")
            stalled[name] = stalled.get(name, 0) + 1

    # Build prompt
    breakdown_lines = []
    for name, s in sorted(cat_stats.items(), key=lambda x: -x[1]["count"]):
        pct_done = round(s["done"] / s["count"] * 100) if s["count"] else 0
        avg_days = round(s["days_sum"] / s["days_count"]) if s["days_count"] else "N/A"
        breakdown_lines.append(f"  - {name}: {s['count']} links, {pct_done}% done, avg {avg_days}d to complete")

    temporal_lines = []
    all_cat_names = set(recent_counts) | set(prior_counts)
    for name in sorted(all_cat_names):
        temporal_lines.append(f"  - {name}: was {prior_counts.get(name, 0)}, now {recent_counts.get(name, 0)}")

    stalled_lines = [f"  - {n}: {c} links" for n, c in sorted(stalled.items(), key=lambda x: -x[1])]

    prompt = f"""User archive summary:
- Total: {total} links across {len(cat_stats)} categories
- Category breakdown:
{chr(10).join(breakdown_lines) or "  (none)"}
- Last 30 days vs prior period:
{chr(10).join(temporal_lines) or "  (none)"}
- User notes sample (recent):
{json.dumps(notes[:10], ensure_ascii=False) if notes else "  (none)"}
- Stalled by category (>14 days without action):
{chr(10).join(stalled_lines) or "  (none)"}

Return JSON only, no markdown fences:
{{
  "portrait": "3-4 sentence description of this person based on patterns",
  "themes": [{{"name": "...", "description": "one sentence"}}, {{"name": "...", "description": "one sentence"}}, {{"name": "...", "description": "one sentence"}}],
  "emerging": "one sentence about recently growing interest",
  "blind_spots": "one sentence about the stalled/not-consumed pattern",
  "connection": "one sentence about unexpected cross-category link"
}}"""

    data = await asyncio.to_thread(_call_claude, prompt)
    if not data:
        return None

    # Attach metadata
    data["total_links"] = total
    data["generated_at"] = now.isoformat()
    return data
```

- [ ] **Step 2: Verify service imports cleanly**

```bash
docker compose exec backend python -c "from app.services.insight_engine import generate_insight; print('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/insight_engine.py
git commit -m "feat: add insight engine service"
```

---

## Task 3: FastAPI insights endpoint

**Files:**
- Create: `backend/app/api/insights.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create the router**

Create `backend/app/api/insights.py`:

```python
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.link import Link
from app.models.user import User
from app.models.insight import InsightCache
from app.dependencies.auth import get_current_user
from app.services.insight_engine import generate_insight

router = APIRouter()

CACHE_TTL_HOURS = 24


@router.get("/")
async def get_insights(
    refresh: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Check cache first (skip if refresh requested)
    if not refresh:
        result = await db.execute(
            select(InsightCache).where(InsightCache.user_id == current_user.id)
        )
        cached = result.scalar_one_or_none()
        if cached:
            age = datetime.utcnow() - cached.generated_at
            if age < timedelta(hours=CACHE_TTL_HOURS):
                return cached.data

    # Check if user has any links before calling Claude
    count_result = await db.execute(
        select(Link).where(Link.user_id == current_user.id).limit(1)
    )
    if not count_result.scalar_one_or_none():
        return JSONResponse(status_code=204, content=None)

    # Generate fresh insight
    data = await generate_insight(db, current_user.id)

    if data is None:
        # Claude failed
        return JSONResponse(status_code=503, content={"detail": "Insight generation failed"})

    # Upsert cache
    result = await db.execute(
        select(InsightCache).where(InsightCache.user_id == current_user.id)
    )
    cached = result.scalar_one_or_none()
    if cached:
        cached.data = data
        cached.generated_at = datetime.utcnow()
    else:
        db.add(InsightCache(user_id=current_user.id, data=data))
    await db.commit()

    return data
```

- [ ] **Step 2: Register router in `main.py`**

Edit `backend/app/main.py`. Add to imports:
```python
from app.api import links, categories, reviews, profile, auth, insights
```

Add after the last `include_router` line:
```python
app.include_router(insights.router, prefix="/api/insights", tags=["insights"])
```

- [ ] **Step 3: Restart backend and verify endpoint exists**

```bash
docker compose restart backend
curl http://localhost:8000/openapi.json | python -m json.tool | grep insights
```

Expected: `"GET /api/insights/"` appears in the output

- [ ] **Step 4: Smoke test the endpoint (requires a valid API key)**

```bash
curl -H "x-api-key: $BACKEND_API_KEY" -H "x-user-id: <any-user-id>" \
  http://localhost:8000/api/insights/
```

Expected: `204` (no links) or a JSON object with `portrait`, `themes`, etc.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/insights.py backend/app/main.py
git commit -m "feat: add GET /api/insights endpoint"
```

---

## Task 4: Cache invalidation in links.py

**Files:**
- Modify: `backend/app/api/links.py`

Add a helper to delete the user's `InsightCache` row, then call it at the end of `create_link`, `update_link`, and `delete_link`.

- [ ] **Step 1: Add import and helper**

At the top of `backend/app/api/links.py`, add to the import block:

```python
from app.models.insight import InsightCache
```

After the `router = APIRouter()` line, add:

```python
async def _invalidate_insight_cache(db: AsyncSession, user_id: str) -> None:
    result = await db.execute(
        select(InsightCache).where(InsightCache.user_id == user_id)
    )
    cached = result.scalar_one_or_none()
    if cached:
        await db.delete(cached)
        await db.commit()
```

- [ ] **Step 2: Call invalidation in `create_link`**

At the end of `create_link`, after `await db.refresh(new_link)` and before `return new_link`:

```python
    await _invalidate_insight_cache(db, current_user.id)
    return new_link
```

- [ ] **Step 3: Call invalidation in `update_link`**

At the end of `update_link`, after `await db.refresh(link)` and before `return link`:

```python
    await _invalidate_insight_cache(db, current_user.id)
    return link
```

- [ ] **Step 4: Call invalidation in `delete_link`**

At the end of `delete_link`, after `await db.commit()` and before `return {"deleted": True}`:

```python
    await _invalidate_insight_cache(db, current_user.id)
    return {"deleted": True}
```

- [ ] **Step 5: Verify backend restarts cleanly**

```bash
docker compose restart backend
curl http://localhost:8000/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/links.py
git commit -m "feat: invalidate insight cache on link mutations"
```

---

## Task 5: Next.js proxy route

**Files:**
- Create: `frontend/src/app/api/insights/route.ts`

- [ ] **Step 1: Create the proxy route**

Create `frontend/src/app/api/insights/route.ts`:

```typescript
import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const BACKEND_API_KEY = process.env.BACKEND_API_KEY || "";

function backendHeaders(userId: string) {
  return {
    "Content-Type": "application/json",
    "x-api-key": BACKEND_API_KEY,
    "x-user-id": userId,
  };
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const url = new URL(`${BACKEND_URL}/api/insights/`);
  searchParams.forEach((v, k) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: backendHeaders(session.user.id),
    cache: "no-store",
  });

  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 2: Verify route is reachable via Next.js**

Start the frontend dev server and hit the route:

```bash
curl http://localhost:3000/api/insights
```

Expected: JSON insight object (200), `204` if no links, or `401` if not authenticated in browser

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/api/insights/route.ts
git commit -m "feat: add Next.js proxy route for insights"
```

---

## Task 6: TypeScript types + `api.ts` method

**Files:**
- Create: `frontend/src/types/insights.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Create types file**

Create `frontend/src/types/insights.ts`:

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

- [ ] **Step 2: Add `getInsights` to `api.ts`**

In `frontend/src/lib/api.ts`, add to the `api` object (after `createReview`):

```typescript
  async getInsights(refresh = false): Promise<InsightData | null> {
    const url = refresh ? "/api/insights?refresh=true" : "/api/insights";
    const res = await apiFetch(url);
    if (res.status === 204 || res.status === 503) return null;
    if (!res.ok) return null;
    return res.json();
  },
```

Add the import at the top of `api.ts`:
```typescript
import type { InsightData } from "@/types/insights";
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/insights.ts frontend/src/lib/api.ts
git commit -m "feat: add InsightData types and getInsights API method"
```

---

## Task 7: Dashboard insight panel

**Files:**
- Modify: `frontend/src/app/dashboard/page.tsx`

Add an `InsightPanel` component and wire it into the dashboard. The panel lives between the header and the filter bar inside the sticky group.

- [ ] **Step 1: Add `InsightPanel` component**

At the top of `dashboard/page.tsx`, add the import:
```typescript
import type { InsightData } from "@/types/insights";
```

Add this component before the `Dashboard` function:

```typescript
function InsightPanel({ insight, onViewAll }: {
  insight: InsightData;
  onViewAll: () => void;
}) {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("mya_insight_panel") === "collapsed"
  );

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    if (next) {
      localStorage.setItem("mya_insight_panel", "collapsed");
    } else {
      localStorage.removeItem("mya_insight_panel");
    }
  }

  return (
    <div style={{
      borderBottom: "1px solid var(--border)",
      background: "var(--surface-2)",
      padding: "0.625rem 1.5rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          나의 관심사
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {collapsed && (
            <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
              {insight.themes.slice(0, 2).map((t) => (
                <span key={t.name} style={{
                  padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 600,
                  background: "rgba(99,102,241,0.12)", color: "var(--primary)",
                  border: "1px solid rgba(99,102,241,0.2)",
                }}>
                  {t.name}
                </span>
              ))}
            </div>
          )}
          <button
            onClick={onViewAll}
            style={{ fontSize: 11, color: "var(--primary)", background: "transparent", padding: 0 }}
          >
            전체 보기 →
          </button>
          <button
            onClick={toggleCollapse}
            style={{ fontSize: 11, color: "var(--text-dim)", background: "transparent", padding: 0 }}
          >
            {collapsed ? "∨" : "∧"}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div style={{ marginTop: "0.5rem" }}>
          <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: "0.5rem" }}>
            {insight.portrait.split(". ").slice(0, 2).join(". ") + "."}
          </p>
          <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
            {insight.themes.map((t) => (
              <span key={t.name} style={{
                padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 600,
                background: "rgba(99,102,241,0.12)", color: "var(--primary)",
                border: "1px solid rgba(99,102,241,0.2)",
              }}>
                {t.name}
              </span>
            ))}
            {insight.emerging && (
              <span style={{
                padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 600,
                background: "rgba(16,185,129,0.1)", color: "#10b981",
                border: "1px solid rgba(16,185,129,0.2)",
              }}>
                ↑ 부상중
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add insight state to `Dashboard`**

In the `Dashboard` function, add state after the existing state declarations:

```typescript
const [insight, setInsight] = useState<InsightData | null>(null);
```

- [ ] **Step 3: Fetch insight after links load**

In the `useEffect` inside `Dashboard`, after `setLoading(false)`, add:

```typescript
      if (linksData.length >= 5) {
        api.getInsights().then(setInsight);
      }
```

- [ ] **Step 4: Render the panel**

In the JSX, inside the sticky `div` (the one with `position: sticky, top: 0, zIndex: 100`), between the `<header>` and the filter bar `<div>`, add:

```typescript
        {insight && (
          <InsightPanel
            insight={insight}
            onViewAll={() => router.push("/insights")}
          />
        )}
```

- [ ] **Step 5: Manual test**

Open the app in browser. With >= 5 links saved:
- The insight panel should appear between header and filter bar
- It should show a 2-sentence portrait excerpt and theme tags
- Collapse/expand should work and persist across page refresh
- "전체 보기 →" should navigate to `/insights` (404 until Task 8)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/dashboard/page.tsx
git commit -m "feat: add insight panel to dashboard"
```

---

## Task 8: `/insights` page

**Files:**
- Create: `frontend/src/app/insights/page.tsx`

- [ ] **Step 1: Create the page**

Create `frontend/src/app/insights/page.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Link as LinkType, Category } from "@/lib/api";
import type { InsightData } from "@/types/insights";

function BarChart({ links, categories, tab }: {
  links: LinkType[];
  categories: Category[];
  tab: "all" | "recent";
}) {
  const now = new Date();
  const cutoff30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const filtered = tab === "recent"
    ? links.filter((l) => new Date(l.created_at) >= cutoff30d)
    : links;

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));

  const stats: Record<string, { count: number; done: number }> = {};
  for (const l of filtered) {
    const name = catMap[l.category_id ?? ""] ?? "Uncategorized";
    if (!stats[name]) stats[name] = { count: 0, done: 0 };
    stats[name].count++;
    if (l.status === "done") stats[name].done++;
  }

  const allLinks30d: Record<string, number> = {};
  const allLinksPrior: Record<string, number> = {};
  for (const l of links) {
    const name = catMap[l.category_id ?? ""] ?? "Uncategorized";
    if (new Date(l.created_at) >= cutoff30d) {
      allLinks30d[name] = (allLinks30d[name] ?? 0) + 1;
    } else {
      allLinksPrior[name] = (allLinksPrior[name] ?? 0) + 1;
    }
  }

  const total30d = Object.values(allLinks30d).reduce((a, b) => a + b, 0);
  const totalPrior = Object.values(allLinksPrior).reduce((a, b) => a + b, 0);

  const entries = Object.entries(stats).sort((a, b) => b[1].count - a[1].count);
  const maxCount = Math.max(...entries.map(([, s]) => s.count), 1);

  if (entries.length === 0) {
    return <p style={{ color: "var(--text-dim)", fontSize: 13 }}>이 기간에 저장된 링크가 없습니다.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {entries.map(([name, s]) => {
        const pct = s.count / maxCount;
        const donePct = s.done / s.count;
        const share30d = total30d ? (allLinks30d[name] ?? 0) / total30d : 0;
        const sharePrior = totalPrior ? (allLinksPrior[name] ?? 0) / totalPrior : 0;
        const surging = share30d - sharePrior >= 0.1;

        return (
          <div key={name}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
              <span style={{ fontSize: 12, fontWeight: 500, minWidth: 100 }}>{name}</span>
              {surging && (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 10,
                  background: "rgba(16,185,129,0.12)", color: "#10b981",
                  border: "1px solid rgba(16,185,129,0.2)",
                }}>↑ 급증</span>
              )}
              <span style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: "auto" }}>
                {s.count}개 · {Math.round(donePct * 100)}% 완료
              </span>
            </div>
            <div style={{ position: "relative", height: 8, background: "var(--surface-2)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{
                position: "absolute", left: 0, top: 0, height: "100%",
                width: `${pct * 100}%`, background: "rgba(99,102,241,0.25)", borderRadius: 4,
              }} />
              <div style={{
                position: "absolute", left: 0, top: 0, height: "100%",
                width: `${pct * donePct * 100}%`, background: "#10b981", borderRadius: 4,
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function InsightsPage() {
  const router = useRouter();
  const [insight, setInsight] = useState<InsightData | null>(null);
  const [links, setLinks] = useState<LinkType[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"all" | "recent">("all");

  useEffect(() => {
    Promise.all([
      api.getInsights(),
      api.getLinks(),
      api.getCategories(),
    ]).then(([ins, ls, cs]) => {
      setInsight(ins);
      setLinks(ls);
      setCategories(cs);
      setLoading(false);
    });
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    const ins = await api.getInsights(true);
    setInsight(ins);
    setRefreshing(false);
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", color: "var(--text-muted)" }}>
        분석 중…
      </div>
    );
  }

  if (!insight) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100dvh", gap: "1rem", color: "var(--text-muted)" }}>
        <p>아직 인사이트를 생성하기에 충분한 링크가 없습니다.</p>
        <button onClick={() => router.push("/dashboard")} style={{ padding: "0.5rem 1rem", background: "var(--primary)", color: "white", fontWeight: 500 }}>
          대시보드로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "1.5rem 1rem 3rem" }}>

      {/* Back */}
      <button
        onClick={() => router.push("/dashboard")}
        style={{ fontSize: 12, color: "var(--text-dim)", background: "transparent", padding: 0, marginBottom: "1.5rem" }}
      >
        ← 대시보드
      </button>

      {/* Block 1: Portrait */}
      <section style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", marginBottom: "0.75rem" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>나의 포트레이트</h2>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              fontSize: 11, padding: "0.25rem 0.75rem", borderRadius: 12,
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--text-muted)", cursor: refreshing ? "not-allowed" : "pointer",
              opacity: refreshing ? 0.5 : 1, whiteSpace: "nowrap",
            }}
          >
            {refreshing ? "분석 중…" : "다시 분석"}
          </button>
        </div>
        <p style={{ fontSize: 14, lineHeight: 1.75, color: "var(--text-muted)" }}>
          {insight.portrait}
        </p>
      </section>

      {/* Block 2: Interest map */}
      <section style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>관심사 지형도</h2>
          <div style={{ display: "flex", gap: "0.25rem" }}>
            {(["all", "recent"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  fontSize: 11, padding: "0.2rem 0.75rem", borderRadius: 12,
                  border: `1px solid ${tab === t ? "var(--primary)" : "var(--border)"}`,
                  background: tab === t ? "rgba(99,102,241,0.1)" : "transparent",
                  color: tab === t ? "var(--primary)" : "var(--text-dim)",
                }}
              >
                {t === "all" ? "전체 기간" : "최근 30일"}
              </button>
            ))}
          </div>
        </div>
        <BarChart links={links} categories={categories} tab={tab} />
      </section>

      {/* Block 3: Discovered patterns */}
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: "1rem" }}>발견된 패턴</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[
            { label: "요즘 관심사", text: insight.emerging, color: "#10b981", bg: "rgba(16,185,129,0.06)" },
            { label: "의외의 연결", text: insight.connection, color: "var(--primary)", bg: "rgba(99,102,241,0.06)" },
            { label: "아직 못 읽은 것들", text: insight.blind_spots, color: "#f59e0b", bg: "rgba(245,158,11,0.06)" },
          ].map(({ label, text, color, bg }) => (
            <div key={label} style={{
              padding: "0.875rem 1rem",
              borderRadius: "var(--radius-lg)",
              background: bg,
              border: `1px solid ${color}22`,
            }}>
              <p style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.375rem" }}>
                {label}
              </p>
              <p style={{ fontSize: 13, lineHeight: 1.65, color: "var(--text-muted)" }}>
                {text}
              </p>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
```

- [ ] **Step 2: Manual test**

Navigate to `/insights` in the browser:
- Portrait text appears
- Bar chart shows categories with correct counts and done overlay
- "최근 30일" tab filters correctly
- "급증" badge appears on categories with recent surge
- Three pattern cards render (emerging, connection, blind_spots)
- "다시 분석" button triggers a refresh and re-renders

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/insights/page.tsx
git commit -m "feat: add /insights page with portrait, bar chart, and pattern cards"
```

---

## End-to-End Verification Checklist

Before considering this feature complete, verify each of the following manually:

- [ ] Dashboard shows insight panel when >= 5 links saved
- [ ] Dashboard does NOT call `/api/insights` when < 5 links saved
- [ ] Insight panel collapse state persists across page refresh
- [ ] "전체 보기 →" navigates to `/insights`
- [ ] `/insights` loads portrait, bar chart, patterns without errors
- [ ] "다시 분석" button refreshes the insight and updates the UI
- [ ] Adding a new link invalidates the cache (next insight fetch triggers Claude)
- [ ] Updating a link status invalidates the cache
- [ ] Deleting a link invalidates the cache
- [ ] `?refresh=true` forces regeneration even within 24h window
- [ ] If Claude API key is missing, endpoint returns 503 and panel hides silently
- [ ] DB contains an `insight_cache` row after first successful call:

```bash
docker compose exec db psql -U postgres -d arkive -c "SELECT user_id, generated_at FROM insight_cache;"
```

Expected: one row per user who has triggered insight generation

---

## Final Commit

```bash
git add \
  backend/app/models/insight.py \
  backend/alembic/versions/0004_add_insight_cache.py \
  backend/app/services/insight_engine.py \
  backend/app/api/insights.py \
  backend/app/main.py \
  backend/app/api/links.py \
  frontend/src/types/insights.ts \
  frontend/src/lib/api.ts \
  frontend/src/app/api/insights/route.ts \
  frontend/src/app/dashboard/page.tsx \
  frontend/src/app/insights/page.tsx
git commit -m "feat: self-insight feature complete (dashboard panel + /insights page)"
```
