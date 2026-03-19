import asyncio

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime

from pydantic import BaseModel, HttpUrl

from app.database import get_db
from app.models.link import Link, LinkImage
from app.services.categorizer import classify_link
from app.services.scraper import scrape_url
from app.services.thumbnail_selector import select_thumbnail

router = APIRouter()


class LinkCreate(BaseModel):
    url: HttpUrl
    user_notes: str | None = None


class LinkUpdate(BaseModel):
    user_notes: str | None = None
    status: str | None = None  # pending | done


class LinkResponse(BaseModel):
    id: str
    url: str
    title: str | None
    description: str | None
    source_type: str
    category_id: str | None
    thumbnail_url: str | None
    user_notes: str | None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


@router.post("/", response_model=LinkResponse)
async def create_link(link: LinkCreate, db: AsyncSession = Depends(get_db)):
    url_str = str(link.url)
    meta = await scrape_url(url_str)

    category_id, (thumbnail_url, scores) = await asyncio.gather(
        classify_link(
            db=db,
            url=url_str,
            title=meta.title,
            description=meta.description,
            source_type=meta.source_type,
        ),
        select_thumbnail(
            title=meta.title,
            description=meta.description,
            source_type=meta.source_type,
            url=url_str,
            images=meta.images,
        ),
    )

    new_link = Link(
        url=url_str,
        title=meta.title,
        description=meta.description,
        source_type=meta.source_type,
        category_id=category_id,
        thumbnail_url=thumbnail_url,
        user_notes=link.user_notes,
    )
    db.add(new_link)
    await db.flush()  # populate new_link.id before inserting images

    for i, img in enumerate(meta.images):
        score = scores[i] if i < len(scores) else None
        db.add(LinkImage(
            link_id=new_link.id,
            url=img.url,
            alt_text=img.alt_text,
            width=img.width,
            height=img.height,
            relevance_score=score,
            is_thumbnail=(img.url == thumbnail_url),
        ))

    await db.commit()
    await db.refresh(new_link)
    return new_link


@router.get("/", response_model=list[LinkResponse])
async def list_links(
    category_id: str | None = None,
    source_type: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Link).order_by(Link.created_at.desc())
    if category_id:
        query = query.where(Link.category_id == category_id)
    if source_type:
        query = query.where(Link.source_type == source_type)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{link_id}", response_model=LinkResponse)
async def get_link(link_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Link).where(Link.id == link_id))
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    return link


@router.patch("/{link_id}", response_model=LinkResponse)
async def update_link(link_id: str, update: LinkUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Link).where(Link.id == link_id))
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    if "user_notes" in update.model_fields_set:
        link.user_notes = update.user_notes
    if "status" in update.model_fields_set:
        link.status = update.status
    await db.commit()
    await db.refresh(link)
    return link


@router.delete("/{link_id}")
async def delete_link(link_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Link).where(Link.id == link_id))
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    await db.delete(link)
    await db.commit()
    return {"deleted": True}
