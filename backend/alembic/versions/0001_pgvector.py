"""enable pgvector extension

Revision ID: 0001_pgvector
Revises: 
Create Date: 2026-03-09
"""

from alembic import op

# revision identifiers
revision = "0001_pgvector"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS vector")
