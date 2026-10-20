"""Project the real-loop trace checked by the TypeScript SDK's owner test."""
from __future__ import annotations

import json
import sys
from pathlib import Path

from deepseek_harness import DeepSeekHarness


EXPECTED = Path(__file__).resolve().parents[3] / "packages/sdk/client/tests/expected"


def test_failed_run_ends_at_first_idle_and_pending_input_projects_separately(tmp_path: Path) -> None:
    trace = EXPECTED / "pre-step-pending-trace.json"
    expected = json.loads((EXPECTED / "pre-step-pending-result.json").read_text(encoding="utf-8"))
    script = tmp_path / "trace_runtime.py"
    script.write_text(
        """
import json
import os
import sys

def notify(method, params):
    print(json.dumps({"jsonrpc": "2.0", "method": method, "params": params}), flush=True)

for line in sys.stdin:
    message = json.loads(line)
    method = message["method"]
    if method == "initialize":
        result = {"serverInfo": {"name": "real-loop-trace"}}
    elif method == "session/prompt":
        session_id = message["params"]["sessionId"]
        notify("session.event", {"sessionId": session_id, "event": {
            "type": "agent/inbox/spliced", "seq": 0, "time": 0,
            "data": {"target": "next-turn", "start": 0, "inserted": [{"id": "accepted-first"}]}}})
        with open(os.environ["TRACE_FILE"], encoding="utf-8") as source:
            for entry in json.load(source):
                notify(entry["method"], {**entry["params"], "sessionId": session_id})
        result = {"messageId": "accepted-first"}
    elif method == "shutdown":
        print(json.dumps({"jsonrpc": "2.0", "id": message["id"], "result": {}}), flush=True)
        break
    else:
        raise RuntimeError("Unexpected method")
    print(json.dumps({"jsonrpc": "2.0", "id": message["id"], "result": result}), flush=True)
""".strip(), encoding="utf-8",
    )
    with DeepSeekHarness(
        _launch_args=(sys.executable, str(script)), cwd=str(tmp_path), env={"TRACE_FILE": str(trace)},
    ) as harness:
        harness.start()
        with harness.client.subscribe_session_notifications("sdk-pre-step-pending") as subscription:
            result = harness.run("first", session_id="sdk-pre-step-pending")
            notifications = []
            idles = 0
            while idles < 2:
                notification = subscription.next()
                notifications.append(notification)
                if notification.method == "session.status" and notification.payload["status"] == "idle":
                    idles += 1
    events = [notification.payload["event"] for notification in notifications if notification.method == "session.event"]
    projection = {
        "finalResponse": result.final_response,
        "runEventTypes": [event["type"] for event in result.events],
        "runReasons": [event["data"]["reason"] for event in result.events if event["type"] == "turn/end"],
        "statuses": [notification.payload["status"] for notification in notifications if notification.method == "session.status"],
        "turns": [event["data"]["turn"] for event in events if event["type"] == "turn/start"],
        "reasons": [event["data"]["reason"] for event in events if event["type"] == "turn/end"],
        "userTexts": [block["text"] for event in events if event["type"] == "user/message"
                      for block in event["data"]["content"] if block["type"] == "text"],
        "assistantTexts": [block["text"] for event in events if event["type"] == "assistant/message"
                           for block in event["data"]["message"]["content"] if block["type"] == "text"],
    }
    assert projection == expected
