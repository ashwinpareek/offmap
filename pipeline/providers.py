"""Thin HTTP clients for the model providers, with a disk cache and polite retries.

Keys are read from environment variables only and are never written to disk:
  GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY

Every call is cached in data/cache.jsonl keyed by its full input, so a run can be
resumed after a rate limit and the exact responses behind every number are kept.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path

import requests

CACHE_PATH = Path(__file__).resolve().parent.parent / "data" / "cache.jsonl"
OPENAI_STYLE = {
    "groq": ("https://api.groq.com/openai/v1", "GROQ_API_KEY"),
    "openrouter": ("https://openrouter.ai/api/v1", "OPENROUTER_API_KEY"),
}
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"


class ProviderError(RuntimeError):
    pass


_cache: dict[str, str] | None = None


def _load_cache() -> dict[str, str]:
    global _cache
    if _cache is None:
        _cache = {}
        if CACHE_PATH.exists():
            for line in CACHE_PATH.read_text().splitlines():
                if line.strip():
                    rec = json.loads(line)
                    _cache[rec["key"]] = rec["text"]
    return _cache


def cache_key(provider: str, model: str, system: str | None, prompt: str,
              temperature: float | None, sample: int, json_mode: bool) -> str:
    raw = json.dumps([provider, model, system, prompt, temperature, sample, json_mode])
    return hashlib.sha256(raw.encode()).hexdigest()


def _post(url: str, headers: dict, body: dict, max_tries: int = 12) -> dict:
    delay = 4.0
    for attempt in range(max_tries):
        try:
            r = requests.post(url, headers=headers, json=body, timeout=90)
        except requests.RequestException as e:
            if attempt == max_tries - 1:
                raise ProviderError(f"network error: {e}") from e
            time.sleep(delay)
            delay = min(delay * 2, 90)
            continue
        if r.status_code == 200:
            return r.json()
        if r.status_code in (429, 500, 502, 503, 504) and attempt < max_tries - 1:
            wait = r.headers.get("retry-after")
            time.sleep(min(float(wait), 90) if wait and wait.replace(".", "", 1).isdigit() else delay)
            delay = min(delay * 2, 90)
            continue
        raise ProviderError(f"{r.status_code} from {url.split('?')[0]}: {r.text[:300]}")
    raise ProviderError("retries exhausted")


def _key(env: str) -> str:
    value = os.environ.get(env)
    if not value:
        raise ProviderError(f"environment variable {env} is not set")
    return value


def _call_gemini(model, system, prompt, temperature, json_mode) -> str:
    body: dict = {"contents": [{"role": "user", "parts": [{"text": prompt}]}]}
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}
    cfg = {}
    if temperature is not None:
        cfg["temperature"] = temperature
    if json_mode:
        cfg["responseMimeType"] = "application/json"
    if cfg:
        body["generationConfig"] = cfg
    data = _post(f"{GEMINI_BASE}/models/{model}:generateContent",
                 {"x-goog-api-key": _key("GEMINI_API_KEY")}, body)
    try:
        parts = data["candidates"][0]["content"]["parts"]
        return "".join(p.get("text", "") for p in parts if not p.get("thought"))
    except (KeyError, IndexError) as e:
        raise ProviderError(f"unexpected Gemini response: {json.dumps(data)[:300]}") from e


def _call_openai_style(provider, model, system, prompt, temperature, json_mode) -> str:
    base, env = OPENAI_STYLE[provider]
    messages = ([{"role": "system", "content": system}] if system else []) + \
               [{"role": "user", "content": prompt}]
    body: dict = {"model": model, "messages": messages}
    if temperature is not None:
        body["temperature"] = temperature
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    data = _post(f"{base}/chat/completions", {"Authorization": f"Bearer {_key(env)}"}, body)
    try:
        return data["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError) as e:
        raise ProviderError(f"unexpected {provider} response: {json.dumps(data)[:300]}") from e


def generate(provider: str, model: str, prompt: str, system: str | None = None,
             temperature: float | None = None, sample: int = 0, json_mode: bool = False,
             pause: float = 0.0) -> str:
    """Return the model's text. `sample` only distinguishes repeated identical calls.

    temperature=None leaves the provider default in place, which is what an
    ordinary user gets and is therefore the right setting for the baseline.
    """
    cache = _load_cache()
    key = cache_key(provider, model, system, prompt, temperature, sample, json_mode)
    if key in cache:
        return cache[key]
    if provider == "gemini":
        text = _call_gemini(model, system, prompt, temperature, json_mode)
    elif provider in OPENAI_STYLE:
        text = _call_openai_style(provider, model, system, prompt, temperature, json_mode)
    else:
        raise ProviderError(f"unknown provider {provider!r}")
    if not text.strip():
        raise ProviderError(f"empty response from {provider}/{model}")
    cache[key] = text
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CACHE_PATH.open("a") as fh:
        fh.write(json.dumps({"key": key, "provider": provider, "model": model,
                             "sample": sample, "text": text}) + "\n")
    if pause:
        time.sleep(pause)
    return text


def list_models(provider: str) -> list[str]:
    """Ask the provider which models this key can use, instead of guessing names."""
    if provider == "gemini":
        r = requests.get(f"{GEMINI_BASE}/models?pageSize=200",
                         headers={"x-goog-api-key": _key("GEMINI_API_KEY")}, timeout=60)
        r.raise_for_status()
        return sorted(m["name"].removeprefix("models/") for m in r.json().get("models", [])
                      if "generateContent" in m.get("supportedGenerationMethods", []))
    base, env = OPENAI_STYLE[provider]
    r = requests.get(f"{base}/models", headers={"Authorization": f"Bearer {_key(env)}"}, timeout=60)
    r.raise_for_status()
    return sorted(m["id"] for m in r.json().get("data", []))
