import json
import re

import anthropic
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.category import Category, UserProfile


async def classify_link(
    db: AsyncSession,
    url: str,
    title: str | None,
    description: str | None,
    source_type: str,
    user_id: str | None = None,
) -> str | None:
    """Classify a link into a category using Claude. Creates category on the fly if needed."""
    if not settings.claude_api_key:
        return None

    # Fetch existing categories and user profile for this user
    cats_query = select(Category)
    if user_id:
        cats_query = cats_query.where(Category.user_id == user_id)
    cats_result = await db.execute(cats_query)
    categories = cats_result.scalars().all()

    profile_query = select(UserProfile).order_by(UserProfile.created_at.desc()).limit(1)
    if user_id:
        profile_query = select(UserProfile).where(UserProfile.user_id == user_id).order_by(UserProfile.created_at.desc()).limit(1)
    profile_result = await db.execute(profile_query)
    profile = profile_result.scalar_one_or_none()

    existing_cats = [{"name": c.name, "description": c.description} for c in categories]
    user_interests = profile.interests if profile else None

    client = anthropic.Anthropic(api_key=settings.claude_api_key)

    prompt = f"""You are categorizing a saved web link for a personal archive.

Link info:
- URL: {url}
- Title: {title or "Unknown"}
- Description: {description or "None"}
- Source type: {source_type}

Existing categories:
{json.dumps(existing_cats, indent=2) if existing_cats else "None yet — feel free to create the first one."}

User interests:
{json.dumps(user_interests, indent=2) if user_interests else "Not set — use the link content to decide."}

Instructions:
- Pick the best existing category if one fits well.
- Otherwise create a new short, descriptive category name.
- Keep category names concise (1-3 words, title case).

Respond with valid JSON only — no markdown fences:
{{
  "category_name": "Category Name",
  "is_new": true,
  "description": "One-sentence description (only needed if is_new is true)",
  "keywords": ["keyword1", "keyword2"]
}}"""

    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=256,
        messages=[{"role": "user", "content": prompt}],
    )

    response_text = message.content[0].text.strip()
    # Strip optional markdown code fences
    response_text = re.sub(r"^```(?:json)?\s*", "", response_text)
    response_text = re.sub(r"\s*```$", "", response_text)

    try:
        data = json.loads(response_text)
    except json.JSONDecodeError:
        return None

    category_name: str = data.get("category_name", "").strip()
    if not category_name:
        return None

    # Find or create the category for this user
    cat_query = select(Category).where(Category.name == category_name)
    if user_id:
        cat_query = cat_query.where(Category.user_id == user_id)
    result = await db.execute(cat_query)
    category = result.scalar_one_or_none()

    if not category:
        category = Category(
            name=category_name,
            description=data.get("description"),
            keywords=data.get("keywords"),
            user_id=user_id,
        )
        db.add(category)
        await db.flush()

    return category.id
