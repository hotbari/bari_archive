import uuid
from datetime import datetime

from sqlalchemy import String, Text, DateTime, ForeignKey, Integer, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Link(Base):
    __tablename__ = "links"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    title: Mapped[str | None] = mapped_column(String(512))
    description: Mapped[str | None] = mapped_column(Text)
    source_type: Mapped[str] = mapped_column(String(50))  # ecommerce, social, news, other
    category_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("categories.id"))
    thumbnail_url: Mapped[str | None] = mapped_column(String(2048))
    user_notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    category: Mapped["Category | None"] = relationship(back_populates="links")
    images: Mapped[list["LinkImage"]] = relationship(back_populates="link", cascade="all, delete-orphan")


class LinkImage(Base):
    __tablename__ = "link_images"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    link_id: Mapped[str] = mapped_column(String(36), ForeignKey("links.id"), nullable=False)
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    alt_text: Mapped[str | None] = mapped_column(String(512))
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    relevance_score: Mapped[float | None] = mapped_column()  # AI-scored relevance
    is_thumbnail: Mapped[bool] = mapped_column(Boolean, default=False)

    link: Mapped["Link"] = relationship(back_populates="images")
