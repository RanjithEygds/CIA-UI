import os
import json
import time
import asyncio
from typing import Optional, Dict, Any, List, Tuple, Union, Callable, AsyncIterator

from dotenv import load_dotenv
from langchain_openai import AzureChatOpenAI, AzureOpenAIEmbeddings
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_core.chat_history import BaseChatMessageHistory

# Load .env once
load_dotenv()

# -----------------------------
# Environment Variables (Corrected)
# -----------------------------

AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")   # Correct name
AZURE_OPENAI_API_KEY = os.getenv("AZURE_OPENAI_API_KEY")
AZURE_OPENAI_CHAT_API_VERSION = os.getenv("AZURE_OPENAI_CHAT_API_VERSION")
AZURE_OPENAI_CHAT_MODEL = os.getenv("AZURE_OPENAI_CHAT_MODEL")

AZURE_OPENAI_EMBEDDING_API_VERSION = os.getenv("AZURE_OPENAI_EMBEDDING_API_VERSION")
AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME = os.getenv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME")

# Reasonable defaults
DEFAULT_TEMPERATURE = 0.2
DEFAULT_MAX_TOKENS = None
DEFAULT_REQUEST_TIMEOUT = 60
DEFAULT_MAX_RETRIES = 3
DEFAULT_RETRY_BACKOFF_BASE = 2.0

# -----------------------------
# Clients (Singletons)
# -----------------------------

_chat_model: Optional[AzureChatOpenAI] = None
_embedding_model: Optional[AzureOpenAIEmbeddings] = None


def _get_chat_model(
    temperature: float = DEFAULT_TEMPERATURE,
    request_timeout: int = DEFAULT_REQUEST_TIMEOUT,
    max_retries: int = DEFAULT_MAX_RETRIES,
    json_mode: bool = False,
) -> AzureChatOpenAI:

    if not (AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY and AZURE_OPENAI_CHAT_API_VERSION and AZURE_OPENAI_CHAT_MODEL):
        raise RuntimeError(
            "Azure OpenAI environment missing. "
            "Ensure AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, "
            "AZURE_OPENAI_CHAT_API_VERSION, AZURE_OPENAI_CHAT_MODEL are set."
        )

    return AzureChatOpenAI(
        azure_endpoint=AZURE_OPENAI_ENDPOINT,
        api_key=AZURE_OPENAI_API_KEY,
        api_version=AZURE_OPENAI_CHAT_API_VERSION,
        azure_deployment=AZURE_OPENAI_CHAT_MODEL,
        temperature=temperature,
        max_tokens=DEFAULT_MAX_TOKENS,
        request_timeout=request_timeout,
        max_retries=max_retries,
        model_kwargs={"response_format": {"type": "json_object"}} if json_mode else {},
    )


def _get_embedding_model() -> AzureOpenAIEmbeddings:
    global _embedding_model
    if _embedding_model is None:
        if not (AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY and AZURE_OPENAI_EMBEDDING_API_VERSION and AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME):
            raise RuntimeError(
                "Azure Embeddings env missing. "
                "Ensure AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, "
                "AZURE_OPENAI_EMBEDDING_API_VERSION, AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME are set."
            )
        _embedding_model = AzureOpenAIEmbeddings(
            azure_endpoint=AZURE_OPENAI_ENDPOINT,
            api_key=AZURE_OPENAI_API_KEY,
            api_version=AZURE_OPENAI_EMBEDDING_API_VERSION,
            azure_deployment=AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME,
        )
    return _embedding_model

# -----------------------------
# Retry Helpers
# -----------------------------

def _retry_loop(fn: Callable[[], Any], max_retries: int, backoff_base: float, on_retry=None):
    attempt = 0
    while True:
        try:
            return fn()
        except Exception as e:
            attempt += 1
            if attempt > max_retries:
                raise
            if on_retry:
                on_retry(attempt, e)
            time.sleep(backoff_base ** (attempt - 1))

# -----------------------------
# Message Preparation
# -----------------------------

def _prepare_messages(system_prompt: str, user_prompt: str, history=None):
    messages = []
    if system_prompt:
        messages.append(SystemMessage(content=system_prompt))
    if history:
        for role, content in history:
            if role == "system":
                messages.append(SystemMessage(content=content))
            elif role == "ai":
                messages.append(AIMessage(content=content))
            else:
                messages.append(HumanMessage(content=content))
    messages.append(HumanMessage(content=user_prompt))
    return messages

# -----------------------------
# Public API
# -----------------------------

def llm_call(
    system_prompt: str,
    user_prompt: str,
    temperature: float = DEFAULT_TEMPERATURE,
    json_mode: bool = False,
    history=None,
    request_timeout: int = DEFAULT_REQUEST_TIMEOUT,
    max_retries: int = DEFAULT_MAX_RETRIES,
) -> str:

    messages = _prepare_messages(system_prompt, user_prompt, history)

    def _do():
        chat = _get_chat_model(
            temperature=temperature,
            request_timeout=request_timeout,
            max_retries=max_retries,
            json_mode=json_mode,
        )
        resp = chat.invoke(messages)
        return resp.content

    return _retry_loop(_do, max_retries, DEFAULT_RETRY_BACKOFF_BASE)


def _chunk_content_from_message_chunk(chunk) -> str:
    """Extract incremental text from a LangChain AIMessageChunk (handles str or block lists)."""
    c = getattr(chunk, "content", None)
    if c is None:
        return ""
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        parts: List[str] = []
        for item in c:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and item.get("type") == "text":
                t = item.get("text", "")
                if isinstance(t, str):
                    parts.append(t)
        return "".join(parts)
    return ""


async def llm_stream(
    system_prompt: str,
    user_prompt: str,
    temperature: float = DEFAULT_TEMPERATURE,
    json_mode: bool = False,
    history=None,
    request_timeout: int = DEFAULT_REQUEST_TIMEOUT,
    max_retries: int = DEFAULT_MAX_RETRIES,
) -> AsyncIterator[str]:
    """
    Stream plain text from the chat model. Do not use json_mode=True with streaming.
    """
    if json_mode:
        raise ValueError("llm_stream does not support json_mode")

    messages = _prepare_messages(system_prompt, user_prompt, history)
    attempt = 0
    while attempt < max_retries:
        try:
            chat = _get_chat_model(
                temperature=temperature,
                request_timeout=request_timeout,
                max_retries=max_retries,
                json_mode=False,
            )
            async for chunk in chat.astream(messages):
                text = _chunk_content_from_message_chunk(chunk)
                if text:
                    yield text
            return
        except Exception:
            attempt += 1
            if attempt >= max_retries:
                raise
            await asyncio.sleep(DEFAULT_RETRY_BACKOFF_BASE ** (attempt - 1))


async def llm_call_async(
    system_prompt: str,
    user_prompt: str,
    temperature=DEFAULT_TEMPERATURE,
    json_mode=False,
    history=None,
    request_timeout=DEFAULT_REQUEST_TIMEOUT,
    max_retries=DEFAULT_MAX_RETRIES,
) -> str:

    messages = _prepare_messages(system_prompt, user_prompt, history)

    async def _do_async():
        chat = _get_chat_model(
            temperature=temperature,
            request_timeout=request_timeout,
            max_retries=max_retries,
            json_mode=json_mode,
        )
        resp = await chat.ainvoke(messages)
        return resp.content

    attempt = 0
    while True:
        try:
            return await _do_async()
        except Exception:
            attempt += 1
            if attempt > max_retries:
                raise
            import asyncio
            await asyncio.sleep(DEFAULT_RETRY_BACKOFF_BASE ** (attempt - 1))

# -----------------------------
# Embeddings API
# -----------------------------

def embed_texts(texts: List[str]):
    return _get_embedding_model().embed_documents(texts)

def embed_query(text: str):
    return _get_embedding_model().embed_query(text)

# -----------------------------
# Runnable With History
# -----------------------------

def get_runnable_with_history(session_id, history_store_getter, temperature=DEFAULT_TEMPERATURE, json_mode=False):
    chat = _get_chat_model(temperature=temperature, json_mode=json_mode)

    def _mk_chain():
        def _call(inputs):
            result = chat.invoke([HumanMessage(content=inputs.get("input", ""))])
            return {"output": result.content}
        return _call

    chain = _mk_chain()

    def _get_history(config):
        sid = config.get("configurable", {}).get("session_id")
        if not sid:
            raise ValueError("session_id missing")
        return history_store_getter(sid)

    return RunnableWithMessageHistory(
        chain,
        _get_history,
        input_messages_key="input",
        history_messages_key="history",
        output_messages_key="output",
    )