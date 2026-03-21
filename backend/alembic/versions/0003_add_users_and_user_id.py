"""Add users table and user_id columns

Revision ID: 0003
Revises: 0002
Create Date: 2026-03-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create users table
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("google_id", sa.String(256), nullable=False, unique=True),
        sa.Column("email", sa.String(256), nullable=False),
        sa.Column("name", sa.String(256), nullable=True),
        sa.Column("avatar_url", sa.String(2048), nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )

    # Add user_id to links
    op.add_column("links", sa.Column("user_id", sa.String(36), nullable=True))

    # Add user_id to user_profiles
    op.add_column("user_profiles", sa.Column("user_id", sa.String(36), nullable=True))

    # Add user_id to categories, drop old unique constraint, add composite unique
    op.add_column("categories", sa.Column("user_id", sa.String(36), nullable=True))
    op.drop_constraint("categories_name_key", "categories", type_="unique")
    op.create_unique_constraint("uq_categories_name_user", "categories", ["name", "user_id"])


def downgrade() -> None:
    op.drop_constraint("uq_categories_name_user", "categories", type_="unique")
    op.create_unique_constraint("categories_name_key", "categories", ["name"])
    op.drop_column("categories", "user_id")
    op.drop_column("user_profiles", "user_id")
    op.drop_column("links", "user_id")
    op.drop_table("users")
