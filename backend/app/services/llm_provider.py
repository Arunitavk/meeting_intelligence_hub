import logging
import asyncio
from app.core.config import settings
import json

logger = logging.getLogger(__name__)

# Claude SDK
try:
    from anthropic import Anthropic, AsyncAnthropic
    CLAUDE_AVAILABLE = True
except ImportError:
    CLAUDE_AVAILABLE = False
    logger.warning("anthropic SDK not installed.")

# Gemini SDK
try:
    from google import genai
    from google.genai import types
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    logger.warning("google-genai SDK not installed. Will fallback to offline modes.")

# Ordered model fallback chain — tries Gemini models
MODEL_FALLBACK_CHAIN = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
    "gemini-2.5-flash",
]

CLAUDE_MODEL = "claude-3-5-sonnet-20241022"


class ClaudeProvider:
    """Anthropic Claude provider for chat and streaming."""

    @staticmethod
    def _get_client():
        if not CLAUDE_AVAILABLE or not settings.ANTHROPIC_API_KEY:
            return None
        return AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    @staticmethod
    async def generate_answer(system_prompt: str, user_prompt: str) -> str:
        """Generate answer using Claude."""
        client = ClaudeProvider._get_client()
        if not client:
            raise Exception("Claude client unavailable. Check ANTHROPIC_API_KEY.")

        logger.info(f"Calling Claude ({CLAUDE_MODEL}) for answer generation...")
        try:
            message = await client.messages.create(
                model=CLAUDE_MODEL,
                max_tokens=1024,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}]
            )
            return message.content[0].text
        except Exception as e:
            logger.error(f"Claude generation error: {e}", exc_info=True)
            raise

    @staticmethod
    async def generate_answer_stream(system_prompt: str, user_prompt: str):
        """Stream answer generation using Claude."""
        client = ClaudeProvider._get_client()
        if not client:
            raise Exception("Claude client unavailable.")

        logger.info(f"Starting Claude ({CLAUDE_MODEL}) streaming...")
        try:
            with client.messages.stream(
                model=CLAUDE_MODEL,
                max_tokens=1024,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}]
            ) as stream:
                for text in stream.text_stream:
                    yield text
        except Exception as e:
            logger.error(f"Claude stream error: {e}", exc_info=True)
            raise

    @staticmethod
    async def rewrite_query(system_prompt: str, user_prompt: str) -> str:
        """Rewrite query using Claude."""
        client = ClaudeProvider._get_client()
        if not client:
            raise Exception("Claude client unavailable.")

        try:
            message = await client.messages.create(
                model=CLAUDE_MODEL,
                max_tokens=256,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}]
            )
            return message.content[0].text.strip()
        except Exception as e:
            logger.error(f"Claude rewrite error: {e}", exc_info=True)
            raise



async def _call_with_retry(coro_fn, max_retries: int = 2, base_delay: float = 65.0):
    """Call an async coroutine with retry on 429 quota errors.
    The Gemini free tier resets per-minute; 65s covers the full window."""
    last_exc = None
    for attempt in range(max_retries + 1):
        try:
            return await coro_fn()
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
                if attempt < max_retries:
                    logger.warning(f"Gemini 429 quota hit, retrying in {base_delay}s (attempt {attempt+1}/{max_retries})")
                    await asyncio.sleep(base_delay)
                    last_exc = e
                    continue
            raise e
    raise last_exc


class GeminiProvider:
    @staticmethod
    def _get_client():
        if not GEMINI_AVAILABLE or not settings.GEMINI_API_KEY:
            return None
        return genai.Client(api_key=settings.GEMINI_API_KEY)

    @staticmethod
    async def _try_models_generate(client, contents, config: "types.GenerateContentConfig"):
        """Try the model fallback chain for a non-streaming generate_content call."""
        last_exc = None
        for model in MODEL_FALLBACK_CHAIN:
            try:
                async def _do(m=model):
                    return await client.aio.models.generate_content(
                        model=m, contents=contents, config=config
                    )
                response = await _call_with_retry(_do)
                logger.info(f"Gemini model used: {model}")
                return response
            except Exception as e:
                err_str = str(e)
                if "404" in err_str or "NOT_FOUND" in err_str:
                    logger.warning(f"Model {model} not found, trying next...")
                    last_exc = e
                    continue
                raise e
        raise last_exc or Exception("All Gemini models failed")

    @staticmethod
    async def generate_answer(system_prompt: str, user_prompt: str) -> str:
        client = GeminiProvider._get_client()
        if not client:
            raise Exception("Gemini client unavailable")

        logger.info("Calling Gemini for answer generation...")
        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.4
        )
        response = await GeminiProvider._try_models_generate(client, user_prompt, config)
        return response.text

    @staticmethod
    async def generate_answer_stream(system_prompt: str, user_prompt: str):
        client = GeminiProvider._get_client()
        if not client:
            raise Exception("Gemini client unavailable")

        logger.info("Starting Gemini streaming...")
        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.4
        )
        # Try model chain for streaming
        last_exc = None
        for model in MODEL_FALLBACK_CHAIN:
            try:
                async def _stream(m=model):
                    return await client.aio.models.generate_content_stream(
                        model=m, contents=user_prompt, config=config
                    )
                # Try once; if 429, retry with backoff
                for attempt in range(3):
                    try:
                        stream = await _stream()
                        async for chunk in stream:
                            if chunk.text:
                                yield chunk.text
                        return  # success
                    except Exception as e:
                        err_str = str(e)
                        if ("429" in err_str or "RESOURCE_EXHAUSTED" in err_str) and attempt < 2:
                            wait = 5.0 * (2 ** attempt)
                            logger.warning(f"Gemini stream 429 on {model}, retrying in {wait}s")
                            await asyncio.sleep(wait)
                            continue
                        raise e
            except Exception as e:
                err_str = str(e)
                if "404" in err_str or "NOT_FOUND" in err_str:
                    logger.warning(f"Stream model {model} not found, trying next...")
                    last_exc = e
                    continue
                raise e
        raise last_exc or Exception("All Gemini streaming models failed")

    @staticmethod
    async def rewrite_query(system_prompt: str, user_prompt: str) -> str:
        client = GeminiProvider._get_client()
        if not client:
            raise Exception("Gemini client unavailable")

        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.3
        )
        try:
            response = await GeminiProvider._try_models_generate(client, user_prompt, config)
            return response.text
        except Exception as e:
            logger.error(f"Gemini rewrite error: {e}")
            raise e

    @staticmethod
    async def extract_decisions_actions(system_prompt: str, text: str) -> dict:
        client = GeminiProvider._get_client()
        if not client:
            raise Exception("Gemini client unavailable")

        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            response_mime_type="application/json",
            temperature=0.1
        )
        try:
            response = await GeminiProvider._try_models_generate(client, text, config)
            return json.loads(response.text)
        except Exception as e:
            logger.error(f"Gemini extraction error: {e}")
            raise e

    @staticmethod
    async def generate_embeddings(text: str) -> list[float]:
        client = GeminiProvider._get_client()
        if not client:
            raise Exception("Gemini client unavailable")

        try:
            async def _do():
                return await client.aio.models.embed_content(
                    model="text-embedding-004",
                    contents=text
                )
            response = await _call_with_retry(_do)
            if response.embeddings and len(response.embeddings) > 0:
                return list(response.embeddings[0].values)
            raise Exception("Empty embedding response")
        except Exception as e:
            logger.error(f"Gemini embedding error: {e}")
            raise e

    @staticmethod
    async def analyze_sentiment_batch(system_prompt: str, user_prompt: str) -> list:
        client = GeminiProvider._get_client()
        if not client:
            raise Exception("Gemini client unavailable")

        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            response_mime_type="application/json",
            temperature=0.1
        )
        try:
            response = await GeminiProvider._try_models_generate(client, user_prompt, config)
            return json.loads(response.text)
        except Exception as e:
            logger.error(f"Gemini sentiment batch error: {e}")
            raise e
