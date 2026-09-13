"""API errors and LaTeX log parsing.

The parser turns raw latexmk/pdflatex output into a clickable error list:
line number + message. It handles both pdflatex's native form

    ! Undefined control sequence.
    l.123 \\badcommand

and the `-file-line-error` form `./main.tex:123: message`.
"""

from __future__ import annotations

import re


class ApiError(Exception):
    """Exception carrying an HTTP status code for route handlers."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


_FILE_LINE_RE = re.compile(r"^(?P<file>[\w./\\-]+\.tex):(?P<line>\d+):\s*(?P<msg>.*)$")
_LMARK_RE = re.compile(r"^l\.(?P<line>\d+)\b\s*(?P<rest>.*)$")
_ERRORISH = ("error", "undefined", "emergency stop", "not found", "missing", "illegal")


class ErrorParser:
    """Feed it raw output lines; read `.errors` when the process ends."""

    MAX_ERRORS = 200

    def __init__(self) -> None:
        self.errors: list[dict] = []
        self._pending: str | None = None

    def feed(self, line: str) -> None:
        stripped = line.strip()
        if not stripped:
            self._pending = None
            return

        m = _FILE_LINE_RE.match(stripped)
        if m and any(k in m.group("msg").lower() for k in _ERRORISH):
            self._add(int(m.group("line")), m.group("msg").strip(), line)
            return

        if stripped.startswith("!"):
            # pdflatex hard error; the source line usually follows as "l.NNN ..."
            self._pending = stripped.lstrip("!").strip()
            return

        if self._pending is not None:
            lm = _LMARK_RE.match(stripped)
            if lm:
                rest = lm.group("rest").strip()
                msg = f"{self._pending} {rest}".strip()
                self._add(int(lm.group("line")), msg, line)
            self._pending = None

    def _add(self, line_no: int, message: str, raw: str) -> None:
        if len(self.errors) >= self.MAX_ERRORS:
            return
        if (
            self.errors
            and self.errors[-1]["line"] == line_no
            and self.errors[-1]["message"] == message
        ):
            return
        self.errors.append({"line": line_no, "message": message, "raw": raw.rstrip()})