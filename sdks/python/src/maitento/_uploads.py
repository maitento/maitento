"""Turning whatever a caller hands ``files.upload()`` into one multipart ``file`` part.

The server classifies a file by the part's own ``Content-Type``, so a good guess matters: it comes from the file
name, with a few common document types the platform's ``mimetypes`` tables may lack.
"""

from __future__ import annotations

import io
import mimetypes
import os
from typing import IO, Any, Optional, Tuple, Union

__all__ = ["FileInput", "multipart_file"]

FileInput = Union[
    bytes,
    bytearray,
    memoryview,
    str,
    "os.PathLike[str]",
    IO[bytes],
    Tuple[str, Any],
    Tuple[str, Any, Optional[str]],
]
"""A file for upload: raw bytes, a path (``str`` or ``Path``), a binary file object, or a ``(filename, content)`` /
``(filename, content, content_type)`` tuple whose content is any of the others."""

_EXTRA_TYPES = {
    ".md": "text/markdown",
    ".markdown": "text/markdown",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".json": "application/json",
    ".pdf": "application/pdf",
    ".html": "text/html",
    ".htm": "text/html",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}


def guess_content_type(filename: str) -> str:
    extension = os.path.splitext(filename)[1].lower()
    if extension in _EXTRA_TYPES:
        return _EXTRA_TYPES[extension]
    guessed, _ = mimetypes.guess_type(filename)
    return guessed or "application/octet-stream"


def _read(content: Any) -> Tuple[bytes, Optional[str]]:
    """The bytes of ``content`` and the file name it carries, if any."""
    if isinstance(content, (bytes, bytearray, memoryview)):
        return bytes(content), None
    if isinstance(content, (str, os.PathLike)):
        file_path = os.fspath(content)
        with open(file_path, "rb") as handle:
            return handle.read(), os.path.basename(file_path)
    if isinstance(content, io.TextIOBase):
        raise TypeError("Open the file in binary mode ('rb') to upload it.")
    read = getattr(content, "read", None)
    if callable(read):
        data = read()
        if isinstance(data, str):
            raise TypeError("Open the file in binary mode ('rb') to upload it.")
        name = getattr(content, "name", None)
        return bytes(data), os.path.basename(name) if isinstance(name, str) else None
    raise TypeError(f"Cannot upload a {type(content).__name__}: pass bytes, a path or a binary file object.")


def multipart_file(
    file: FileInput, *, filename: Optional[str] = None, content_type: Optional[str] = None
) -> Tuple[str, bytes, str]:
    """``(filename, bytes, content_type)`` for httpx's ``files={"file": ...}``."""
    tuple_type: Optional[str] = None
    if isinstance(file, tuple):
        if len(file) not in (2, 3):
            raise TypeError("A file tuple is (filename, content) or (filename, content, content_type).")
        filename = filename or str(file[0])
        if len(file) == 3:
            tuple_type = file[2]
        file = file[1]
    data, own_name = _read(file)
    name = filename or own_name or "upload"
    return name, data, content_type or tuple_type or guess_content_type(name)
