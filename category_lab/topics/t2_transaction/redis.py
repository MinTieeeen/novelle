"""Redis side of t2_transaction: the same three experiments on keys lab:transaction:* (deleted after the topic).

Data model, the Redis stand-in for the SQL tables (users and pen names are read from dbo, never written):
  ...:req:<id>        Hash   UserId, ProposedPenName, Status, ReviewedBy     (AuthorRequest)
  ...:user:<id>       Hash   Role, Status                                    (User)
  ...:author:<userId> Hash   PenName, ApprovedRequestId                      (Author)
  ...:pennames        Set    pen names in use: Redis has no UNIQUE constraint, the code must check this Set
  ...:story:<id>      Hash   RatingSum, RatingCount, RatingAvg               (Story, T3)
  ...:ratings:<id>    Hash   userId -> score                                 (Rating, T3)
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Any

from redis.exceptions import ResponseError, WatchError

from lab.connections import RedisClient
from lab.framework import Ctx, scenario

from . import common as c

T1_REQUEST_IDS = (900001, 900002)              # ids far above the web's, only inside Redis


@dataclass
class Keys:
    r: RedisClient
    base: tuple

    def req(self, rid: int) -> str: return self.r.key(*self.base, "req", rid)
    def user(self, uid: int) -> str: return self.r.key(*self.base, "user", uid)
    def author(self, uid: int) -> str: return self.r.key(*self.base, "author", uid)
    @property
    def pens(self) -> str: return self.r.key(*self.base, "pennames")


def web_users(ctx: Ctx) -> tuple[list[int], list[int]]:
    rows = ctx.sql.query(ctx.read("sql/dbo_users.sql"))
    return ([r["UserId"] for r in rows if r["Kind"] == "ADMIN"],
            [r["UserId"] for r in rows if r["Kind"] == "READER"])


def load_approval_data(ctx: Ctx, k: Keys, admins: list[int], readers: list[int],
                       requests: list[tuple[int, int, str]]) -> None:
    """Users, the pen names in use and the test requests [(requestId, userId, penName)]."""
    pipe = ctx.redis.raw.pipeline(transaction=False)
    for uid in admins:
        pipe.hset(k.user(uid), mapping={"Role": "ADMIN", "Status": "ACTIVE"})
    for uid in readers:
        pipe.hset(k.user(uid), mapping={"Role": "READER", "Status": "ACTIVE"})
    pens = [r["PenName"] for r in ctx.sql.query(ctx.read("sql/dbo_pen_names.sql"))]
    if pens:
        pipe.sadd(k.pens, *pens)
    for rid, uid, pen in requests:
        pipe.hset(k.req(rid), mapping={"UserId": uid, "ProposedPenName": pen, "Status": "PENDING"})
    pipe.execute()


def approval_checks(ctx: Ctx, k: Keys, users: list[int], existing_pens: set[str]) -> tuple[int, int]:
    """(RB13 violations, pen names used twice) over the test users, the same rules as authors_checks.sql."""
    r, rb13, author_pens = ctx.redis, 0, []
    for uid in set(users):
        role = r.hget(k.user(uid), "Role")
        kind = r.type(k.author(uid))
        author = r.hgetall(k.author(uid)) if kind == "hash" else {}
        if role == "AUTHOR" and not author:
            rb13 += 1
        if author and role != "AUTHOR":
            rb13 += 1
        if author:
            req = r.hgetall(k.req(author["ApprovedRequestId"]))
            if req.get("Status") != "APPROVED" or req.get("UserId") != str(uid):
                rb13 += 1
            author_pens.append(author["PenName"])
    duplicates = len(author_pens) - len(set(author_pens)) + sum(1 for p in set(author_pens) if p in existing_pens)
    return rb13, duplicates


# --- T1 -----------------------------------------------------------------------------------------------------
T1_VARIANTS = ("read_then_write", "guarded", "atomic")


@scenario(title="T1 · Hai admin duyệt yêu cầu làm tác giả cùng lúc", pair="concurrent_approval")
def concurrent_approval(ctx: Ctx):
    """The same race as on SQL Server, with the request, user, author profile and pen names in Redis.
    read_then_write: HGET then HSET from the client; guarded: WATCH + MULTI/EXEC with retry (optimistic);
    atomic: a Lua script that checks and writes in one step."""
    admins, readers = web_users(ctx)
    existing = {r["PenName"] for r in ctx.sql.query(ctx.read("sql/dbo_pen_names.sql"))}
    script = ctx.redis.raw.register_script(ctx.read("lua/t1_approve.lua"))
    for case, case_text in c.CASES.items():
        for variant in T1_VARIANTS:
            _t1_run(ctx, case, case_text, variant, admins, readers, existing, script)
    ctx.observe("Redis không có khoá dòng hay ràng buộc UNIQUE. GET rồi SET từ client: cả hai admin đều 'duyệt "
                "thành công', ghi đè ReviewedBy của nhau, hoặc hai tác giả dùng chung một bút danh. WATCH không "
                "chặn client khác: EXEC của admin chạy sau bị huỷ (nil), client đọc lại rồi mới thấy yêu cầu đã "
                "xử lý. Lua chạy trọn script trước mọi lệnh khác nên kiểm tra và ghi không bị xen vào.")


def _t1_run(ctx, case, case_text, variant, admins, readers, existing, script) -> None:
    label = f"{case}.{variant}"
    k = Keys(ctx.redis, ("t1", case, variant))
    pen = c.PEN_NAMES[case]
    if case == "same_request":
        rid = T1_REQUEST_IDS[0]
        load_approval_data(ctx, k, admins, readers, [(rid, readers[0], pen)])
        plan = [(rid, admins[0], readers[0]), (rid, admins[1], readers[0])]
    else:
        r1, r2 = T1_REQUEST_IDS
        load_approval_data(ctx, k, admins, readers, [(r1, readers[0], pen), (r2, readers[1], pen)])
        plan = [(r1, admins[0], readers[0]), (r2, admins[1], readers[1])]
    gate = threading.Barrier(2)

    def read_then_write(w, i):
        rid, admin, uid = plan[w.index]
        status = w.redis.hget(k.req(rid), "Status")
        role = w.redis.hget(k.user(uid), "Role")
        taken = w.redis.sismember(k.pens, pen)
        gate.wait(timeout=30)                   # both admins have read before anyone writes
        if status != "PENDING":
            return {"outcome": "REJECTED", "reason": "ALREADY_PROCESSED", "retries": 0}
        if role != "READER" or taken:
            return {"outcome": "REJECTED", "reason": "NOT_READER" if role != "READER" else "PEN_NAME_TAKEN", "retries": 0}
        w.redis.hset(k.req(rid), mapping={"Status": "APPROVED", "ReviewedBy": admin})
        w.redis.hset(k.user(uid), "Role", "AUTHOR")
        w.redis.hset(k.author(uid), mapping={"PenName": pen, "ApprovedRequestId": rid})
        w.redis.sadd(k.pens, pen)
        return {"outcome": "APPROVED", "reason": None, "retries": 0}

    def guarded(w, i):
        rid, admin, uid = plan[w.index]
        retries = 0
        with w.redis.raw.pipeline() as p:
            while True:
                try:
                    p.watch(k.req(rid), k.user(uid), k.pens)
                    status, role = p.hget(k.req(rid), "Status"), p.hget(k.user(uid), "Role")
                    taken = p.sismember(k.pens, pen)
                    if retries == 0:
                        gate.wait(timeout=30)
                    reason = ("ALREADY_PROCESSED" if status != "PENDING" else
                              "NOT_READER" if role != "READER" else "PEN_NAME_TAKEN" if taken else None)
                    if reason:
                        p.unwatch()
                        return {"outcome": "REJECTED", "reason": reason, "retries": retries}
                    p.multi()
                    p.hset(k.req(rid), mapping={"Status": "APPROVED", "ReviewedBy": admin})
                    p.hset(k.user(uid), "Role", "AUTHOR")
                    p.hset(k.author(uid), mapping={"PenName": pen, "ApprovedRequestId": rid})
                    p.sadd(k.pens, pen)
                    p.execute()
                    return {"outcome": "APPROVED", "reason": None, "retries": retries}
                except WatchError:
                    retries += 1
                    if retries > c.WATCH_RETRIES:
                        return {"outcome": "ERROR", "reason": "GAVE_UP", "retries": retries}

    def atomic(w, i):
        rid, admin, uid = plan[w.index]
        ok, reason = script(keys=[k.req(rid), k.user(uid), k.author(uid), k.pens], args=[admin, rid],
                            client=w.redis.raw)
        return {"outcome": "APPROVED" if ok == 1 else "REJECTED", "reason": None if ok == 1 else reason, "retries": 0}

    fn = {"read_then_write": read_then_write, "guarded": guarded, "atomic": atomic}[variant]
    r = ctx.workers(2, fn, timeout_s=60)
    rows = [r.results[i][0] for i in range(2)]
    rb13, duplicates = approval_checks(ctx, k, [p[2] for p in plan], existing)
    done = [x for x in rows if x]
    approvals = sum(1 for x in done if x["outcome"] == "APPROVED")
    logic = sum(1 for x in done if x["outcome"] == "REJECTED")
    retries = sum(x["retries"] for x in done)
    c.record_t1(ctx, label, approvals=approvals, rejected_logic=logic, rb13=rb13, duplicates=duplicates,
                errors=len(r.errors) + sum(1 for x in done if x["outcome"] == "ERROR"))
    if variant == "guarded":
        ctx.metric("retries", retries, "lần", label=label, note="EXEC bị huỷ vì key đang WATCH đã bị client khác sửa")
    ctx.statement(label, _t1_commands(k, variant, plan[0], pen),
                  note=f"{case_text}; admin 2 chạy cùng các lệnh với yêu cầu {plan[1][0]}, admin {plan[1][1]}")

    def show(x):
        if not x:
            return "exception"
        return x["outcome"] + (f" {x['reason']}" if x["reason"] else "") + (f" sau {x['retries']} lần retry" if x["retries"] else "")
    final = "; ".join(f"yêu cầu {rid}: {ctx.redis.hget(k.req(rid), 'Status')} (ReviewedBy={ctx.redis.hget(k.req(rid), 'ReviewedBy')})"
                      for rid in sorted({p[0] for p in plan}))
    ctx.observe(f"{label}: admin 1 → {show(rows[0])}; admin 2 → {show(rows[1])}. Sau cùng: {final}.")

    if variant in ("guarded", "atomic"):
        ctx.check(approvals == 1 and rb13 == 0 and duplicates == 0,
                  f"{label}: đúng 1 lần duyệt, RB13 đúng, không trùng bút danh")
    if variant == "guarded":
        ctx.check(retries >= 1, f"{label}: EXEC của admin thứ hai bị huỷ (WATCH) và phải retry")
    if variant == "read_then_write":
        ctx.check(approvals == 2, f"{label}: không kiểm soát thì cả hai admin đều được báo duyệt thành công")


def _t1_commands(k: Keys, variant: str, plan: tuple, pen: str) -> str:
    rid, admin, uid = plan
    writes = [f'HSET {k.req(rid)} Status APPROVED ReviewedBy {admin}', f"HSET {k.user(uid)} Role AUTHOR",
              f'HSET {k.author(uid)} PenName "{pen}" ApprovedRequestId {rid}', f'SADD {k.pens} "{pen}"']
    reads = [f"HGET {k.req(rid)} Status", f"HGET {k.user(uid)} Role", f'SISMEMBER {k.pens} "{pen}"']
    if variant == "read_then_write":
        return c.lines(reads + ["# client kiểm tra Status == PENDING, Role == READER, bút danh chưa dùng"] + writes)
    if variant == "guarded":
        return c.lines([f"WATCH {k.req(rid)} {k.user(uid)} {k.pens}"] + reads + ["# client kiểm tra", "MULTI"]
                       + writes + ["EXEC    # nil nếu một key đang WATCH đã bị sửa -> làm lại từ WATCH"])
    return (f"EVALSHA <sha của lua/t1_approve.lua> 4 {k.req(rid)} {k.user(uid)} {k.author(uid)} {k.pens} "
            f"{admin} {rid}\n# script: kiểm tra Status, Role, SISMEMBER rồi mới ghi 4 lệnh, tất cả trong một bước")


# --- T2 -----------------------------------------------------------------------------------------------------
T2_VARIANTS = ("no_transaction", "in_transaction", "queue_error", "discard", "lua_runtime_error",
               "lua_check_first", "compensation")


@scenario(title="T2 · Lỗi ở bước 3 của việc duyệt tác giả", pair="error_mid_transaction")
def error_mid_transaction(ctx: Ctx):
    """The three writes of an approval; the 3rd (the author profile) fails. Redis has no UNIQUE constraint,
    so the failure is a runtime error: the author key already holds a String (WRONGTYPE). Variants:
    separate commands, MULTI/EXEC with a runtime error, an error while queueing (EXECABORT), DISCARD,
    a Lua script that fails half-way, a Lua script that checks first, and compensation by the client."""
    admins, readers = web_users(ctx)
    scripts = {"lua_runtime_error": ctx.redis.raw.register_script(ctx.read("lua/t2_approve_then_fail.lua")),
               "lua_check_first": ctx.redis.raw.register_script(ctx.read("lua/t2_approve_check_first.lua"))}
    rid, uid, admin = T1_REQUEST_IDS[0], readers[0], admins[0]
    for variant in T2_VARIANTS:
        k = Keys(ctx.redis, ("t2", variant))
        load_approval_data(ctx, k, admins, readers, [(rid, uid, "Lab Bút Danh T2")])
        ctx.redis.set(k.author(uid), "legacy-profile")    # the simulated fault: wrong type for the 3rd write
        text, error = _t2_run(ctx, variant, k, rid, uid, admin, scripts)
        persisted = ((ctx.redis.hget(k.req(rid), "Status") == "APPROVED")
                     + (ctx.redis.hget(k.user(uid), "Role") == "AUTHOR")
                     + (ctx.redis.type(k.author(uid)) == "hash"))
        role = ctx.redis.hget(k.user(uid), "Role")
        rb13 = int(role == "AUTHOR" and ctx.redis.type(k.author(uid)) != "hash")
        c.record_t2(ctx, variant, persisted=persisted, rb13=rb13)
        ctx.statement(variant, text)
        ctx.observe(f"{variant}: {error}; sau cùng request={ctx.redis.hget(k.req(rid), 'Status')}, Role={role}, "
                    f"author key kiểu {ctx.redis.type(k.author(uid))} → còn {persisted}/3 bước, {rb13} vi phạm RB13.")
        expected = 2 if variant in ("no_transaction", "in_transaction", "lua_runtime_error") else 0
        ctx.check(persisted == expected, f"{variant}: còn {expected}/3 bước sau lỗi" +
                  (" (Redis không rollback)" if expected else " (không bước nào được ghi)"))
    ctx.observe("Redis chỉ cho 'all or nothing' khi lỗi bị phát hiện TRƯỚC khi lệnh đầu tiên chạy: lỗi lúc xếp lệnh "
                "(EXECABORT), DISCARD, hoặc Lua kiểm tra hết rồi mới ghi. Lỗi lúc chạy (WRONGTYPE) trong EXEC hay "
                "giữa script Lua không làm các lệnh trước bị huỷ. Bù trừ ở client đưa dữ liệu về như cũ nhưng không "
                "nguyên tử: trong khoảng giữa, client khác vẫn thấy Role=AUTHOR, và bản thân lệnh bù trừ cũng có thể lỗi.")


def _t2_run(ctx: Ctx, variant: str, k: Keys, rid: int, uid: int, admin: int, scripts) -> tuple[str, str]:
    step1 = ("HSET", k.req(rid), "Status", "APPROVED", "ReviewedBy", admin)
    step2 = ("HSET", k.user(uid), "Role", "AUTHOR")
    step3 = ("HSET", k.author(uid), "PenName", "Lab Bút Danh T2", "ApprovedRequestId", rid)
    r = ctx.redis

    if variant in ("no_transaction", "compensation"):
        s = c.RawRedisSession(r.raw)
        try:
            for cmd in (step1, step2, step3):
                reply = s.call(*cmd)
            error = f"bước 3 lỗi: {reply}" if isinstance(reply, Exception) else "không lỗi"
            if variant == "compensation" and isinstance(reply, Exception):
                s.transcript.append("# client bắt lỗi rồi tự ghi lại giá trị cũ:")
                s.call("HSET", k.req(rid), "Status", "PENDING")
                s.call("HDEL", k.req(rid), "ReviewedBy")
                s.call("HSET", k.user(uid), "Role", "READER")
                error += "; client bù trừ bằng 3 lệnh ghi ngược"
            return s.text(), error
        finally:
            s.close()

    if variant in ("in_transaction", "queue_error", "discard"):
        s = c.RawRedisSession(r.raw)
        try:
            s.call("MULTI")
            s.call(*step1)
            if variant == "queue_error":
                s.call("HSET", k.user(uid), "Role")           # wrong number of arguments: refused while queueing
            else:
                s.call(*step2)
            if variant == "discard":
                s.transcript.append("# client phát hiện dữ liệu hồ sơ tác giả không hợp lệ trước khi EXEC")
                reply = s.call("DISCARD")
                return s.text(), "DISCARD: huỷ hàng đợi, không lệnh nào chạy"
            s.call(*step3)
            reply = s.call("EXEC")
            if isinstance(reply, Exception):
                return s.text(), f"EXEC bị từ chối: {reply}"
            failed = [x for x in reply if isinstance(x, Exception)]
            return s.text(), f"EXEC chạy cả 3 lệnh, lệnh 3 lỗi: {failed[0]}" if failed else "EXEC không lỗi"
        finally:
            s.close()

    script = scripts[variant]
    keys, args = [k.req(rid), k.user(uid), k.author(uid)], [admin, "Lab Bút Danh T2", rid]
    text = (f"EVALSHA <sha của lua/{'t2_approve_then_fail' if variant == 'lua_runtime_error' else 't2_approve_check_first'}.lua> "
            f"3 {' '.join(keys)} {admin} \"Lab Bút Danh T2\" {rid}")
    try:
        script(keys=keys, args=args, client=r.raw)
        return text, "script không lỗi"
    except ResponseError as exc:
        return text + f"\n    # -> (error) {exc}", f"script lỗi: {str(exc).splitlines()[0][:160]}"


# --- T3 -----------------------------------------------------------------------------------------------------
T3_VARIANTS = ("atomic_increment", "optimistic_retry")


@scenario(title="T3 · Nhiều độc giả cùng đánh giá một truyện khi tải tăng", pair="rating_under_load")
def rating_under_load(ctx: Ctx):
    """200 ratings of one story by 1 / 10 / 50 / 100 concurrent clients. atomic_increment: a Lua script
    (HSETNX the rating, HINCRBY sum and count, HSET the average); optimistic_retry: WATCH the story hash,
    MULTI/EXEC, retry on conflict. Recorded like the SQL side, plus the Redis CPU time per request."""
    story = c.LOAD_STORY_ID
    script = ctx.redis.raw.register_script(ctx.read("lua/t3_rate.lua"))
    for variant in T3_VARIANTS:
        lines = []
        for n in c.LOAD_CLIENTS:
            base = ("t3", variant, f"c{n}")
            kstory, kratings = ctx.redis.key(*base, "story", story), ctx.redis.key(*base, "ratings", story)
            ctx.redis.delete(kstory, kratings)
            fn = _t3_lua(script, kstory, kratings, n) if variant == "atomic_increment" else _t3_watch(kstory, kratings, n)
            before = _busy_usec(ctx)
            r = ctx.workers(n, fn, iterations=c.LOAD_TOTAL // n, timeout_s=c.LOAD_TIMEOUT_S)
            busy = _busy_usec(ctx) - before

            h = ctx.redis.hgetall(kstory)
            scores = [int(v) for v in ctx.redis.hvals(kratings)]
            ok = sum(1 for x in c.flat(r) if x["ok"])
            recomputed = f"{sum(scores) / len(scores):.2f}" if scores else "0.00"
            consistent = int(h.get("RatingCount", 0)) == len(scores) == ok and h.get("RatingAvg") == recomputed
            label = f"{variant}_c{n}"
            summary = c.record_load(ctx, label, r, consistent=consistent, conflicts_name="retries",
                                    conflicts_note="EXEC bị huỷ do WATCH phát hiện story hash đã đổi, phải làm lại")
            per_req = busy / max(1, r.calls)
            ctx.metric("server_usec_per_request", per_req, "µs", label=label,
                       note="INFO commandstats: tổng usec Redis dùng để chạy lệnh / số yêu cầu (gồm lệnh của retry)")
            lines.append(c.load_line(n, summary, "retry") + f", Redis bận {per_req:.0f} µs/yêu cầu; "
                         f"RatingCount={h.get('RatingCount')}, RatingAvg={h.get('RatingAvg')} "
                         f"({'khớp' if consistent else 'LỆCH'})")
            ctx.check(consistent, f"{label}: RatingCount/RatingAvg khớp với tính lại từ hash ratings")
        ctx.observe(f"{variant}: " + "; ".join(lines) + ".")
    ctx.statement("atomic_increment", "EVALSHA <sha của lua/t3_rate.lua> 2 <story key> <ratings key> <userId> <score>\n"
                  "# script: HSETNX ratings user score; HINCRBY story RatingSum score; HINCRBY story RatingCount 1; "
                  "HSET story RatingAvg sum/count")
    ctx.statement("optimistic_retry", "WATCH <story key>\nHMGET <story key> RatingSum RatingCount\nMULTI\n"
                  "HSET <ratings key> <userId> <score>\nHSET <story key> RatingSum <sum+score> RatingCount <count+1> "
                  "RatingAvg <avg>\nEXEC    # nil -> làm lại từ WATCH")
    ctx.observe("Mỗi client là một luồng Python; với 50-100 client, phần lớn độ trễ là thời gian chờ GIL và socket "
                "ở phía client chứ không phải Redis (xem server_usec_per_request).")


def _t3_lua(script, kstory: str, kratings: str, n: int):
    def rate(w, i):
        k = i * n + w.index
        start = time.perf_counter()
        ok, _ = script(keys=[kstory, kratings], args=[k + 1, c.load_score(k)], client=w.redis.raw)
        return {"ok": ok == 1, "conflicts": 0, "latency_ms": (time.perf_counter() - start) * 1000}
    return rate


def _t3_watch(kstory: str, kratings: str, n: int):
    def rate(w, i):
        k = i * n + w.index
        score, retries, start = c.load_score(k), 0, time.perf_counter()
        with w.redis.raw.pipeline() as p:
            while True:
                try:
                    p.watch(kstory)
                    total, count = p.hmget(kstory, "RatingSum", "RatingCount")
                    total, count = int(total or 0) + score, int(count or 0) + 1
                    p.multi()
                    p.hset(kratings, str(k + 1), score)
                    p.hset(kstory, mapping={"RatingSum": total, "RatingCount": count,
                                            "RatingAvg": f"{total / count:.2f}"})
                    p.execute()
                    ok = True
                    break
                except WatchError:
                    retries += 1
                    if retries > c.LOAD_WATCH_RETRIES:
                        ok = False
                        break
        return {"ok": ok, "conflicts": retries, "latency_ms": (time.perf_counter() - start) * 1000}
    return rate


def _busy_usec(ctx: Ctx) -> float:
    """Total microseconds Redis spent executing commands since it started (INFO commandstats)."""
    stats: dict[str, Any] = ctx.redis.info("commandstats")
    return float(sum(v.get("usec", 0) for v in stats.values() if isinstance(v, dict)))
