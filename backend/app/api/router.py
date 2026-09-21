from fastapi import APIRouter

from app.api.routes import admin_users, health, me, webhooks
from app.modules.audit.routes import router as audit_router
from app.modules.contributions.routes import router as contributions_router
from app.modules.cycles.routes import router as cycles_router
from app.modules.memberships.routes import router as memberships_router
from app.modules.notifications.routes import router as notifications_router
from app.modules.payouts.routes import router as payouts_router
from app.modules.tontines.routes import router as tontines_router

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(me.router)
api_router.include_router(admin_users.router)
api_router.include_router(tontines_router)
api_router.include_router(memberships_router)
api_router.include_router(cycles_router)
api_router.include_router(contributions_router)
api_router.include_router(payouts_router)
api_router.include_router(audit_router)
api_router.include_router(notifications_router)
api_router.include_router(webhooks.router)
