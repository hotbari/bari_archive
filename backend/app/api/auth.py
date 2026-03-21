from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.config import settings
from app.database import get_db
from app.models.user import User

router = APIRouter()


class UpsertUserRequest(BaseModel):
    google_id: str
    email: str
    name: str | None = None
    avatar_url: str | None = None


class UpsertUserResponse(BaseModel):
    user_id: str


@router.post("/user", response_model=UpsertUserResponse)
async def upsert_user(
    body: UpsertUserRequest,
    x_api_key: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    if x_api_key != settings.backend_api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")

    result = await db.execute(select(User).where(User.google_id == body.google_id))
    user = result.scalar_one_or_none()

    if user:
        user.email = body.email
        user.name = body.name
        user.avatar_url = body.avatar_url
    else:
        user = User(
            google_id=body.google_id,
            email=body.email,
            name=body.name,
            avatar_url=body.avatar_url,
        )
        db.add(user)

    await db.commit()
    await db.refresh(user)
    return UpsertUserResponse(user_id=user.id)
