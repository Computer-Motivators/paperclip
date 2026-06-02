export const DIRECT_OPENROUTER_PYTHON_SCRIPT = String.raw`#!/usr/bin/env python3
import json
import os
import re
import subprocess
import sys
import urllib.request
import urllib.error
from pathlib import Path

def emit(event):
    sys.stdout.write(json.dumps(event, ensure_ascii=False) + "\n")
    sys.stdout.flush()

def stable_json(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"))

def resolve_path(root, requested):
    full = (Path(root) / requested).resolve()
    rootp = Path(root).resolve()
    if rootp == full or rootp in full.parents:
        return full
    raise RuntimeError("path escapes workspace root")

def tool_read_file(args, root):
    p = resolve_path(root, args.get("path", ""))
    data = p.read_text(encoding="utf-8")
    return data[:1024 * 1024]

def tool_write_file(args, root):
    p = resolve_path(root, args.get("path", ""))
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(str(args.get("content", "")), encoding="utf-8")
    return "ok"

def tool_apply_patch(args, root):
    p = resolve_path(root, args.get("path", ""))
    search = str(args.get("search", ""))
    replace = str(args.get("replace", ""))
    body = p.read_text(encoding="utf-8")
    if search not in body:
      return "no_match"
    p.write_text(body.replace(search, replace, 1), encoding="utf-8")
    return "ok"

METACHAR_RE = re.compile(r"[;&|`$<>()\\n\\r{}\\[\\]\\\\]")
ABSOLUTE_PATH_RE = re.compile(
    r"(?:^|\\s)(?:~/|/(?:etc|var|root|proc|sys|home|Users|tmp)/|\\$(?:HOME|PWD|OLDPWD)\\b)",
    re.IGNORECASE,
)
SHELL_INTERPRETERS = {"bash", "sh", "zsh", "fish", "dash", "ksh", "exec", "eval", "source", "."}
CODE_EXECUTION_RE = re.compile(
    r"\\b(?:python3?|node|npx)\\s+(?:-c\\b|--eval\\b|-e\\b)|\\b(?:bash|sh|zsh)\\s+-c\\b",
    re.IGNORECASE,
)
ENV_ASSIGN_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=(?:[^\\s\"']+|\"[^\"]*\"|'[^']*')\\s+")

def strip_env_assignments(command):
    rest = command.strip()
    while ENV_ASSIGN_RE.match(rest):
        rest = ENV_ASSIGN_RE.sub("", rest, count=1).strip()
    return rest

def first_command_token(command):
    stripped = strip_env_assignments(command)
    match = re.match(r"^\\S+", stripped)
    if not match:
        return ""
    return match.group(0).split("/")[-1].lower()

def validate_shell_command(command, policy):
    if not policy.get("enabled", True):
        return "run_shell is disabled by shellPolicy"
    trimmed = command.strip()
    if not trimmed:
        return "empty command"
    max_len = int(policy.get("maxCommandLength", 4096))
    if len(trimmed) > max_len:
        return f"command exceeds max length ({max_len})"
    lower = trimmed.lower()
    for blocked in policy.get("blockedSubstrings") or []:
        if blocked.lower() in lower:
            return f"blocked pattern: {blocked}"
    if policy.get("blockMetacharacters", True) and METACHAR_RE.search(trimmed):
        return "shell metacharacters are not allowed (; | & ` $ < > etc.)"
    if policy.get("blockAbsolutePaths", True) and ABSOLUTE_PATH_RE.search(trimmed):
        return "absolute or home-relative paths are not allowed in shell commands"
    token = first_command_token(trimmed)
    if not token:
        return "could not determine command name"
    if token in SHELL_INTERPRETERS:
        return f"shell interpreter command is not allowed: {token}"
    allowed = {str(x).lower() for x in (policy.get("allowedCommands") or [])}
    if token not in allowed:
        preset = policy.get("preset", "dev")
        return f"command not in allowlist: {token} (preset: {preset})"
    if policy.get("blockGitPush", True) and re.search(r"\\bgit\\s+push\\b", trimmed, re.I):
        return "git push is blocked by policy"
    if policy.get("blockDestructiveRm", True) and re.search(r"\\brm\\s+.*\\s+-rf\\b", trimmed, re.I):
        return "rm -rf is blocked by policy"
    if policy.get("blockInlineCodeExecution", True) and CODE_EXECUTION_RE.search(trimmed):
        return "inline code execution (-c / --eval) is blocked"
    return None

def tool_run_shell(args, root, timeout_sec, policy, shell_env):
    import shlex

    command = str(args.get("command", "")).strip()
    if not command:
        return {"exit_code": 1, "stdout": "", "stderr": "missing command"}
    denial = validate_shell_command(command, policy)
    if denial:
        return {"exit_code": 1, "stdout": "", "stderr": f"command denied by sandbox policy: {denial}"}
    try:
        argv = shlex.split(command)
    except ValueError as err:
        return {"exit_code": 1, "stdout": "", "stderr": f"could not parse command: {err}"}
    if not argv:
        return {"exit_code": 1, "stdout": "", "stderr": "empty argv"}
    env = dict(shell_env or {})
    env["PWD"] = root
    env["HOME"] = root
    proc = subprocess.run(
        argv,
        cwd=root,
        text=True,
        capture_output=True,
        timeout=timeout_sec,
        env=env,
    )
    return {
        "exit_code": proc.returncode,
        "stdout": proc.stdout[:65536],
        "stderr": proc.stderr[:65536],
    }

def parse_text_tool_call(content):
    match = re.search(r"```tool_call\\s*(\\{.*?\\})\\s*```", content, flags=re.S)
    if not match:
        return None
    try:
        return json.loads(match.group(1))
    except Exception:
        return None

def openrouter_request(payload, api_key, session_id, referer, title):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        method="POST",
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "X-Session-Id": session_id,
            "HTTP-Referer": referer,
            "X-OpenRouter-Title": title,
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))

def tool_defs():
    return [
        {"type": "function", "function": {"name": "read_file", "description": "Read a text file from workspace", "parameters": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}}},
        {"type": "function", "function": {"name": "write_file", "description": "Write file content into workspace", "parameters": {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path", "content"]}}},
        {"type": "function", "function": {"name": "apply_patch", "description": "Apply one search-and-replace patch in a file", "parameters": {"type": "object", "properties": {"path": {"type": "string"}, "search": {"type": "string"}, "replace": {"type": "string"}}, "required": ["path", "search", "replace"]}}},
        {"type": "function", "function": {"name": "run_shell", "description": "Run a shell command in the workspace", "parameters": {"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]}}},
    ]

def apply_tool(name, args, root, shell_timeout, shell_policy, shell_env):
    if name == "read_file":
        return tool_read_file(args, root)
    if name == "write_file":
        return tool_write_file(args, root)
    if name == "apply_patch":
        return tool_apply_patch(args, root)
    if name == "run_shell":
        return tool_run_shell(args, root, shell_timeout, shell_policy, shell_env)
    return {"error": f"unknown tool {name}"}

def main():
    request = json.loads(sys.stdin.read() or "{}")
    api_key = request.get("apiKey", "")
    if not api_key:
        emit({"type": "error", "message": "OPENROUTER_API_KEY is required"})
        sys.exit(1)
    model = request.get("model", "openai/gpt-5-mini")
    mode = request.get("toolCallingMode", "native")
    max_turns = int(request.get("maxTurns", 25))
    shell_timeout = int(request.get("shellTimeoutSec", 120))
    workspace_root = request.get("workspaceRoot") or os.getcwd()
    shell_policy = request.get("shellPolicy") or {"enabled": True, "preset": "dev"}
    shell_env = request.get("shellEnv") or {}
    session_id = request.get("sessionId", "paperclip-session")
    referer = request.get("httpReferer", "https://agents.commonwaste.com")
    title = request.get("openRouterTitle", "Common Waste Paperclip")
    user = request.get("user")
    trace = request.get("trace") or {}
    messages = request.get("messages") or []

    if mode == "text":
        messages = list(messages)
        messages.insert(0, {
            "role": "system",
            "content": "For tool usage return a fenced block: ```tool_call\\n{\\\"name\\\":\\\"read_file\\\",\\\"arguments\\\":{...}}\\n``` and wait for tool output.",
        })

    totals = {"input_tokens": 0, "output_tokens": 0, "cached_input_tokens": 0, "cost_usd": 0}
    final_text = ""

    for turn in range(max_turns):
        payload = {
            "model": model,
            "messages": messages,
            "session_id": session_id,
            "prompt_cache_key": session_id,
            "trace": dict(trace, generation_name=f"turn-{turn+1}"),
            "user": user,
        }
        if model.startswith("anthropic/"):
            payload["cache_control"] = {"type": "ephemeral", "ttl": "1h"}
        if mode == "native":
            payload["tools"] = tool_defs()
            payload["tool_choice"] = "auto"

        try:
            response = openrouter_request(payload, api_key, session_id, referer, title)
        except urllib.error.HTTPError as err:
            body = err.read().decode("utf-8", errors="replace")
            emit({"type": "error", "message": f"OpenRouter HTTP {err.code}: {body[:2000]}"})
            sys.exit(1)
        except Exception as err:
            emit({"type": "error", "message": f"OpenRouter request failed: {str(err)}"})
            sys.exit(1)

        usage = response.get("usage") or {}
        totals["input_tokens"] += int(usage.get("prompt_tokens", 0) or 0)
        totals["output_tokens"] += int(usage.get("completion_tokens", 0) or 0)
        details = usage.get("prompt_tokens_details") or {}
        totals["cached_input_tokens"] += int(details.get("cached_tokens", 0) or 0)
        totals["cost_usd"] += float(response.get("total_cost", 0) or 0)

        choice = ((response.get("choices") or [{}])[0] or {})
        message = choice.get("message") or {}
        tool_calls = message.get("tool_calls") or []
        text = message.get("content") or ""
        if isinstance(text, list):
            text = "".join([(x.get("text") or "") for x in text if isinstance(x, dict)])
        text = str(text)
        if text.strip():
            emit({"type": "assistant_message", "text": text})
            final_text = text

        messages.append({"role": "assistant", "content": text})

        parsed_text_call = parse_text_tool_call(text) if mode == "text" else None
        if parsed_text_call and not tool_calls:
            name = parsed_text_call.get("name", "")
            args = parsed_text_call.get("arguments", {})
            if not isinstance(args, dict):
                args = {}
            result = apply_tool(name, args, workspace_root, shell_timeout, shell_policy, shell_env)
            emit({"type": "tool_result", "tool_name": name, "result": result})
            messages.append({"role": "tool", "name": name, "content": stable_json(result)})
            continue

        if tool_calls:
            for call in tool_calls:
                fn = call.get("function") or {}
                name = fn.get("name", "")
                raw_args = fn.get("arguments") or "{}"
                try:
                    args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                except Exception:
                    args = {}
                if not isinstance(args, dict):
                    args = {}
                result = apply_tool(name, args, workspace_root, shell_timeout, shell_policy, shell_env)
                emit({"type": "tool_result", "tool_name": name, "result": result})
                messages.append({"role": "tool", "tool_call_id": call.get("id"), "name": name, "content": stable_json(result)})
            continue

        break

    emit({
        "type": "usage",
        "input_tokens": totals["input_tokens"],
        "output_tokens": totals["output_tokens"],
        "cached_input_tokens": totals["cached_input_tokens"],
        "cost_usd": totals["cost_usd"],
    })
    emit({
        "type": "result",
        "summary": final_text,
        "provider": "openrouter",
        "model": model,
        "session_id": session_id,
        "session_params": {
            "sessionId": session_id,
            "messages": messages[-30:],
        },
    })

if __name__ == "__main__":
    main()
`;
