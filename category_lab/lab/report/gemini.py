"""AI commentary for the report, written by Gemini from the measured results (phase F5).

One request per topic. Gemini returns JSON that matches TopicCommentary:
  scenarios      one comment per scenario  -> shown in that scenario's SQL Server / Redis tab
  comparison     SQL Server vs Redis for the whole topic, answering its research questions
  recommendation what Novelle should use where
  caveats        limits of the measurements
What is sent: the topic's questions and context, the DBMS versions and how time is measured, and per
scenario its metrics, checks, member notes, statements and plan summaries (truncated). Never sent:
host names, user names, passwords, the API key.

Answers are cached in results/.llm-cache/<topic>-<hash>.json, the hash covering the payload, the
prompt (prompts/commentary.md) and the model; rebuilding a report with unchanged results costs no request.
"""
from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from pydantic import BaseModel, Field, ValidationError

from lab.framework.result import Environment, Metric, ScenarioResult, TopicResult

PROMPT_VERSION = "2"
MAX_STATEMENT_CHARS = 1500
MAX_ARTIFACT_CHARS = 2000
MAX_TEXT_CHARS = 600
RETRY_DELAYS_S = (5, 15, 40)          # free tier: 429 / 503 are common, wait and retry
RETRYABLE = {429, 500, 502, 503, 504}

PROMPT_FILE = Path(__file__).parent / "prompts" / "commentary.md"


def system_prompt() -> str:
    """The system instruction, kept in prompts/commentary.md so it can be edited without touching code.
    Editing it changes the cache key, so the next `lab report` asks Gemini again."""
    return PROMPT_FILE.read_text(encoding="utf-8")


class ScenarioComment(BaseModel):
    scenario_id: str
    comment: str


class TopicCommentary(BaseModel):
    scenarios: list[ScenarioComment] = Field(default_factory=list)
    comparison: str
    recommendation: str
    caveats: list[str] = Field(default_factory=list)


@dataclass
class Commentary:
    """What the report uses for one topic."""
    topic: str
    model: str
    generated_at: str
    by_scenario: dict[str, str]
    comparison: str
    recommendation: str
    caveats: list[str]
    cached: bool = False
    stale: bool = False            # from an earlier run: Gemini failed now, results may have changed


@dataclass
class GenerateResult:
    commentary: dict[str, Commentary] = field(default_factory=dict)
    errors: dict[str, str] = field(default_factory=dict)        # topic id -> message


# --- payload --------------------------------------------------------------------------------------------
def _cut(text: str, limit: int) -> str:
    text = text.strip()
    return text if len(text) <= limit else text[:limit] + " …(cắt bớt)"


def _num(v: float) -> float | int:
    """Numbers as a person would quote them: 16.0 -> 16, 0.499911 -> 0.5, 0.0315 -> 0.0315."""
    if float(v).is_integer():
        return int(v)
    return float(f"{v:.3g}")


def _metric(m: Metric) -> dict[str, Any]:
    out: dict[str, Any] = {"name": m.name, "label": m.label, "value": _num(m.value), "unit": m.unit,
                           "better": m.better}
    if m.stats:
        out.update({k: _num(getattr(m.stats, k)) for k in ("p50", "p95", "min", "max", "mean")})
        out["n"] = m.stats.count
    if m.resolution_ms:
        out["resolution_ms"] = _num(m.resolution_ms)
        out["coarse"] = m.coarse
    if m.note:
        out["note"] = m.note
    return out


def _scenario(s: ScenarioResult, results_dir: Path) -> dict[str, Any]:
    out: dict[str, Any] = {"scenario_id": s.id, "dbms": s.dbms, "pair": s.pair, "title": s.title,
                           "status": s.status, "metrics": [_metric(m) for m in s.metrics],
                           "checks": [{"passed": c.passed, "message": c.message} for c in s.checks],
                           "member_notes": s.observations,
                           "statements": [{"label": st.label, "text": _cut(st.text, MAX_STATEMENT_CHARS)}
                                          for st in s.statements]}
    if s.description:
        out["description"] = s.description
    if s.skip_reason:
        out["skip_reason"] = s.skip_reason
    if s.error:
        out["error"] = _cut(s.error.strip().splitlines()[-1], MAX_TEXT_CHARS)
    plans = []
    for a in s.artifacts:                         # text plan summaries only, not the XML
        path = results_dir / a.path
        if a.kind == "text" and a.label.endswith(".plan") and path.is_file():
            plans.append({"label": a.label, "text": _cut(path.read_text(encoding="utf-8", errors="replace"),
                                                          MAX_ARTIFACT_CHARS)})
    if plans:
        out["execution_plans"] = plans
    return out


def build_payload(topic: TopicResult, env: Environment, results_dir: Path) -> dict[str, Any]:
    t = topic.topic
    return {
        "topic": {"id": t.id, "title": t.title, "research_questions": t.research_questions, "context": t.context},
        "environment": {"sqlserver": f"{env.sqlserver_version} {env.sqlserver_edition}".strip(),
                        "redis": env.redis_version, "redis_target": env.target,
                        "timing": "server-side only; SQL Server: statement looped K times in one batch between "
                                  "SYSDATETIME() calls, divided by K; Redis: sum of SLOWLOG durations"},
        "scenarios": [_scenario(s, results_dir) for s in topic.scenarios if s.status != "skipped"],
    }


def payload_hash(payload: dict[str, Any], model: str) -> str:
    blob = json.dumps({"v": PROMPT_VERSION, "model": model, "system": system_prompt(), "payload": payload},
                      ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


# --- calling Gemini -------------------------------------------------------------------------------------
def make_client(api_key: str):
    from google import genai
    from google.genai import types
    return genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=180_000))


def _status_code(exc: Exception) -> int | None:
    code = getattr(exc, "code", None)
    return code if isinstance(code, int) else None


def ask(client, model: str, payload: dict[str, Any], sleep: Callable[[float], None] = time.sleep) -> TopicCommentary:
    from google.genai import types
    config = types.GenerateContentConfig(system_instruction=system_prompt(), temperature=0.3,
                                         response_mime_type="application/json",
                                         response_schema=TopicCommentary)
    contents = "Dữ liệu thí nghiệm của chủ đề (JSON):\n" + json.dumps(payload, ensure_ascii=False, indent=1)
    for attempt in range(len(RETRY_DELAYS_S) + 1):
        try:
            response = client.models.generate_content(model=model, contents=contents, config=config)
            if not response.text:
                raise RuntimeError("Gemini trả về rỗng (có thể bị chặn bởi bộ lọc an toàn)")
            return TopicCommentary.model_validate_json(response.text)
        except ValidationError as exc:
            if attempt == len(RETRY_DELAYS_S):
                raise RuntimeError(f"JSON của Gemini không đúng schema: {exc.errors()[0]['msg']}") from exc
        except Exception as exc:
            if _status_code(exc) not in RETRYABLE or attempt == len(RETRY_DELAYS_S):
                raise
            sleep(RETRY_DELAYS_S[attempt])
    raise RuntimeError("unreachable")


def _to_commentary(topic: TopicResult, model: str, answer: TopicCommentary, generated_at: str,
                   cached: bool) -> Commentary:
    known = {s.id for s in topic.scenarios}
    return Commentary(topic=topic.topic.id, model=model, generated_at=generated_at,
                      by_scenario={c.scenario_id: c.comment for c in answer.scenarios if c.scenario_id in known},
                      comparison=answer.comparison, recommendation=answer.recommendation,
                      caveats=answer.caveats, cached=cached)


def _read_cache(path: Path) -> tuple[str, str, TopicCommentary] | None:
    try:
        saved = json.loads(path.read_text(encoding="utf-8"))
        return saved["model"], saved["generated_at"], TopicCommentary.model_validate(saved["commentary"])
    except (OSError, ValueError, KeyError, ValidationError):
        return None


def generate(topics: list[TopicResult], env: Environment, results_dir: Path, *, api_key: str, model: str,
             fallback_models: tuple[str, ...] = (), refresh: bool = False, client=None,
             progress: Callable[[str, str], None] | None = None,
             sleep: Callable[[float], None] = time.sleep) -> GenerateResult:
    """Commentary for every topic that has results; a failing topic is reported, not raised.
    The cache key uses the main model only, so an answer from a fallback model is reused next time.
    When every model fails, the newest earlier answer for the topic is used and marked stale."""
    cache_dir = results_dir / ".llm-cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    result = GenerateResult()
    for topic in topics:
        tid = topic.topic.id
        payload = build_payload(topic, env, results_dir)
        if not payload["scenarios"]:
            continue
        cache = cache_dir / f"{tid}-{payload_hash(payload, model)}.json"
        if cache.is_file() and not refresh and (hit := _read_cache(cache)):
            result.commentary[tid] = _to_commentary(topic, hit[0], hit[2], hit[1], True)
            if progress:
                progress(tid, "cache")
            continue

        answer, used, error = None, None, None
        for candidate in dict.fromkeys((model, *fallback_models)):     # keep order, drop duplicates
            if progress:
                progress(tid, f"request:{candidate}")
            try:
                client = client or make_client(api_key)
                answer, used = ask(client, candidate, payload, sleep=sleep), candidate
                break
            except Exception as exc:
                error = f"{candidate}: {type(exc).__name__}: {str(exc)[:240]}"
                if _status_code(exc) not in RETRYABLE:      # bad key, bad request: another model won't help
                    break
        if answer is not None:
            generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
            cache.write_text(json.dumps({"model": used, "generated_at": generated_at,
                                         "commentary": answer.model_dump()}, ensure_ascii=False, indent=2),
                             encoding="utf-8")
            result.commentary[tid] = _to_commentary(topic, used, answer, generated_at, False)
            continue

        result.errors[tid] = error or "unknown error"
        older = sorted(cache_dir.glob(f"{tid}-*.json"), key=lambda f: f.stat().st_mtime, reverse=True)
        for path in older:
            if hit := _read_cache(path):
                c = _to_commentary(topic, hit[0], hit[2], hit[1], True)
                c.stale = True
                result.commentary[tid] = c
                if progress:
                    progress(tid, "stale")
                break
    return result


def check_key(api_key: str, model: str, client=None) -> str:
    """Check that the key can GENERATE with this model. models.get alone is not enough: a model retired for
    new users is still listed but refuses generate_content. One tiny request."""
    from google.genai import types
    client = client or make_client(api_key)
    info = client.models.get(model=model)
    client.models.generate_content(model=model, contents="Trả lời đúng một chữ: OK",
                                   config=types.GenerateContentConfig(max_output_tokens=64))
    return getattr(info, "display_name", None) or model
