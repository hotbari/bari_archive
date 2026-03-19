import json
import re

from openai import OpenAI
# import anthropic
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.category import UserProfile

router = APIRouter()

INTERVIEW_QUESTIONS = [
    {
        "id": "interests",
        "question": "What topics are you most interested in? (e.g., technology, cooking, sports, finance)",
    },
    {
        "id": "content_types",
        "question": "What types of content do you usually save? (e.g., articles, products, social posts, recipes)",
    },
    {
        "id": "goals",
        "question": "Why do you save links? (e.g., research, shopping, reading later, sharing)",
    },
    {
        "id": "categories_preference",
        "question": "How would you prefer your links organized? (e.g., by topic, by source, by project)",
    },
]


class ProfileResponse(BaseModel):
    id: str
    interview_answers: dict | None
    interests: dict | None
    preferences: dict | None

    class Config:
        from_attributes = True


class InterviewSubmit(BaseModel):
    answers: dict  # {question_id: answer_text}


@router.get("/questions")
async def get_questions():
    return {"questions": INTERVIEW_QUESTIONS}


@router.get("", response_model=ProfileResponse | None)
async def get_profile(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(UserProfile).order_by(UserProfile.created_at.desc()).limit(1)
    )
    return result.scalar_one_or_none()


@router.post("/interview", response_model=ProfileResponse)
async def submit_interview(data: InterviewSubmit, db: AsyncSession = Depends(get_db)):
    if not data.answers:
        raise HTTPException(status_code=422, detail="answers must not be empty")

    interests = await _extract_interests(data.answers)

    # Upsert: update existing profile or create new one
    result = await db.execute(
        select(UserProfile).order_by(UserProfile.created_at.desc()).limit(1)
    )
    profile = result.scalar_one_or_none()

    if profile:
        profile.interview_answers = data.answers
        profile.interests = interests
    else:
        profile = UserProfile(interview_answers=data.answers, interests=interests)
        db.add(profile)

    await db.commit()
    await db.refresh(profile)
    return profile


async def _extract_interests(answers: dict) -> dict:
    """Use Claude to extract structured interests from interview answers."""
    if not settings.openai_api_key:
        return {"raw": answers}

    client = OpenAI(api_key=settings.openai_api_key)

    prompt = f"""Based on these user interview answers about their content preferences, extract structured interest categories.

Interview answers:
{json.dumps(answers, indent=2)}

Return valid JSON only — no markdown fences:
{{
  "primary_interests": ["list of main interest areas"],
  "content_preferences": ["preferred content types"],
  "organization_style": "how they prefer to organize",
  "suggested_categories": ["category1", "category2", "category3"]
}}"""

    completion = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a helpful assistant that outputs only valid JSON."},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"}, # JSON 출력 강제
        max_tokens=512
    )

    response_text = completion.choices[0].message.content.strip()
    response_text = re.sub(r"^```(?:json)?\s*", "", response_text)
    response_text = re.sub(r"\s*```$", "", response_text)

    try:
        return json.loads(response_text)
    except json.JSONDecodeError:
        return {"raw": answers}
