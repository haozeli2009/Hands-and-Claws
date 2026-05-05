from __future__ import annotations
from typing import Callable, Awaitable
from utils.llm import LLMClient, LLMResponse


class BaseAgent:
    """
    Shared scaffolding for all agents.
    Runs the LLM tool-call loop until the model returns a final text response.
    Subclasses override _handle_tool_call() to execute their specific tools.
    """

    def __init__(self, llm: LLMClient):
        self.llm = llm

    async def _run(self, messages: list[dict],
                         tools:    list[dict] = [],
                         on_thinking: Callable[[str], Awaitable[None]] | None = None) -> str:
        """
        Drives the agentic tool-call loop.
        Returns the final plain-text reply from the model.
        on_thinking: async callback invoked with thinking text each LLM turn.
        """
        while True:
            response: LLMResponse = await self.llm.complete(messages, tools)

            if response.thinking and on_thinking:
                await on_thinking(response.thinking)

            if response.stop_reason == "tool_use" and response.tool_calls:
                tool_results = []
                for call in response.tool_calls:
                    result = await self._handle_tool_call(
                        call["name"], call["input"]
                    )
                    tool_results.append({
                        "type":        "tool_result",
                        "tool_use_id": call["id"],
                        "content":     str(result),
                    })

                messages.append({"role": "assistant", "content": response.raw.content})
                messages.append({"role": "user",      "content": tool_results})

            else:
                return response.text

    async def _handle_tool_call(self, name: str, inputs: dict) -> object:
        """Override in subclasses to handle specific tool names."""
        raise NotImplementedError(
            f"Tool {name!r} not handled by {self.__class__.__name__}"
        )
