"""Reading a resource project (the folder ``mt deploy`` reads) into a Build API request.

The layout, exactly as ``mt build`` / ``mt deploy`` read it (``maitento/app/ShellCorePlugin/Build/BuildBaseCommand.cs``):

=====================================================  =================================================
``agents/**/*.mtr``                                    ``agents``
``capsules/**/*.mtr``                                  ``capsules``
``looms/**/*.mtr``                                     ``looms``
``connectors/open-api/**/*.mtr``                       ``connectors.openApi``
``external-operations/open-api/**/*.mtr``              ``externalOperations.openApi``
``interactions/{one-shot,round-robin,managed}/**/*.mtr``  ``interactions.oneShot`` / ``roundRobin`` / ``managed``
``apps/<app>/**/*.mtc`` (+ at most one ``.mtr``)       ``apps`` (the ``.mtr`` is the app's metadata)
``code-pipelines/<name>/pipeline-definition.json``     ``codePipelines`` (``"@prompt(x)"``/``"@schema(x)"`` resolved)
``code-pipeline-hooks/<name>/**/*.mtc``                ``codePipelineHooks`` (``@promptJson``/``@schemaJson`` resolved)
``prompts/**/*.md``                                    ``resourceFiles.prompts`` (named by file stem)
``json/**/*.json``                                     ``resourceFiles.json`` (named by file stem)
=====================================================  =================================================

Each ``.mtr``/``.mtc`` is sent as its lines; its ``filename`` is the POSIX path below its kind's folder and its
``name`` the file stem. Nothing outside these folders is read.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path, PurePosixPath
from typing import Any, Callable, Dict, Iterable, List, Mapping, Tuple, Union

from ._generated.models import BuildRequest

__all__ = ["ProjectSource", "build_request", "project_request", "read_project"]

ProjectSource = Union[str, "os.PathLike[str]", Mapping[str, Union[str, bytes]], BuildRequest]
"""What ``deploy()``/``validate()`` take: a project folder, an in-memory ``{relative/posix/path: text}`` mapping, or a
ready :class:`BuildRequest`."""

_FOLDERS = (
    "agents",
    "apps",
    "capsules",
    "code-pipeline-hooks",
    "code-pipelines",
    "connectors",
    "external-operations",
    "interactions",
    "json",
    "looms",
    "prompts",
)
_EXTENSIONS = (".mtr", ".mtc", ".md", ".json")

_PROMPT_INCLUDE = re.compile(r'"@prompt\(([^)]+)\)"')
_SCHEMA_INCLUDE = re.compile(r'"@schema\(([^)]+)\)"')
_HOOK_PROMPT_INCLUDE = re.compile(r"@promptJson\(([^)]+)\)")
_HOOK_SCHEMA_INCLUDE = re.compile(r"@schemaJson\(([^)]+)\)")


def read_project(folder: Union[str, "os.PathLike[str]"]) -> Dict[str, str]:
    """Every ``.mtr``/``.mtc``/``.md``/``.json`` file under the project's resource folders, keyed by its POSIX path
    relative to ``folder``."""
    root = Path(folder)
    if not root.is_dir():
        raise FileNotFoundError(f"{folder} is not a directory")
    files: Dict[str, str] = {}
    for top in _FOLDERS:
        base = root / top
        if not base.is_dir():
            continue
        for current, directories, names in os.walk(base):
            directories.sort()
            for name in sorted(names):
                if name.lower().endswith(_EXTENSIONS):
                    full = Path(current) / name
                    # Bytes, not read_text(): line endings are kept as written (as `mt` reads them).
                    files[full.relative_to(root).as_posix()] = full.read_bytes().decode("utf-8-sig")
    return files


def _normalise(files: Mapping[str, Union[str, bytes]]) -> Dict[str, str]:
    result: Dict[str, str] = {}
    for key, value in files.items():
        posix = PurePosixPath(key.replace("\\", "/"))
        if posix.is_absolute() or ".." in posix.parts:
            raise ValueError(f"project paths must be relative and stay inside the project: {key!r}")
        text = value.decode("utf-8-sig") if isinstance(value, (bytes, bytearray)) else value
        result[str(posix)] = text
    return result


def _lines(text: str) -> List[str]:
    return re.split(r"\r\n|\n", text)


def _stem(path: str) -> str:
    return PurePosixPath(path).stem


def _under(files: Mapping[str, str], prefix: str, extension: str) -> Iterable[Tuple[str, str]]:
    """``(path below prefix, text)`` of every file under ``prefix`` with ``extension``, in path order."""
    for key in sorted(files):
        if key.startswith(prefix) and key.lower().endswith(extension):
            yield key[len(prefix) :], files[key]


def _folders(files: Mapping[str, str], prefix: str) -> List[str]:
    """The immediate sub-folder names under ``prefix``."""
    names = {key[len(prefix) :].split("/", 1)[0] for key in files if key.startswith(prefix) and "/" in key[len(prefix) :]}
    return sorted(names)


def _items(files: Mapping[str, str], prefix: str) -> List[Dict[str, Any]]:
    return [
        {"name": _stem(relative), "filename": relative, "lines": _lines(text)}
        for relative, text in _under(files, prefix, ".mtr")
    ]


def _replace(source: str, pattern: "re.Pattern[str]", resolve: Callable[[str], str]) -> str:
    return pattern.sub(lambda match: resolve(match.group(1)), source)


def _resolve_pipeline_includes(source: str, files: Mapping[str, str], folder: str) -> str:
    def prompt(name: str) -> str:
        key = f"{folder}prompts/{name}.md"
        if key not in files:
            raise ValueError(f"@prompt reference not found: {key}")
        return json.dumps(files[key])

    def schema(name: str) -> str:
        key = f"{folder}{name}.schema.json"
        if key not in files:
            raise ValueError(f"@schema reference not found: {key}")
        return json.dumps(files[key])

    return _replace(_replace(source, _PROMPT_INCLUDE, prompt), _SCHEMA_INCLUDE, schema)


def _escape_for_hook_literal(content: str) -> str:
    """JSON-escaped without the quotes, a quote as \\u0022 (as the C# SDK writes it: \\" would become \\\\" below and
    end the literal), then every backslash doubled (the Cogniscript assembler unescapes literals)."""
    return json.dumps(content)[1:-1].replace('\\"', "\\u0022").replace("\\", "\\\\")


def _resolve_hook_includes(source: str, files: Mapping[str, str], hook: str) -> str:
    def asset(token: str, is_schema: bool) -> str:
        directive = "schemaJson" if is_schema else "promptJson"
        pipeline, sep, name = token.partition("/")
        if not sep or not pipeline or not name:
            raise ValueError(f"hook {hook!r}: @{directive}({token!r}) must be '<pipeline>/<asset>'")
        for segment in (pipeline, name):
            if ".." in segment or "/" in segment or "\\" in segment:
                raise ValueError(f"hook {hook!r}: @{directive}({token!r}) must name a single pipeline and asset")
        key = (
            f"code-pipelines/{pipeline}/{name}.schema.json"
            if is_schema
            else f"code-pipelines/{pipeline}/prompts/{name}.md"
        )
        if key not in files:
            raise ValueError(f"hook {hook!r}: @{directive} reference not found: {key}")
        return _escape_for_hook_literal(files[key])

    source = _replace(source, _HOOK_PROMPT_INCLUDE, lambda token: asset(token, False))
    return _replace(source, _HOOK_SCHEMA_INCLUDE, lambda token: asset(token, True))


def build_request(files: Mapping[str, Union[str, bytes]], *, is_deploy: bool) -> BuildRequest:
    """The Build API request for a project given as ``{relative/posix/path: text}``."""
    tree = _normalise(files)
    request: Dict[str, Any] = {
        "isDeploy": is_deploy,
        "agents": _items(tree, "agents/"),
        "capsules": _items(tree, "capsules/"),
        "connectors": {"openApi": _items(tree, "connectors/open-api/"), "modelContextProtocol": []},
        "externalOperations": {"openApi": _items(tree, "external-operations/open-api/"), "modelContextProtocol": []},
        "interactions": {
            "oneShot": _items(tree, "interactions/one-shot/"),
            "roundRobin": _items(tree, "interactions/round-robin/"),
            "managed": _items(tree, "interactions/managed/"),
        },
        "apps": [],
        "codePipelines": [],
        "looms": _items(tree, "looms/"),
        "resourceFiles": {
            "prompts": [{"name": _stem(p), "content": text} for p, text in _under(tree, "prompts/", ".md")],
            "json": [{"name": _stem(p), "content": text} for p, text in _under(tree, "json/", ".json")],
        },
    }

    for pipeline in _folders(tree, "code-pipelines/"):
        folder = f"code-pipelines/{pipeline}/"
        definition = tree.get(f"{folder}pipeline-definition.json")
        if definition is None:
            continue
        request["codePipelines"].append(
            {
                "name": pipeline,
                "filename": f"{folder}pipeline-definition.json",
                "json": _resolve_pipeline_includes(definition, tree, folder),
            }
        )

    hooks: Dict[str, Any] = {}
    for hook in _folders(tree, "code-pipeline-hooks/"):
        code = [
            {"filename": relative, "lines": _lines(_resolve_hook_includes(text, tree, hook))}
            for relative, text in _under(tree, f"code-pipeline-hooks/{hook}/", ".mtc")
        ]
        if code:
            hooks[hook] = {"name": hook, "code": code}
    if hooks:
        request["codePipelineHooks"] = hooks

    for app in _folders(tree, "apps/"):
        folder = f"apps/{app}/"
        code = [{"filename": relative, "lines": _lines(text)} for relative, text in _under(tree, folder, ".mtc")]
        if not code:
            continue
        metadata = list(_under(tree, folder, ".mtr"))
        if len(metadata) > 1:
            raise ValueError(f"App {app!r} has more than one .mtr file; an app has at most one.")
        item: Dict[str, Any] = {"name": app, "code": code}
        if metadata:
            item["metadata"] = {"filename": f"{app}.mtr", "lines": _lines(metadata[0][1])}
        request["apps"].append(item)

    counts = (
        len(request["agents"]) + len(request["capsules"]) + len(request["looms"]) + len(request["apps"])
        + len(request["codePipelines"]) + len(hooks)
        + len(request["connectors"]["openApi"]) + len(request["externalOperations"]["openApi"])
        + sum(len(items) for items in request["interactions"].values())
    )
    if counts == 0:
        raise ValueError(
            "Nothing to build: no agents/, interactions/, apps/, connectors/, external-operations/, capsules/, looms/, "
            "code-pipelines/ or code-pipeline-hooks/ resources were found."
        )
    return BuildRequest.model_validate(request)


def project_request(source: ProjectSource, *, is_deploy: bool) -> BuildRequest:
    """``build_request`` for any :data:`ProjectSource`."""
    if isinstance(source, BuildRequest):
        return source.model_copy(update={"is_deploy": is_deploy})
    if isinstance(source, Mapping):
        return build_request(source, is_deploy=is_deploy)
    if isinstance(source, (str, os.PathLike)):
        return build_request(read_project(source), is_deploy=is_deploy)
    raise TypeError(f"Cannot deploy a {type(source).__name__}: pass a folder path, a mapping of files or a BuildRequest.")
