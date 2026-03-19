"""Multi-LLM review service: Claude, Gemini, and GPT concurrent reviews."""

import asyncio
from dataclasses import dataclass


@dataclass
class LLMReview:
    model: str
    perspective: str
    content: str


def _build_prompt(title: str | None, description: str | None, url: str, user_insight: str, perspective: str) -> str:
    return f"""You are reviewing a saved web link from a {perspective} perspective.

Link info:
- URL: {url}
- Title: {title or "Unknown"}
- Description: {description or "None"}

User's insight: {user_insight}

Write a concise 2-4 paragraph review of this content from your {perspective} perspective.
Build on the user's insight where relevant. Be specific, thoughtful, and genuinely useful."""


def _call_claude(title: str | None, description: str | None, url: str, user_insight: str) -> LLMReview | None:
    from app.config import settings
    if not settings.claude_api_key:
        return None
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.claude_api_key)
        perspective = "analytical and critical thinking"
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            messages=[{
                "role": "user",
                "content": _build_prompt(title, description, url, user_insight, perspective),
            }],
        )
        return LLMReview(
            model="Claude",
            perspective="Analytical",
            content=message.content[0].text.strip(),
        )
    except Exception:
        return None


def _call_gemini(title: str | None, description: str | None, url: str, user_insight: str) -> LLMReview | None:
    from app.config import settings
    if not settings.gemini_api_key:
        return None
    try:
        from google import genai
        client = genai.Client(api_key=settings.gemini_api_key)
        perspective = "practical application and real-world use"
        prompt = _build_prompt(title, description, url, user_insight, perspective)
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
        )
        return LLMReview(
            model="Gemini",
            perspective="Practical",
            content=response.text.strip(),
        )
    except Exception:
        return None


def _call_gpt(title: str | None, description: str | None, url: str, user_insight: str) -> LLMReview | None:
    from app.config import settings
    if not settings.openai_api_key:
        return None
    try:
        from openai import OpenAI
        client = OpenAI(api_key=settings.openai_api_key)
        perspective = "broader context and connections to other ideas"
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=512,
            messages=[{
                "role": "user",
                "content": _build_prompt(title, description, url, user_insight, perspective),
            }],
        )
        return LLMReview(
            model="GPT",
            perspective="Contextual",
            content=response.choices[0].message.content.strip(),
        )
    except Exception:
        return None


async def generate_reviews(
    title: str | None,
    description: str | None,
    url: str,
    user_insight: str,
) -> list[LLMReview]:
    """Call Claude, Gemini, and GPT concurrently. Returns available reviews (skips failed ones)."""
    results = await asyncio.gather(
        asyncio.to_thread(_call_claude, title, description, url, user_insight),
        asyncio.to_thread(_call_gemini, title, description, url, user_insight),
        asyncio.to_thread(_call_gpt, title, description, url, user_insight),
    )
    return [r for r in results if r is not None]
