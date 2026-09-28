from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.services import record
from app.modules.payment_methods.models import PaymentMethod
from app.modules.payment_methods.schemas import PaymentMethodCreate
from app.modules.users.models import User

MAX_METHODS_PER_USER = 5


class PaymentMethodError(Exception):
    def __init__(self, detail: str, status_code: int) -> None:
        self.detail = detail
        self.status_code = status_code
        super().__init__(detail)


async def list_methods(session: AsyncSession, actor: User) -> list[PaymentMethod]:
    rows = await session.scalars(
        select(PaymentMethod)
        .where(PaymentMethod.user_id == actor.id)
        .order_by(
            PaymentMethod.is_default.desc(), PaymentMethod.created_at, PaymentMethod.id
        )
    )
    return list(rows)


async def _find_owned(
    session: AsyncSession, actor: User, method_id: UUID, *, lock: bool = False
) -> PaymentMethod:
    statement = select(PaymentMethod).where(
        PaymentMethod.id == method_id, PaymentMethod.user_id == actor.id
    )
    if lock:
        statement = statement.with_for_update()
    item = await session.scalar(statement)
    if item is None:
        raise PaymentMethodError("Moyen de paiement introuvable", 404)
    return item


async def _clear_default(session: AsyncSession, user_id: UUID) -> None:
    await session.execute(
        update(PaymentMethod)
        .where(PaymentMethod.user_id == user_id, PaymentMethod.is_default.is_(True))
        .values(is_default=False)
    )


async def add_method(
    session: AsyncSession, actor: User, payload: PaymentMethodCreate
) -> PaymentMethod:
    try:
        count = await session.scalar(
            select(func.count())
            .select_from(PaymentMethod)
            .where(PaymentMethod.user_id == actor.id)
        )
        if int(count or 0) >= MAX_METHODS_PER_USER:
            raise PaymentMethodError(
                f"Au plus {MAX_METHODS_PER_USER} moyens de paiement", 409
            )
        make_default = payload.make_default or int(count or 0) == 0
        if make_default:
            await _clear_default(session, actor.id)
        item = PaymentMethod(
            user_id=actor.id,
            type=payload.type,
            label=payload.label,
            last4=payload.last4,
            is_default=make_default,
        )
        session.add(item)
        await session.flush()
        await record(
            session,
            event_name="payment_method.added",
            actor_user_id=actor.id,
            subject_user_id=actor.id,
            resource_type="payment_method",
            resource_id=item.id,
            changes={
                "type": {"to": item.type.value},
                "is_default": {"to": make_default},
            },
        )
        await session.commit()
        await session.refresh(item)
        return item
    except Exception:
        await session.rollback()
        raise


async def set_default(
    session: AsyncSession, actor: User, method_id: UUID
) -> PaymentMethod:
    try:
        item = await _find_owned(session, actor, method_id, lock=True)
        if not item.is_default:
            await _clear_default(session, actor.id)
            item.is_default = True
            await record(
                session,
                event_name="payment_method.default_changed",
                actor_user_id=actor.id,
                subject_user_id=actor.id,
                resource_type="payment_method",
                resource_id=item.id,
                changes={"is_default": {"from": False, "to": True}},
            )
        await session.commit()
        await session.refresh(item)
        return item
    except Exception:
        await session.rollback()
        raise


async def remove_method(session: AsyncSession, actor: User, method_id: UUID) -> None:
    try:
        item = await _find_owned(session, actor, method_id, lock=True)
        was_default = item.is_default
        await record(
            session,
            event_name="payment_method.removed",
            actor_user_id=actor.id,
            subject_user_id=actor.id,
            resource_type="payment_method",
            resource_id=item.id,
            changes={"type": {"from": item.type.value, "to": None}},
        )
        await session.delete(item)
        await session.flush()
        if was_default:
            replacement = await session.scalar(
                select(PaymentMethod)
                .where(PaymentMethod.user_id == actor.id)
                .order_by(PaymentMethod.created_at, PaymentMethod.id)
                .limit(1)
            )
            if replacement is not None:
                replacement.is_default = True
        await session.commit()
    except Exception:
        await session.rollback()
        raise
