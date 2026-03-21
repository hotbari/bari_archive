from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.database import get_db
from app.models.link import Link
from app.models.user import User
from app.dependencies.auth import get_current_user
from app.services.reviewer import generate_reviews

router = APIRouter()


class ReviewRequest(BaseModel):
    user_insight: str


class LLMReview(BaseModel):
    model: str
    perspective: str
    content: str


class ReviewResponse(BaseModel):
    link_id: str
    user_insight: str
    reviews: list[LLMReview]


@router.post("/{link_id}", response_model=ReviewResponse)
async def create_review(
    link_id: str,
    request: ReviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Link).where(Link.id == link_id, Link.user_id == current_user.id)
    )
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    reviews = await generate_reviews(
        title=link.title,
        description=link.description,
        url=link.url,
        user_insight=request.user_insight,
    )

    return ReviewResponse(
        link_id=link_id,
        user_insight=request.user_insight,
        reviews=[LLMReview(model=r.model, perspective=r.perspective, content=r.content) for r in reviews],
    )
