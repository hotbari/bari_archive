import json
import re

from openai import OpenAI
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.category import UserProfile
from app.models.user import User
from app.dependencies.auth import get_current_user

router = APIRouter()

INTERVIEW_QUESTIONS = [
    {
        "id": "interests",
        "question": "What topics do you find yourself exploring most often? (e.g., software development, investing, fitness, design, cooking)",
    },
    {
        "id": "usage",
        "question": "When you save a link, what are you usually planning to do with it? (e.g., read it later, compare before buying, reference for work, track trends)",
    },
    {
        "id": "categories_preference",
        "question": 'If you had a few folders for your saved links, what would you call them? (e.g., "Dev Resources", "Things to Buy", "Articles to Read")',
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
async def get_profile(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UserProfile)
        .where(UserProfile.user_id == current_user.id)
        .order_by(UserProfile.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


@router.post("/interview", response_model=ProfileResponse)
async def submit_interview(
    data: InterviewSubmit,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not data.answers:
        raise HTTPException(status_code=422, detail="answers must not be empty")

    interests = await _extract_interests(data.answers)

    # Upsert: update existing profile or create new one
    result = await db.execute(
        select(UserProfile)
        .where(UserProfile.user_id == current_user.id)
        .order_by(UserProfile.created_at.desc())
        .limit(1)
    )
    profile = result.scalar_one_or_none()

    if profile:
        profile.interview_answers = data.answers
        profile.interests = interests
    else:
        profile = UserProfile(
            user_id=current_user.id,
            interview_answers=data.answers,
            interests=interests,
        )
        db.add(profile)

    await db.commit()
    await db.refresh(profile)
    return profile


async def _extract_interests(answers: dict) -> dict:
    """Use OpenAI to extract structured interests from interview answers."""
    if not settings.openai_api_key:
        return {"raw": answers}

    client = OpenAI(api_key=settings.openai_api_key)

    prompt = f"""Based on these user interview answers, extract structured interest categories for a personal link-archiving app.

Interview answers:
- interests: what topics they explore most often
- usage: what they plan to do with saved links (informs organization_style)
- categories_preference: folder names they'd use (directly seeds suggested_categories)

Answers:
{json.dumps(answers, indent=2)}

Return valid JSON only — no markdown fences:
{{
  "primary_interests": ["list of main interest areas from 'interests' answer"],
  "organization_style": "inferred from 'usage' answer (e.g. read-later, research, shopping)",
  "suggested_categories": ["category1", "category2", "category3", "category4", "category5"]
}}"""

    completion = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a helpful assistant that outputs only valid JSON."},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        max_tokens=512
    )

    response_text = completion.choices[0].message.content.strip()
    response_text = re.sub(r"^```(?:json)?\s*", "", response_text)
    response_text = re.sub(r"\s*```$", "", response_text)

    try:
        return json.loads(response_text)
    except json.JSONDecodeError:
        return {"raw": answers}
