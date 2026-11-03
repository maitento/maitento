"""Every Maitento wire model (generated from the server's contract), plus the runtime helpers they use.

Models keep unknown fields (the server may grow), use snake_case attributes with camelCase aliases, parse dates with
up to 7 fractional digits, carry .NET ``TimeSpan`` values as ``timedelta``, and keep unknown enum values as strings.
"""

from ._generated._runtime import (
    UnknownWireModel,
    WireEnum,
    WireModel,
    format_dotnet_timespan,
    parse_dotnet_timespan,
    to_wire,
)
from ._generated.models import *  # noqa: F401,F403
from ._generated.models import __all__ as _generated_all

__all__ = [
    *_generated_all,
    "UnknownWireModel",
    "WireEnum",
    "WireModel",
    "format_dotnet_timespan",
    "parse_dotnet_timespan",
    "to_wire",
]
