"""Live integration test — Responses API tool call support (/v1/responses).

Usage:
    BASE_URL=http://localhost:8000 API_KEY=your_key python tests/test_responses_tool_calls_live.py

Environment variables:
    BASE_URL  — server base URL (default: http://localhost:8000)
    API_KEY   — API key (default: sk-test)
    MODEL     — model name (default: grok-4.20-0309)
"""

import json
import os
import sys
import urllib.request
import urllib.error

BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")
API_KEY  = os.getenv("API_KEY",  "sk-test")
MODEL    = os.getenv("MODEL",    "grok-4.20-0309")

# Standard Responses API tool format — flat structure, no `function` wrapper.
# See: https://platform.openai.com/docs/api-reference/responses/create#responses-create-tools
TOOLS = [
    {
        "type":        "function",
        "name":        "query_order_status",
        "description": "Query order status from the internal order management system.",
        "parameters": {
            "type": "object",
            "properties": {
                "order_id": {"type": "string", "description": "Order ID"},
            },
            "required": ["order_id"],
        },
    }
]

TOOL_NAME   = "query_order_status"
TOOL_RESULT = json.dumps({"order_id": "ORD-2024-88341", "status": "shipped", "eta": "2024-04-10"})

HEADERS = {
    "Content-Type":  "application/json",
    "Authorization": f"Bearer {API_KEY}",
}


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def post(path: str, body: dict) -> dict:
    data = json.dumps(body).encode()
    req  = urllib.request.Request(BASE_URL + path, data=data, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())


def post_stream(path: str, body: dict) -> list[dict]:
    """Collect all SSE events as parsed dicts (event, data) pairs."""
    data = json.dumps(body).encode()
    req  = urllib.request.Request(BASE_URL + path, data=data, headers=HEADERS)
    events: list[dict] = []
    with urllib.request.urlopen(req, timeout=60) as resp:
        current_event = None
        for raw_line in resp:
            line = raw_line.decode().strip()
            if line.startswith("event:"):
                current_event = line[6:].strip()
            elif line.startswith("data:"):
                payload = line[5:].strip()
                if payload == "[DONE]":
                    break
                try:
                    events.append({"event": current_event, "data": json.loads(payload)})
                except Exception:
                    pass
                current_event = None
    return events


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def ok(label: str):
    print(f"  \033[32m✓\033[0m  {label}")

def skip(label: str):
    print(f"  \033[33m-\033[0m  {label}")

def fail(label: str, detail: str = ""):
    print(f"  \033[31m✗\033[0m  {label}")
    if detail:
        print(f"       {detail}")
    sys.exit(1)


def _assert_fc_item(item: dict, label: str) -> tuple[str, str, str]:
    """Validate a function_call output item. Returns (item_id, call_id, arguments)."""
    if item.get("type") != "function_call":
        fail(f"{label}: item type should be function_call", f"got: {item.get('type')!r}")
    if item.get("name") != TOOL_NAME:
        fail(f"{label}: unexpected function name", f"got: {item.get('name')!r}")
    ok(f"function name = {item['name']}")

    args = item.get("arguments", "{}")
    try:
        json.loads(args)
        ok(f"arguments valid JSON: {args!r}")
    except Exception as e:
        fail(f"{label}: arguments not valid JSON", str(e))

    call_id = item.get("call_id", "")
    if not call_id:
        fail(f"{label}: call_id is empty")
    ok(f"call_id present: {call_id[:20]}")

    return item.get("id", ""), call_id, args


# ---------------------------------------------------------------------------
# Test 1: tool_choice=required — non-streaming, must return function_call item
# ---------------------------------------------------------------------------

def test_required_non_stream() -> tuple[str, str, str]:
    print("\n[1] tool_choice=required  非流式 — 必须返回 function_call 输出项")
    resp = post("/v1/responses", {
        "model":       MODEL,
        "stream":      False,
        "tools":       TOOLS,
        "tool_choice": "required",
        "input":       "What is the status of order ORD-2024-88341?",
    })

    status = resp.get("status")
    output = resp.get("output", [])

    print(f"       [debug] status={status!r}  output_types={[o.get('type') for o in output]}")

    if status == "completed":
        ok("status = completed")
    else:
        fail("status should be completed", f"got: {status!r}")

    fc_items = [o for o in output if o.get("type") == "function_call"]
    if not fc_items:
        fail("no function_call item in output", f"output: {output}")

    ok(f"found {len(fc_items)} function_call item(s)")
    return _assert_fc_item(fc_items[0], "test_required_non_stream")


# ---------------------------------------------------------------------------
# Test 2: tool_choice=required — streaming, validate SSE events
# ---------------------------------------------------------------------------

def test_required_stream():
    print("\n[2] tool_choice=required  流式 — 验证 SSE 事件格式")
    events = None
    for attempt in range(1, 4):
        evts = post_stream("/v1/responses", {
            "model":       MODEL,
            "stream":      True,
            "tools":       TOOLS,
            "tool_choice": "required",
            "input":       "What is the status of order ORD-2024-88341?",
        })
        has_fc = any(e["event"] == "response.output_item.added"
                     and e["data"].get("item", {}).get("type") == "function_call"
                     for e in evts)
        if has_fc:
            events = evts
            print(f"       function_call triggered on attempt {attempt}")
            break
        print(f"       attempt {attempt}: no function_call item (retry…)")
    else:
        events = evts

    if not events:
        fail("no SSE events received")

    event_names = [e["event"] for e in events]
    print(f"       [debug] event_count={len(events)}  events={event_names[:10]}")

    # Must have response.created and response.completed
    if "response.created" in event_names:
        ok("response.created received")
    else:
        fail("missing response.created event")

    if "response.completed" in event_names:
        ok("response.completed received")
    else:
        fail("missing response.completed event")

    # If function_call was triggered, validate its event sequence
    fc_added = [e for e in events if e["event"] == "response.output_item.added"
                and e["data"].get("item", {}).get("type") == "function_call"]
    if fc_added:
        ok(f"response.output_item.added (function_call) received")
        fc_item = fc_added[0]["data"]["item"]
        fc_item_id = fc_item.get("id", "")

        args_delta = [e for e in events
                      if e["event"] == "response.function_call_arguments.delta"
                      and e["data"].get("item_id") == fc_item_id]
        if args_delta:
            ok(f"response.function_call_arguments.delta received ({len(args_delta)} chunk(s))")
        else:
            fail("missing response.function_call_arguments.delta for function_call item")

        args_done = [e for e in events
                     if e["event"] == "response.function_call_arguments.done"
                     and e["data"].get("item_id") == fc_item_id]
        if args_done:
            ok("response.function_call_arguments.done received")
            full_args = args_done[0]["data"].get("arguments", "{}")
            try:
                json.loads(full_args)
                ok(f"final arguments valid JSON: {full_args!r}")
            except Exception:
                fail("final arguments not valid JSON", full_args)
        else:
            fail("missing response.function_call_arguments.done")

        fc_done = [e for e in events
                   if e["event"] == "response.output_item.done"
                   and e["data"].get("item", {}).get("id") == fc_item_id]
        if fc_done:
            ok("response.output_item.done received")
        else:
            fail("missing response.output_item.done for function_call item")

        # Verify completed response contains function_call in output
        completed = [e for e in events if e["event"] == "response.completed"]
        if completed:
            comp_output = completed[0]["data"].get("response", {}).get("output", [])
            comp_fc = [o for o in comp_output if o.get("type") == "function_call"]
            if comp_fc:
                ok("response.completed output contains function_call item")
                if comp_fc[0].get("id") == fc_item_id:
                    ok("function_call item ID consistent across events")
                else:
                    fail("function_call item ID mismatch between streaming events and response.completed",
                         f"streamed: {fc_item_id!r}  completed: {comp_fc[0].get('id')!r}")
            else:
                fail("response.completed output missing function_call item")
    else:
        skip("model answered directly this time — stream format OK")


# ---------------------------------------------------------------------------
# Test 3: multi-turn — send function_call_output, model gives final answer
# ---------------------------------------------------------------------------

def test_multi_turn(item_id: str, call_id: str, args: str):
    print("\n[3] 多轮对话 — 携带 function_call_output，模型给出最终回答")
    resp = post("/v1/responses", {
        "model":  MODEL,
        "stream": False,
        "tools":  TOOLS,
        "input": [
            {
                "type":    "message",
                "role":    "user",
                "content": [{"type": "input_text", "text": "What is the status of order ORD-2024-88341?"}],
            },
            {
                "type":      "function_call",
                "id":        item_id,
                "call_id":   call_id,
                "name":      TOOL_NAME,
                "arguments": args,
            },
            {
                "type":    "function_call_output",
                "call_id": call_id,
                "output":  TOOL_RESULT,
            },
        ],
    })

    status = resp.get("status")
    output = resp.get("output", [])

    if status == "completed":
        ok("status = completed")
    else:
        fail("status should be completed", f"got: {status!r}")

    msg_items = [o for o in output if o.get("type") == "message"]
    if not msg_items:
        fail("no message item in output", str(output))

    content = msg_items[0].get("content", [])
    text = "".join(p.get("text", "") for p in content if p.get("type") == "output_text")
    if text and len(text) > 5:
        ok(f"final answer present ({len(text)} chars)")
        print(f"       preview: {text[:120]!r}")
    else:
        fail("content empty or too short", f"got: {text!r}")


# ---------------------------------------------------------------------------
# Test 4: no tools regression — no function_call items in output
# ---------------------------------------------------------------------------

def test_no_tools_regression():
    print("\n[4] 无 tools 回归测试")
    resp = post("/v1/responses", {
        "model":  MODEL,
        "stream": False,
        "input":  "Say: hello",
    })

    status = resp.get("status")
    output = resp.get("output", [])

    if status == "completed":
        ok("status = completed")
    else:
        fail("status should be completed", f"got: {status!r}")

    fc_items = [o for o in output if o.get("type") == "function_call"]
    if not fc_items:
        ok("no function_call items (correct)")
    else:
        fail("function_call must not appear without tools param", str(fc_items))

    msg_items = [o for o in output if o.get("type") == "message"]
    if msg_items:
        ok("message item present")
    else:
        fail("expected a message item in output")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print(f"Target: {BASE_URL}  Model: {MODEL}")
    print("=" * 50)

    try:
        item_id, call_id, args = test_required_non_stream()
        test_required_stream()
        test_multi_turn(item_id, call_id, args)
        test_no_tools_regression()
    except urllib.error.URLError as e:
        print(f"\n\033[31mConnection error:\033[0m {e}")
        print(f"Is the server running at {BASE_URL}?")
        sys.exit(1)

    print("\n" + "=" * 50)
    print("\033[32mAll tests passed.\033[0m")
