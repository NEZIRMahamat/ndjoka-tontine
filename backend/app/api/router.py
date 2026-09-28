from fastapi import APIRouter

from app.ai.router import router as ai_router
from app.api.routes import admin_users, health, me, webhooks
from app.modules.audit.routes import router as audit_router
from app.modules.contributions.routes import router as contributions_router
from app.modules.cycles.routes import router as cycles_router
from app.modules.discovery.routes import router as discovery_router
from app.modules.fees.routes import router as fees_router
from app.modules.memberships.routes import router as memberships_router
from app.modules.notifications.routes import router as notifications_router
from app.modules.payment_methods.routes import router as payment_methods_router
from app.modules.payouts.routes import router as payouts_router
from app.modules.profiles.routes import router as profiles_router
from app.modules.tontines.routes import router as tontines_router

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(me.router)
api_router.include_router(profiles_router)
api_router.include_router(payment_methods_router)
api_router.include_router(fees_router)
api_router.include_router(admin_users.router)
api_router.include_router(tontines_router)
api_router.include_router(discovery_router)
api_router.include_router(memberships_router)
api_router.include_router(cycles_router)
api_router.include_router(contributions_router)
api_router.include_router(payouts_router)
api_router.include_router(audit_router)
api_router.include_router(notifications_router)
api_router.include_router(webhooks.router)
api_router.include_router(ai_router)
