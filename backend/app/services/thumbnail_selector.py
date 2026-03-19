"""Smart thumbnail selection using AI relevance scoring."""

import json
import re

import anthropic

from app.config import settings
from app.services.scraper import ImageMeta


async def select_thumbnail(
    title: str | None,
    description: str | None,
    source_type: str,
    url: str,
    images: list[ImageMeta],
) -> tuple[str | None, list[float]]:
    """Score images for relevance to the link content using Claude.

    Returns (best_image_url, scores) where scores aligns 1:1 with images.
    Falls back to the first image if Claude is unavailable or scoring fails.
    """
    if not images:
        return None, []

    if len(images) == 1:
        return images[0].url, [1.0]

    if not settings.claude_api_key:
        return images[0].url, [1.0] + [0.0] * (len(images) - 1)

    client = anthropic.Anthropic(api_key=settings.claude_api_key)

    image_list = [
        {
            "index": i,
            "url": img.url,
            "alt_text": img.alt_text or "",
            "dimensions": f"{img.width}x{img.height}" if img.width and img.height else "unknown",
        }
        for i, img in enumerate(images)
    ]

    prompt = f"""You are selecting the best thumbnail image for a saved web link.

Link info:
- URL: {url}
- Title: {title or "Unknown"}
- Description: {description or "None"}
- Source type: {source_type}

Candidate images (by index):
{json.dumps(image_list, indent=2)}

Score each image from 0.0 to 1.0 for how well it serves as a thumbnail representing this link's content.

Prefer images that:
- Show the main subject (product, article hero, social post content)
- Have large dimensions (not tiny icons or tracking pixels)
- Have descriptive alt text matching the link topic
- Are not logos, avatars, or generic site chrome
- Appear early in the list (og:image / twitter:image are first and usually most representative)

Respond with valid JSON only — no markdown fences:
{{"scores": [<score for index 0>, <score for index 1>, ...]}}

The scores array MUST have exactly {len(images)} entries."""

    try:
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}],
        )
        response_text = message.content[0].text.strip()
        response_text = re.sub(r"^```(?:json)?\s*", "", response_text)
        response_text = re.sub(r"\s*```$", "", response_text)

        data = json.loads(response_text)
        scores: list[float] = [float(s) for s in data.get("scores", [])]

        if len(scores) != len(images):
            raise ValueError(f"Expected {len(images)} scores, got {len(scores)}")

        best_idx = scores.index(max(scores))
        return images[best_idx].url, scores

    except Exception:
        # Graceful fallback: first image (og:image is typically best)
        return images[0].url, [1.0] + [0.0] * (len(images) - 1)
