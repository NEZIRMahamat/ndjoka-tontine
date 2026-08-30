from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth0 import get_current_token_payload
from app.db.session import get_db_session
from app.modules.users.models import User
from app.modules.users.services import get_or_create_user_by_auth0_sub
from app.schemas.auth import TokenPayload


async def get_current_ndjoka_user(
    token_payload: Annotated[TokenPayload, Depends(get_current_token_payload)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> User:
    """Relier l'identité Auth0 validée à son utilisateur Ndjoka local."""
    return await get_or_create_user_by_auth0_sub(session, token_payload.sub)
