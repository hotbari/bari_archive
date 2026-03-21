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
