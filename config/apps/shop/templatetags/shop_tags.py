from django import template


register = template.Library()


PERSIAN_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


@register.filter
def price(value):
    if value is None or value == "":
        return "—"
    try:
        formatted = f"{int(value):,}"
    except (TypeError, ValueError):
        return value
    return formatted.translate(PERSIAN_DIGITS)


@register.filter
def discount_percent(value):
    try:
        value = int(value)
    except (TypeError, ValueError):
        return ""
    if value <= 0:
        return ""
    return f"٪{value}".translate(PERSIAN_DIGITS)
