import asyncio
import json
import re
from datetime import datetime, timedelta

import openai
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.link import Link
from app.models.category import Category


def _strip_fences(text: str) -> str:
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _call_openai(prompt: str) -> dict | None:
    if not settings.openai_api_key:
        return None
    try:
        client = openai.OpenAI(api_key=settings.openai_api_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = _strip_fences(response.choices[0].message.content or "")
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
{json.dumps(notes[:20], ensure_ascii=False) if notes else "  (none)"}
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

    data = await asyncio.to_thread(_call_openai, prompt)
    if not data:
        return None

    # Attach metadata
    data["total_links"] = total
    data["generated_at"] = now.isoformat()
    return data
