"""Barème de commission Ndjoka (modèle économique retenu).

La commission est calculée sur chaque cotisation puis déduite du pot versé au
bénéficiaire : les membres ne paient jamais plus que leur cotisation. Un
sixième de chaque commission alimente le fonds de solidarité.
"""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")
TIER_ONE_MAX = Decimal("100")
TIER_TWO_MAX = Decimal("300")
TIER_ONE_RATE = Decimal("0.03")
TIER_TWO_RATE = Decimal("0.02")
TIER_TWO_MINIMUM = Decimal("3.00")
TIER_THREE_RATE = Decimal("0.01")
TIER_THREE_MINIMUM = Decimal("6.00")
TIER_THREE_CAP = Decimal("10.00")
SOLIDARITY_SHARE = Decimal("1") / Decimal("6")
CARD_LIMIT = TIER_TWO_MAX

FEE_TIERS = (
    {"label": "Jusqu'à 100 €", "rate": "3 %", "minimum": None, "cap": None},
    {"label": "De 101 € à 300 €", "rate": "2 %", "minimum": "3 €", "cap": None},
    {"label": "Plus de 300 €", "rate": "1 %", "minimum": "6 €", "cap": "10 €"},
)


def _money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def commission_per_contribution(amount: Decimal) -> Decimal:
    """Commission Ndjoka retenue sur une cotisation donnée."""
    if amount <= 0:
        return Decimal("0.00")
    if amount <= TIER_ONE_MAX:
        return _money(amount * TIER_ONE_RATE)
    if amount <= TIER_TWO_MAX:
        return _money(max(amount * TIER_TWO_RATE, TIER_TWO_MINIMUM))
    return _money(
        min(max(amount * TIER_THREE_RATE, TIER_THREE_MINIMUM), TIER_THREE_CAP)
    )


def allowed_payment_methods(amount: Decimal) -> list[str]:
    """Au-delà de 300 €, seul le prélèvement SEPA est proposé."""
    return ["card", "sepa"] if amount <= CARD_LIMIT else ["sepa"]


@dataclass(frozen=True)
class FeeQuote:
    contribution_amount: Decimal
    members: int
    gross_amount: Decimal
    fee_per_contribution: Decimal
    fee_total: Decimal
    effective_rate: Decimal
    solidarity_fund_share: Decimal
    platform_share: Decimal
    net_amount: Decimal
    payment_methods: list[str]


def quote(contribution_amount: Decimal, members: int) -> FeeQuote:
    """Détailler un tour : pot brut, frais, part solidarité et montant net."""
    members = max(int(members), 0)
    fee_unit = commission_per_contribution(contribution_amount)
    gross = _money(contribution_amount * members)
    fee_total = _money(fee_unit * members)
    solidarity = _money(fee_total * SOLIDARITY_SHARE)
    rate = (
        (fee_total / gross).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
        if gross > 0
        else Decimal("0.0000")
    )
    return FeeQuote(
        contribution_amount=_money(contribution_amount),
        members=members,
        gross_amount=gross,
        fee_per_contribution=fee_unit,
        fee_total=fee_total,
        effective_rate=rate,
        solidarity_fund_share=solidarity,
        platform_share=_money(fee_total - solidarity),
        net_amount=_money(gross - fee_total),
        payment_methods=allowed_payment_methods(contribution_amount),
    )


def quote_from_gross(gross_amount: Decimal, contribution_amount: Decimal) -> FeeQuote:
    """Reconstituer un devis à partir du pot brut d'un tour existant."""
    if contribution_amount <= 0:
        return quote(Decimal("0"), 0)
    members = int((gross_amount / contribution_amount).to_integral_value(ROUND_HALF_UP))
    return quote(contribution_amount, members)
