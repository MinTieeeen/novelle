"""`lab serve`: the topic reports with editable comments, AI suggestions and saving into NOTES.md.

A report opened as a file is read-only: a static page can neither call Gemini (the API key stays on
the machine) nor write NOTES.md. This small local server renders the same report and adds a JSON API:

    GET  /                       list of topics
    GET  /topic/<id>             the report of a topic, rebuilt from the newest results on every request
    GET  /results/<path>         raw evidence files (execution plans) linked from the report
    POST /api/suggest            {topic, id, draft}  -> {text, model}     suggestion for one comment
    POST /api/notes              {topic, comments}   -> {notes, report}   writes NOTES.md, rebuilds latest.html

Every POST needs the header X-Lab-Token with the random token of this server start, which is only put
into pages the server itself returns: another website open in the browser cannot write files through it.
AI commentary shown on the pages comes from the cache only (`lab report` creates it); only the suggestion
button calls the API.
"""
from __future__ import annotations

import json
import mimetypes
import secrets
from dataclasses import dataclass
from html import escape
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable
from urllib.parse import unquote, urlsplit

from lab.config import LabConfig
from lab.report import builder, notes
from lab.report.loader import LoadedReport, load_topic_reports

MAX_BODY_BYTES = 1_000_000
TOKEN_HEADER = "X-Lab-Token"
TOKEN_META = '<meta name="lab-token" content="{token}">\n<meta name="lab-topic" content="{topic}">\n'


class ApiError(Exception):
    def __init__(self, status: HTTPStatus, message: str):
        super().__init__(message)
        self.status = status


@dataclass
class LabApp:
    """Everything the request handler needs. `folders` maps topic id -> topic folder."""
    cfg: LabConfig
    folders: dict[str, Path]
    results_dir: Path
    token: str
    suggest: Callable[[LoadedReport, str, str], Any] | None = None   # (report, comment id, draft) -> Suggestion

    def load(self, topic_id: str) -> LoadedReport:
        if topic_id not in self.folders:
            raise ApiError(HTTPStatus.NOT_FOUND, f"unknown topic '{topic_id}'")
        found = load_topic_reports(self.results_dir, target=self.cfg.target, topics_filter={topic_id})
        if not found:
            raise ApiError(HTTPStatus.NOT_FOUND,
                           f"no results for '{topic_id}' with target {self.cfg.target}: run `lab run {topic_id}`")
        return found[0]

    def _commentary(self, loaded: LoadedReport) -> tuple[dict | None, str]:
        llm = self.cfg.llm
        if not llm.enabled:
            return None, f"chưa đặt {llm.env_keys().api_key} trong novelle/.env"
        from lab.llm.clients import client_for
        res = client_for(llm).generate([loaded.topic], loaded.result.environment, loaded.results_dir, llm,
                                       cache_only=True)
        return res.commentary, "" if res.commentary else "chạy `lab report` để tạo nhận xét AI"

    def page(self, topic_id: str) -> str:
        loaded = self.load(topic_id)
        folder = self.folders[topic_id]
        commentary, note = self._commentary(loaded)
        notes_path = folder / builder.NOTES_NAME
        html = builder.render(loaded, folder / builder.REPORTS_SUBDIR / builder.LATEST_NAME, commentary, {}, note,
                              notes_path.read_text(encoding="utf-8") if notes_path.is_file() else None)
        meta = TOKEN_META.format(token=self.token, topic=escape(topic_id))
        return html.replace("</head>", meta + "</head>", 1)

    def save_notes(self, topic_id: str, comments: Any) -> dict[str, str]:
        if not isinstance(comments, dict):
            raise ApiError(HTTPStatus.BAD_REQUEST, "comments must be an object {id: text}")
        loaded = self.load(topic_id)
        try:
            clean = notes.validate(loaded.topic, comments, self.cfg.serve.max_comment_chars)
        except ValueError as exc:
            raise ApiError(HTTPStatus.BAD_REQUEST, str(exc)) from exc
        folder = self.folders[topic_id]
        notes.save_comments(folder / builder.NOTES_NAME, loaded.topic, clean)
        commentary, note = self._commentary(loaded)
        report = builder.build(loaded, folder, commentary, {}, note)
        base = folder.parent.parent
        return {"notes": (folder / builder.NOTES_NAME).relative_to(base).as_posix(),
                "report": report.relative_to(base).as_posix(), "saved": str(sum(1 for v in clean.values() if v))}

    def suggest_comment(self, topic_id: str, comment_id: str, draft: Any) -> dict[str, str]:
        if not isinstance(comment_id, str) or not isinstance(draft, str):
            raise ApiError(HTTPStatus.BAD_REQUEST, "id and draft must be text")
        if not self.cfg.llm.enabled:
            raise ApiError(HTTPStatus.SERVICE_UNAVAILABLE,
                           f"chưa đặt {self.cfg.llm.env_keys().api_key} trong novelle/.env")
        loaded = self.load(topic_id)
        try:
            result = (self.suggest or _default_suggest(self.cfg))(loaded, comment_id, draft)
        except ValueError as exc:
            raise ApiError(HTTPStatus.BAD_REQUEST, str(exc)) from exc
        except RuntimeError as exc:
            raise ApiError(HTTPStatus.BAD_GATEWAY, str(exc)) from exc
        return {"text": result.text, "model": result.model}

    def index(self) -> str:
        items = "".join(f'<li><a href="/topic/{escape(t)}">{escape(t)}</a> <code>{escape(f.name)}</code></li>'
                        for t, f in sorted(self.folders.items(), key=lambda kv: kv[1].name))
        return (f"<!doctype html><meta charset='utf-8'><title>Novelle DBMS Lab</title>"
                f"<body style='font:15px system-ui;margin:32px'><h1>Novelle DBMS Lab</h1>"
                f"<p>Redis target <b>{escape(self.cfg.target)}</b>. Chọn topic để xem report và nhập nhận xét:</p>"
                f"<ul>{items}</ul></body>")


def _default_suggest(cfg: LabConfig) -> Callable[[LoadedReport, str, str], Any]:
    from lab.llm.clients import client_for

    def run(loaded: LoadedReport, comment_id: str, draft: str):
        return client_for(cfg.llm).suggest_comment(loaded.topic, loaded.result.environment, loaded.results_dir,
                                                   cfg.llm, comment_id, draft)
    return run


def make_handler(app: LabApp) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        server_version = "NovelleLab"

        def log_message(self, fmt: str, *args: Any) -> None:     # quiet: one line per request is enough
            print(f"  {self.command} {self.path} -> {args[1] if len(args) > 1 else ''}")

        def _send(self, status: HTTPStatus, body: bytes, content_type: str) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(body)

        def _json(self, status: HTTPStatus, data: dict) -> None:
            self._send(status, json.dumps(data, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

        def _html(self, html: str) -> None:
            self._send(HTTPStatus.OK, html.encode("utf-8"), "text/html; charset=utf-8")

        def do_GET(self) -> None:   # noqa: N802 (http.server naming)
            path = unquote(urlsplit(self.path).path)
            try:
                if path in ("/", "/index.html"):
                    return self._html(app.index())
                if path.startswith("/topic/"):
                    return self._html(app.page(path.removeprefix("/topic/").strip("/")))
                if path.startswith("/results/"):
                    target = (app.results_dir / path.removeprefix("/results/")).resolve()
                    if app.results_dir.resolve() not in target.parents or not target.is_file():
                        raise ApiError(HTTPStatus.NOT_FOUND, "not found")
                    kind = mimetypes.guess_type(target.name)[0] or "text/plain; charset=utf-8"
                    return self._send(HTTPStatus.OK, target.read_bytes(), kind)
                raise ApiError(HTTPStatus.NOT_FOUND, "not found")
            except ApiError as exc:
                self._send(exc.status, escape(str(exc)).encode("utf-8"), "text/plain; charset=utf-8")

        def do_POST(self) -> None:  # noqa: N802
            path = urlsplit(self.path).path
            try:
                if not secrets.compare_digest(self.headers.get(TOKEN_HEADER, ""), app.token):
                    raise ApiError(HTTPStatus.FORBIDDEN, "missing or wrong token: reload the page")
                length = int(self.headers.get("Content-Length") or 0)
                if length <= 0 or length > MAX_BODY_BYTES:
                    raise ApiError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "empty or too large request")
                try:
                    body = json.loads(self.rfile.read(length).decode("utf-8"))
                except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                    raise ApiError(HTTPStatus.BAD_REQUEST, "body must be JSON") from exc
                if not isinstance(body, dict) or not isinstance(body.get("topic"), str):
                    raise ApiError(HTTPStatus.BAD_REQUEST, "body must be an object with a topic")
                if path == "/api/notes":
                    return self._json(HTTPStatus.OK, app.save_notes(body["topic"], body.get("comments")))
                if path == "/api/suggest":
                    return self._json(HTTPStatus.OK, app.suggest_comment(body["topic"], body.get("id"),
                                                                         body.get("draft", "")))
                raise ApiError(HTTPStatus.NOT_FOUND, "not found")
            except ApiError as exc:
                self._json(exc.status, {"error": str(exc)})

    return Handler


def make_server(app: LabApp, host: str, port: int) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer((host, port), make_handler(app))
    server.daemon_threads = True
    return server


def new_token() -> str:
    return secrets.token_urlsafe(24)
