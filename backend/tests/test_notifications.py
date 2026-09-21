import asyncio
import json
from datetime import UTC, datetime
from uuid import uuid4

import httpx
import pytest
from pydantic import ValidationError

from app.core.config import EmailSettings
from app.modules.notifications import email as email_module
from app.modules.notifications.email import (
    EmailMessage,
    EmailProviderError,
    FakeEmailProvider,
    ResendEmailProvider,
    render_template,
)
from app.modules.notifications.schemas import decode_cursor, encode_cursor
from app.modules.notifications.service import (
    EVENT_TEMPLATES,
    NotificationError,
    _validate_payload,
    sender_for_event,
)


def test_every_mvp_template_renders_text_and_html() -> None:
    context = {
        "tontine_name": "Famille <Ndjoka>",
        "role": "manager",
        "amount": "20.00",
        "currency": "EUR",
        "due_at": "2026-09-25",
        "action_url": "https://app.ndjoka-tontine.com/tontines/1",
    }
    for name in EVENT_TEMPLATES.values():
        subject, plain, markup = render_template(name, context)
        assert subject and plain and markup
        assert "Famille <Ndjoka>" in plain
        assert "Famille &lt;Ndjoka&gt;" in markup


def test_sensitive_payload_rejected_recursively() -> None:
    for key in ("resend_api_key", "authorization", "invitation-token", "iban"):
        with pytest.raises(NotificationError):
            _validate_payload({"nested": [{key: "sensitive"}]})


def test_notification_cursor_roundtrip_and_invalid() -> None:
    timestamp = datetime.now(UTC)
    item_id = uuid4()
    assert decode_cursor(encode_cursor(timestamp, item_id)) == (timestamp, item_id)
    with pytest.raises(ValueError, match="Curseur"):
        decode_cursor("invalid")


def test_resend_requires_key_but_console_does_not() -> None:
    EmailSettings(_env_file=None, email_provider="console", resend_api_key="")
    with pytest.raises(ValidationError):
        EmailSettings(_env_file=None, email_provider="resend", resend_api_key="")


def test_email_senders_by_event() -> None:
    settings = EmailSettings(_env_file=None)
    assert sender_for_event("invitation.created", settings) == (
        "contact@ndjoka-tontine.com"
    )
    for event in EVENT_TEMPLATES:
        if event != "invitation.created":
            assert sender_for_event(event, settings) == (
                "notifications@ndjoka-tontine.com"
            )


def test_missing_template_is_permanent_error() -> None:
    with pytest.raises(EmailProviderError) as exc:
        render_template("unknown", {})
    assert exc.value.temporary is False


def test_fake_provider_records_idempotency_key() -> None:
    provider = FakeEmailProvider()
    message = EmailMessage(to="test@example.test", subject="Test", text="a", html="b")
    result = asyncio.run(provider.send(message, idempotency_key="stable-key"))
    assert provider.sent == [(message, "stable-key")]
    assert result.provider_id


def test_resend_provider_sends_idempotency_header_without_logging_secret(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"id": "email_123"})

    original_client = httpx.AsyncClient

    def client_factory(**kwargs):
        return original_client(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(email_module.httpx, "AsyncClient", client_factory)
    settings = EmailSettings(
        _env_file=None, email_provider="resend", resend_api_key="re_test_secret"
    )
    message = EmailMessage(
        to="a@example.test",
        subject="Bonjour",
        text="Texte",
        html="<p>Texte</p>",
        from_address="contact@ndjoka-tontine.com",
    )
    result = asyncio.run(
        ResendEmailProvider(settings).send(message, idempotency_key="stable")
    )
    assert result.provider_id == "email_123"
    assert requests[0].headers["idempotency-key"] == "stable"
    assert requests[0].headers["authorization"] == "Bearer re_test_secret"
    assert requests[0].url == "https://api.resend.com/emails"
    assert json.loads(requests[0].content)["to"] == ["a@example.test"]
    assert json.loads(requests[0].content)["from"] == (
        "Ndjoka Tontine <contact@ndjoka-tontine.com>"
    )
    assert "reply_to" not in json.loads(requests[0].content)


@pytest.mark.parametrize("status, temporary", [(429, True), (503, True), (422, False)])
def test_resend_provider_classifies_errors(monkeypatch, status, temporary) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={"name": "test_error"})

    original_client = httpx.AsyncClient
    monkeypatch.setattr(
        email_module.httpx,
        "AsyncClient",
        lambda **kwargs: original_client(
            transport=httpx.MockTransport(handler), **kwargs
        ),
    )
    settings = EmailSettings(
        _env_file=None, email_provider="resend", resend_api_key="re_test_secret"
    )
    with pytest.raises(EmailProviderError) as exc:
        asyncio.run(
            ResendEmailProvider(settings).send(
                EmailMessage(to="a@example.test", subject="s", text="t", html="h"),
                idempotency_key="stable",
            )
        )
    assert exc.value.temporary is temporary
