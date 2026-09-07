from fastapi import APIRouter

from app.api.routes import admin_users, health, me
from app.modules.memberships.routes import router as memberships_router
from app.modules.tontines.routes import router as tontines_router

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(me.router)
api_router.include_router(admin_users.router)
api_router.include_router(tontines_router)
api_router.include_router(memberships_router)
