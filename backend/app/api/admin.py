"""
Admin DB Browser API — inspect tables and data (development / admin only).

GET  /api/admin/db/tables              → list all tables + row counts
GET  /api/admin/db/tables/{name}       → paginated rows + column info
GET  /api/admin/db/tables/{name}/schema → columns and their types
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import inspect as sa_inspect, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, async_engine
from app.core.deps import get_current_user
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)

router = APIRouter()


def _require_admin_or_teacher(current_user: User = Depends(get_current_user)) -> User:
    """Allow admins and teachers to browse the DB in development."""
    if current_user.role not in (UserRole.admin, UserRole.teacher):
        raise HTTPException(status_code=403, detail="Admin/teacher access required")
    return current_user


# ── Table list ────────────────────────────────────────────────────────

@router.get("/tables")
async def list_tables(
    _user: User = Depends(_require_admin_or_teacher),
) -> list[dict[str, Any]]:
    """Return all tables with row counts."""
    async with async_engine.connect() as conn:
        # Get table names from information_schema
        result = await conn.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public' "
                "ORDER BY table_name"
            )
        )
        table_names = [row[0] for row in result.fetchall()]

        tables = []
        for tname in table_names:
            try:
                count_result = await conn.execute(
                    text(f'SELECT COUNT(*) FROM "{tname}"')
                )
                row_count = count_result.scalar()
            except Exception:
                row_count = -1
            tables.append({"name": tname, "row_count": row_count})

    return tables


# ── Table schema ──────────────────────────────────────────────────────

@router.get("/tables/{table_name}/schema")
async def get_table_schema(
    table_name: str,
    _user: User = Depends(_require_admin_or_teacher),
) -> list[dict[str, Any]]:
    """Return column names and data types for a table."""
    async with async_engine.connect() as conn:
        result = await conn.execute(
            text(
                "SELECT column_name, data_type, is_nullable, column_default "
                "FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = :tname "
                "ORDER BY ordinal_position"
            ),
            {"tname": table_name},
        )
        rows = result.fetchall()

    if not rows:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")

    return [
        {
            "column": row[0],
            "type": row[1],
            "nullable": row[2] == "YES",
            "default": row[3],
        }
        for row in rows
    ]


# ── Table data ────────────────────────────────────────────────────────

@router.get("/tables/{table_name}/rows")
async def get_table_rows(
    table_name: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    search: str | None = Query(None),
    _user: User = Depends(_require_admin_or_teacher),
) -> dict[str, Any]:
    """Return paginated rows from a table."""
    # Validate table name — only allow alphanumeric + underscore to prevent injection
    import re
    if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", table_name):
        raise HTTPException(status_code=400, detail="Invalid table name")

    async with async_engine.connect() as conn:
        # Check table exists
        exists = await conn.execute(
            text(
                "SELECT 1 FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_name = :tname"
            ),
            {"tname": table_name},
        )
        if not exists.fetchone():
            raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")

        # Get columns
        col_result = await conn.execute(
            text(
                "SELECT column_name, data_type FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = :tname "
                "ORDER BY ordinal_position"
            ),
            {"tname": table_name},
        )
        columns = [{"name": r[0], "type": r[1]} for r in col_result.fetchall()]
        col_names = [c["name"] for c in columns]

        # Build query
        base_query = f'SELECT * FROM "{table_name}"'
        count_query = f'SELECT COUNT(*) FROM "{table_name}"'

        total = (await conn.execute(text(count_query))).scalar()

        rows_result = await conn.execute(
            text(f'{base_query} LIMIT :lim OFFSET :off'),
            {"lim": limit, "off": offset},
        )
        raw_rows = rows_result.fetchall()

        # Serialise rows (convert non-JSON-serialisable types to strings)
        rows = []
        for row in raw_rows:
            serialised = {}
            for col, val in zip(col_names, row):
                if val is None:
                    serialised[col] = None
                elif isinstance(val, (int, float, bool, str)):
                    serialised[col] = val
                else:
                    serialised[col] = str(val)
            rows.append(serialised)

    return {
        "table": table_name,
        "columns": columns,
        "rows": rows,
        "total": total,
        "limit": limit,
        "offset": offset,
    }
