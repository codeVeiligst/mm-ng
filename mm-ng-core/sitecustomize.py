"""Runtime compatibility shims for dependencies used by mm-ng-core."""

import sys
import types
import typing


def _install_typing_submodule(name, attrs):
    module_name = "typing.{}".format(name)
    if module_name in sys.modules:
        return

    module = types.ModuleType(module_name)
    for attr_name, value in attrs.items():
        setattr(module, attr_name, value)
    sys.modules[module_name] = module


_install_typing_submodule(
    "io",
    {
        "BinaryIO": typing.BinaryIO,
        "TextIO": typing.TextIO,
    },
)
_install_typing_submodule(
    "re",
    {
        "Match": typing.Match,
        "Pattern": typing.Pattern,
    },
)
