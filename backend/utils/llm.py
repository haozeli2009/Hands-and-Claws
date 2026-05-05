from __future__ import annotations
from dataclasses import dataclass, field
from config import Config


@dataclass
class LLMResponse:
    text:        str
    stop_reason: str
    thinking:    str        = ""
    tool_calls:  list[dict] = field(default_factory=list)
    raw:         object     = None


class LLMClient:
    def __init__(self, provider: str = Config.LLM_PROVIDER,
                       model: str    = Config.LLM_MODEL,
                       api_key: str | None = None):
        self.provider = provider
        self.model    = model
        self._api_key = api_key   # None → fall back to Config defaults
        self._client  = None      # lazy-initialised on first call

    def _get_client(self):
        if self._client is not None:
            return self._client
        if self.provider == "anthropic":
            import anthropic
            key = self._api_key or Config.ANTHROPIC_API_KEY
            self._client = anthropic.AsyncAnthropic(api_key=key)
        elif self.provider == "openai":
            import openai
            key = self._api_key or Config.OPENAI_API_KEY
            self._client = openai.AsyncOpenAI(api_key=key)
        else:
            raise ValueError(f"Unsupported LLM provider: {self.provider!r}")
        return self._client

    async def complete(self, messages: list[dict],
                       tools: list[dict] = []) -> LLMResponse:
        if self.provider == "anthropic":
            return await self._call_anthropic(messages, tools)
        elif self.provider == "openai":
            return await self._call_openai(messages, tools)

    async def _call_anthropic(self, messages, tools) -> LLMResponse:
        client = self._get_client()
        system = next((m["content"] for m in messages if m["role"] == "system"), None)
        msgs   = [m for m in messages if m["role"] != "system"]
        budget = Config.LLM_THINKING_BUDGET
        kwargs = dict(
            model=self.model,
            max_tokens=budget + Config.LLM_MAX_TOKENS,
            thinking={"type": "enabled", "budget_tokens": budget},
            messages=msgs,
        )
        if system: kwargs["system"] = system
        if tools:  kwargs["tools"]  = tools
        resp = await client.messages.create(**kwargs)
        tool_calls, text_parts, thinking_parts = [], [], []
        for block in resp.content:
            if block.type == "tool_use":
                tool_calls.append({"name": block.name, "id": block.id, "input": block.input})
            elif block.type == "text":
                text_parts.append(block.text)
            elif block.type == "thinking":
                thinking_parts.append(block.thinking)
        return LLMResponse(
            text="\n".join(text_parts),
            stop_reason=resp.stop_reason,
            thinking="\n\n".join(thinking_parts),
            tool_calls=tool_calls,
            raw=resp,
        )

    async def _call_openai(self, messages, tools) -> LLMResponse:
        client = self._get_client()
        kwargs = dict(model=self.model, messages=messages)
        if tools:
            kwargs["tools"] = [
                {"type": "function", "function": {
                    "name": t["name"], "description": t.get("description", ""),
                    "parameters": t.get("input_schema", {}),
                }} for t in tools
            ]
        resp   = await client.chat.completions.create(**kwargs)
        choice = resp.choices[0]
        msg    = choice.message
        tool_calls = []
        if msg.tool_calls:
            import json
            for tc in msg.tool_calls:
                tool_calls.append({"name": tc.function.name, "id": tc.id,
                                   "input": json.loads(tc.function.arguments)})
        return LLMResponse(text=msg.content or "",
                           stop_reason="tool_use" if tool_calls else choice.finish_reason,
                           tool_calls=tool_calls, raw=resp)
