from decimal import Decimal

import pytest

from app.modules.fees import pricing


@pytest.mark.parametrize(
    ("amount", "expected"),
    [
        (Decimal("50"), Decimal("1.50")),
        (Decimal("100"), Decimal("3.00")),
        (Decimal("101"), Decimal("3.00")),
        (Decimal("200"), Decimal("4.00")),
        (Decimal("300"), Decimal("6.00")),
        (Decimal("301"), Decimal("6.00")),
        (Decimal("500"), Decimal("6.00")),
        (Decimal("1000"), Decimal("10.00")),
        (Decimal("5000"), Decimal("10.00")),
    ],
)
def test_commission_follows_degressive_schedule(amount, expected):
    assert pricing.commission_per_contribution(amount) == expected


def test_higher_contribution_never_costs_less():
    previous = Decimal("0")
    for cents in range(100, 200_000, 137):
        fee = pricing.commission_per_contribution(Decimal(cents) / 100)
        assert fee >= previous
        previous = fee


@pytest.mark.parametrize(
    ("amount", "members", "fee_total", "net"),
    [
        (Decimal("100"), 12, Decimal("36.00"), Decimal("1164.00")),
        (Decimal("200"), 12, Decimal("48.00"), Decimal("2352.00")),
        (Decimal("500"), 10, Decimal("60.00"), Decimal("4940.00")),
        (Decimal("1000"), 10, Decimal("100.00"), Decimal("9900.00")),
    ],
)
def test_turn_quote_matches_business_model_examples(amount, members, fee_total, net):
    quote = pricing.quote(amount, members)
    assert quote.fee_total == fee_total
    assert quote.net_amount == net
    assert quote.solidarity_fund_share == (fee_total / 6).quantize(Decimal("0.01"))
    assert quote.platform_share + quote.solidarity_fund_share == fee_total


def test_payment_methods_restricted_above_card_limit():
    assert pricing.allowed_payment_methods(Decimal("300")) == ["card", "sepa"]
    assert pricing.allowed_payment_methods(Decimal("300.01")) == ["sepa"]


def test_quote_from_gross_recovers_member_count():
    quote = pricing.quote_from_gross(Decimal("1200.00"), Decimal("100.00"))
    assert quote.members == 12
    assert quote.net_amount == Decimal("1164.00")
    assert pricing.quote_from_gross(Decimal("0"), Decimal("0")).members == 0
