from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.modules.payment_methods.enums import PaymentMethodType


class PaymentMethod(Base):
    """Moyen de paiement déclaré par l'utilisateur.

    Seule une référence masquée (quatre derniers caractères) est conservée :
    aucun numéro de carte, IBAN ou code n'est jamais stocké par Ndjoka. Les
    données sensibles restent chez le prestataire de paiement.
    """

    __tablename__ = "payment_methods"
    __table_args__ = (
        CheckConstraint("type IN ('card', 'sepa', 'mobile_money')", name="type"),
        CheckConstraint(
            "char_length(btrim(label)) BETWEEN 2 AND 60", name="label_length"
        ),
        CheckConstraint("char_length(last4) = 4", name="last4_length"),
        Index("ix_payment_methods_user_created", "user_id", "created_at", "id"),
        Index(
            "uq_payment_methods_one_default",
            "user_id",
            unique=True,
            postgresql_where=text("is_default"),
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid, primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[PaymentMethodType] = mapped_column(
        Enum(
            PaymentMethodType,
            native_enum=False,
            create_constraint=False,
            validate_strings=True,
            values_callable=lambda values: [value.value for value in values],
            length=20,
        ),
        nullable=False,
    )
    label: Mapped[str] = mapped_column(String(60), nullable=False)
    last4: Mapped[str] = mapped_column(String(4), nullable=False)
    is_default: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
