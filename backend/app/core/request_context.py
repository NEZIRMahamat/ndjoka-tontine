from contextvars import ContextVar
from uuid import UUID

request_id_context: ContextVar[UUID | None] = ContextVar("request_id", default=None)


def get_request_id() -> UUID | None:
    return request_id_context.get()
