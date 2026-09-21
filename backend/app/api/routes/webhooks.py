from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import EmailSettings, get_email_settings
from app.db.session import get_db_session
from app.modules.notifications.service import NotificationError, process_resend_webhook

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
Session = Annotated[AsyncSession, Depends(get_db_session)]
EmailConfig = Annotated[EmailSettings, Depends(get_email_settings)]


@router.post("/resend", status_code=200, summary="Recevoir les statuts Resend")
async def resend_webhook(
    request: Request, session: Session, settings: EmailConfig
) -> dict[str, bool]:
    secret = settings.resend_webhook_secret.get_secret_value()
    if not secret:
        raise HTTPException(503, "Webhook Resend non configuré")
    headers = {
        name: request.headers.get(name, "")
        for name in ("svix-id", "svix-timestamp", "svix-signature")
    }
    if not all(headers.values()):
        raise HTTPException(400, "En-têtes de signature Resend manquants")
    try:
        processed = await process_resend_webhook(
            session, await request.body(), headers, secret
        )
    except NotificationError as error:
        raise HTTPException(error.status_code, error.detail) from error
    return {"processed": processed}
