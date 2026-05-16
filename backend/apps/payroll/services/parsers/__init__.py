"""Payslip parser registry.

Concrete parsers self-register at import time. The view layer asks the
registry for ``get_default_parser()`` and the registry returns whichever
implementation is currently configured via Django settings
(``PAYSLIP_PARSER``, default ``"regex-es"``).

Add a new parser:

    1. Create ``parsers/<name>.py`` implementing :class:`PayslipParser`.
    2. Call ``register(MyParser())`` at the bottom of the module.
    3. Import it from this file so it self-registers on app start.
    4. (Optional) Set ``PAYSLIP_PARSER=<name>`` in environment/settings
       to make it the default. Existing parsers stay registered and can
       be selected by name from tests.

No edits to the view, the regex parser, or the tests are required.
"""

from django.conf import settings

from .base import PayslipParser, PayslipParseResult

_REGISTRY: dict[str, PayslipParser] = {}

# Built-in default — keep in sync with ``settings.PAYSLIP_PARSER``'s
# fallback. The setting wins when set; this constant only matters if
# the setting is missing.
BUILTIN_DEFAULT = "regex-es"


def register(parser: PayslipParser) -> None:
    """Register a parser under its ``name``. Re-registering replaces."""
    _REGISTRY[parser.name] = parser


def unregister(name: str) -> None:
    """Remove a parser from the registry (only used by tests to clean up)."""
    _REGISTRY.pop(name, None)


def get_parser(name: str) -> PayslipParser | None:
    """Return the parser registered under ``name``, or ``None``."""
    return _REGISTRY.get(name)


def get_default_parser() -> PayslipParser:
    """Return the parser configured via Django settings.

    Raises ``RuntimeError`` if the configured parser isn't registered —
    typically a misspelt ``PAYSLIP_PARSER`` value. We fail loudly so the
    operator notices immediately at boot rather than silently falling
    back to a different parser.
    """
    name = getattr(settings, "PAYSLIP_PARSER", BUILTIN_DEFAULT)
    parser = _REGISTRY.get(name)
    if parser is None:
        available = ", ".join(sorted(_REGISTRY)) or "(none)"
        raise RuntimeError(f"PAYSLIP_PARSER='{name}' is not registered. Available: {available}.")
    return parser


def list_parsers() -> list[str]:
    """All registered parser names, sorted."""
    return sorted(_REGISTRY)


# Built-in parsers are imported here so they self-register on app start.
# The import is at the bottom so ``register`` is fully defined first.
from . import regex_es  # noqa


__all__ = [
    "PayslipParser",
    "PayslipParseResult",
    "register",
    "unregister",
    "get_parser",
    "get_default_parser",
    "list_parsers",
    "BUILTIN_DEFAULT",
]
