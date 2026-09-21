import hashlib
import html
from dataclasses import dataclass
from pathlib import Path
from string import Template
from typing import Protocol

import httpx

from app.core.config import EmailSettings

TEMPLATES_ROOT = Path(__file__).with_name("templates")
TEMPLATE_NAMES = frozenset(
    {
        "invitation_created",
        "membership_role_changed",
        "cycle_activated",
        "cycle_cancelled",
        "contribution_due",
        "contribution_rejected",
        "payout_declared_paid",
        "payout_disputed",
    }
)


@dataclass(frozen=True)
class EmailMessage:
    to: str
    subject: str
    text: str
    html: str
    from_address: str | None = None


@dataclass(frozen=True)
class EmailResult:
    provider_id: str


class EmailProviderError(Exception):
    def __init__(self, code: str, *, temporary: bool) -> None:
        self.code = code[:100]
        self.temporary = temporary
        super().__init__(self.code)


class EmailProvider(Protocol):
    async def send(
        self, message: EmailMessage, *, idempotency_key: str
    ) -> EmailResult: ...


def render_template(name: str, context: dict[str, object]) -> tuple[str, str, str]:
    if name not in TEMPLATE_NAMES:
        raise EmailProviderError("template_absent", temporary=False)
    directory = TEMPLATES_ROOT / name
    values = {key: str(value) for key, value in context.items()}
    html_values = {key: html.escape(value) for key, value in values.items()}
    try:
        subject = Template((directory / "subject.txt").read_text()).substitute(values)
        text = Template((directory / "body.txt").read_text()).substitute(values)
        html_body = Template((directory / "body.html").read_text()).substitute(
            html_values
        )
    except (OSError, KeyError, ValueError) as error:
        raise EmailProviderError("template_invalide", temporary=False) from error
    return subject.strip(), text.strip(), html_body.strip()


class ConsoleEmailProvider:
    async def send(self, message: EmailMessage, *, idempotency_key: str) -> EmailResult:
        del message
        digest = hashlib.sha256(idempotency_key.encode()).hexdigest()[:24]
        return EmailResult(provider_id=f"console_{digest}")


class FakeEmailProvider:
    def __init__(self) -> None:
        self.sent: list[tuple[EmailMessage, str]] = []

    async def send(self, message: EmailMessage, *, idempotency_key: str) -> EmailResult:
        self.sent.append((message, idempotency_key))
        return EmailResult(provider_id=f"fake_{len(self.sent)}")


class ResendEmailProvider:
    def __init__(self, settings: EmailSettings) -> None:
        self.settings = settings

    async def send(self, message: EmailMessage, *, idempotency_key: str) -> EmailResult:
        headers = {
            "Authorization": (
                f"Bearer {self.settings.resend_api_key.get_secret_value()}"
            ),
            "Idempotency-Key": idempotency_key,
        }
        payload = {
            "from": (
                f"{self.settings.email_from_name} "
                f"<{message.from_address or self.settings.email_from_address}>"
            ),
            "to": [message.to],
            "subject": message.subject,
            "text": message.text,
            "html": message.html,
        }
        if self.settings.email_reply_to:
            payload["reply_to"] = self.settings.email_reply_to
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(
                    "https://api.resend.com/emails", headers=headers, json=payload
                )
        except (httpx.TimeoutException, httpx.NetworkError) as error:
            raise EmailProviderError("network_error", temporary=True) from error
        if response.status_code >= 400:
            try:
                code = response.json().get("name") or response.json().get("code")
            except ValueError:
                code = None
            temporary = response.status_code in {408, 409, 429, 500, 502, 503, 504}
            raise EmailProviderError(
                str(code or f"http_{response.status_code}"), temporary=temporary
            )
        provider_id = response.json().get("id")
        if not provider_id:
            raise EmailProviderError("provider_response_invalid", temporary=False)
        return EmailResult(provider_id=str(provider_id))


def build_provider(settings: EmailSettings) -> EmailProvider:
    if settings.email_provider == "resend":
        return ResendEmailProvider(settings)
    return ConsoleEmailProvider()
