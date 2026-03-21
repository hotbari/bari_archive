from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.database import get_db
from app.models.category import Category
from app.models.user import User
from app.dependencies.auth import get_current_user

router = APIRouter()


class CategoryResponse(BaseModel):
    id: str
    name: str
    description: str | None

    class Config:
        from_attributes = True


@router.get("", response_model=list[CategoryResponse])
async def list_categories(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Category).where(Category.user_id == current_user.id).order_by(Category.name)
    )
    return result.scalars().all()
