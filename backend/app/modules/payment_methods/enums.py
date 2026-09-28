from enum import StrEnum


class PaymentMethodType(StrEnum):
    CARD = "card"
    SEPA = "sepa"
    MOBILE_MONEY = "mobile_money"
