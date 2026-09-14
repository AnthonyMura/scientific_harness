"""FastAPI application for the workbench sidecar.

Binds to 127.0.0.1 on an OS-assigned port; every /api/* request must carry
the shared token in the X-Workbench-Token header. The Electron shell spawns
this process, reads `PORT=<port>` from the first stdout line, and kills it
on exit (plan section 3).
"""

from __future__ import annotations

import gzip
import os
import secrets
import socket
import sys
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, Response

from . import __version__, compile_service, files, install, projects, state
from .errors import ApiError
from .jobs import JobRegistry


def create_app(token: str) -> FastAPI:
    app = FastAPI(title="workbench-backend", version=__version__)
    st = state.State()
    jobs = JobRegistry()
    compiles = compile_service.CompileService(st, jobs)

    @app.exception_handler(ApiError)
    async def api_error_handler(request: Request, exc: ApiError):
        return JSONResponse({"error": exc.message}, status_code=exc.status)

    @app.middleware("http")
    async def auth_middleware(request: Request, call_next):
        if request.url.path.startswith("/api/"):
            provided = request.headers.get("x-workbench-token", "")
            if not secrets.compare_digest(provided.encode(), token.encode()):
                return JSONResponse({"error": "unauthorized"}, status_code=401)
        return await call_next(request)

    # CORS: in dev mode the UI is served by Vite (http://127.0.0.1:5199) while
    # the sidecar listens on a different port, so cross-origin fetches need
    # this. Production serves the built UI same-origin, where it is inert; the
    # token check above still gates every /api/* request.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def _body_str(body: dict, key: str) -> str:
        v = body.get(key)
        if not isinstance(v, str) or not v.strip():
            raise ApiError(400, f"missing field: {key}")
        return v.strip()

    # --- meta -------------------------------------------------------------
    @app.get("/api/health")
    def health():
        return {"ok": True, "version": __version__}

    # --- projects -----------------------------------------------------------
    @app.post("/api/projects/open")
    def projects_open(body: dict):
        return projects.open_project(st, _body_str(body, "path"))

    @app.post("/api/projects/new")
    def projects_new(body: dict):
        name = _body_str(body, "name")
        location = body.get("location") or None
        return projects.new_project(st, name, location)

    @app.get("/api/projects/recent")
    def projects_recent():
        return {"projects": projects.recent(st)}

    @app.get("/api/project/current")
    def project_current():
        return {"project": projects.current(st)}

    # --- files ----------------------------------------------------------------
    @app.get("/api/files/tree")
    def files_tree(dir: str = "", hidden: int = 0):
        root = projects.root_of(st)
        return files.tree(root, dir or None, bool(hidden))

    @app.get("/api/files/read")
    def files_read(path: str):
        root = projects.root_of(st)
        return files.read_file(root, path)

    @app.get("/api/files/raw")
    def files_raw(path: str):
        """Raw image bytes for tree thumbnails (M3)."""
        root = projects.root_of(st)
        data, media_type = files.raw_image(root, path)
        return Response(content=data, media_type=media_type, headers={"Cache-Control": "no-store"})

    @app.get("/api/files/raw-file")
    def files_raw_file(path: str):
        """Raw bytes of any project file (PDF reading in the PDF pane)."""
        root = projects.root_of(st)
        data, media_type = files.raw_file(root, path)
        return Response(content=data, media_type=media_type, headers={"Cache-Control": "no-store"})

    @app.put("/api/files/write")
    def files_write(body: dict):
        root = projects.root_of(st)
        rel = _body_str(body, "path")
        content = body.get("content")
        if not isinstance(content, str):
            raise ApiError(400, "missing field: content")
        return files.write_file(root, rel, content)

    @app.post("/api/files/create")
    def files_create(body: dict):
        root = projects.root_of(st)
        rel = _body_str(body, "path")
        kind = body.get("kind") or "file"
        if kind not in ("file", "dir"):
            raise ApiError(400, 'kind must be "file" or "dir"')
        return files.create_path(root, rel, kind)

    @app.post("/api/files/rename")
    def files_rename(body: dict):
        root = projects.root_of(st)
        old = _body_str(body, "from")
        new = _body_str(body, "to")
        return files.rename_path(root, old, new)

    @app.post("/api/files/delete")
    def files_delete(body: dict):
        root = projects.root_of(st)
        rel = _body_str(body, "path")
        return files.delete_path(root, rel)

    # --- compile ----------------------------------------------------------------
    @app.post("/api/compile/start")
    def compile_start(body: dict):
        root = projects.root_of(st)
        main_file = body.get("main_file") or None
        target = body.get("target") or None
        return {"job_id": compiles.start(root, main_file, target)}

    @app.get("/api/compile/status/{job_id}")
    def compile_status(job_id: str, since: int = 0):
        job = jobs.get(job_id)
        if not job:
            raise ApiError(404, f"unknown job: {job_id}")
        return job.snapshot(since)

    @app.post("/api/compile/cancel/{job_id}")
    def compile_cancel(job_id: str):
        compiles.cancel(job_id)
        return {"ok": True}

    # --- artifacts ----------------------------------------------------------------
    @app.get("/api/artifacts/pdf")
    def artifact_pdf(file: str = "main.pdf"):
        root = projects.root_of(st)
        name = os.path.basename(file)  # no traversal
        p = state.build_dir(root) / name
        if not p.is_file():
            raise ApiError(404, f"no such artifact: {name}")
        # no-store: build output changes on every compile — a heuristically
        # cached copy would keep showing stale pages in the PDF pane.
        return FileResponse(
            str(p), media_type="application/pdf", filename=name, headers={"Cache-Control": "no-store"}
        )

    @app.get("/api/artifacts/synctex")
    def artifact_synctex(file: str = "main.synctex.gz"):
        """Gunzipped SyncTeX map for forward/inverse search (M3)."""
        root = projects.root_of(st)
        name = os.path.basename(file)  # no traversal
        p = state.build_dir(root) / name
        if not p.is_file():
            raise ApiError(404, f"no such artifact: {name}")
        raw = gzip.open(p, "rb").read()
        return PlainTextResponse(raw.decode("utf-8", errors="replace"), headers={"Cache-Control": "no-store"})

    # --- config ----------------------------------------------------------------
    @app.get("/api/config")
    def config_get():
        cur = projects.current(st)
        pcfg = state.load_project_config(Path(cur["root"])) if cur else {}
        return {
            "global": {"wsl_distro": st.get("wsl_distro")},
            "project": pcfg,
        }

    @app.put("/api/config")
    def config_put(body: dict):
        g = body.get("global") or {}
        if isinstance(g.get("wsl_distro"), str):
            st.set("wsl_distro", g["wsl_distro"] or None)
        p = body.get("project")
        if p is not None:
            cur = projects.current(st)
            if not cur:
                raise ApiError(409, "no project open")
            root = Path(cur["root"])
            cfg = state.load_project_config(root)
            for k in ("main_file", "target", "auto_compile"):
                if k in p:
                    cfg[k] = p[k]
            ssh = p.get("ssh")
            if isinstance(ssh, dict):
                clean = {}
                for k2 in ("host", "user", "key", "remote_dir"):
                    v = ssh.get(k2)
                    if isinstance(v, str) and v.strip():
                        clean[k2] = v.strip()
                port = ssh.get("port")
                if isinstance(port, int) and not isinstance(port, bool) and 1 <= port <= 65535:
                    clean["port"] = port
                elif isinstance(port, str) and port.isdigit() and 1 <= int(port) <= 65535:
                    clean["port"] = int(port)
                cfg["ssh"] = clean
            state.save_project_config(root, cfg)
        return {"ok": True}

    # --- install ----------------------------------------------------------------
    @app.get("/api/install/status")
    def install_status():
        return {"targets": install.status(st)}

    @app.post("/api/install/run")
    def install_run(body: dict):
        target = _body_str(body, "target")
        distro = body.get("distro") or None
        return {"job_id": install.start_install(st, jobs, target, distro)}

    # --- built web UI (served same-origin with the API) ------------------------
    web_dist = Path(__file__).resolve().parent.parent.parent / "web" / "dist"
    if web_dist.is_dir():
        from fastapi.staticfiles import StaticFiles
        app.mount("/", StaticFiles(directory=str(web_dist), html=True), name="ui")

    return app


# Dev-only module-level app for `uvicorn --reload`: the reloader re-imports
# this module after each edit, so the token must come from $WORKBENCH_TOKEN
# instead of a constructor argument. Production (instance-based uvicorn.run)
# never touches it.
app = create_app(os.environ["WORKBENCH_TOKEN"]) if os.environ.get("WORKBENCH_TOKEN") else None


def serve(token: str | None = None, port: int | None = None, reload: bool = False) -> None:
    token = token or os.environ.get("WORKBENCH_TOKEN") or secrets.token_urlsafe(24)
    app = create_app(token)
    if port is None:
        sock = socket.socket()
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
        sock.close()
    sys.stdout.write(f"PORT={port}\n")
    sys.stdout.flush()
    if reload:
        # Dev only: uvicorn re-imports this module after each edit and serves
        # the module-level `app`, which reads $WORKBENCH_TOKEN.
        os.environ["WORKBENCH_TOKEN"] = token
        uvicorn.run(
            "workbench_backend.app:app",
            host="127.0.0.1",
            port=port,
            log_level="warning",
            reload=True,
            reload_dirs=["workbench_backend"],
        )
    else:
        uvicorn.run(create_app(token), host="127.0.0.1", port=port, log_level="warning")
