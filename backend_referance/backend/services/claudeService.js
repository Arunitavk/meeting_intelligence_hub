import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 1024;

/**
 * Stream a response from Claude to an Express response object using SSE.
 *
 * The caller is responsible for setting the correct SSE headers before calling this.
 * Events emitted:
 *   data: { type: 'delta', text: '...' }   — each streamed token
 *   data: { type: 'done' }                  — stream complete
 *   data: { type: 'error', message: '...' } — error
 *
 * @param {string} systemPrompt  - full system prompt with context
 * @param {Array}  messages      - [{role, content}] — history + current user message
 * @param {object} res           - Express response with SSE headers already set
 * @returns {string}             - the full assistant reply (for saving to DB)
 */
export async function streamChat(systemPrompt, messages, res) {
  let fullReply = '';

  const stream = await client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages,
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      const text = event.delta.text;
      fullReply += text;
      // SSE format: each line must start with "data: " and end with \n\n
      res.write(`data: ${JSON.stringify({ type: 'delta', text })}\n\n`);
    }
  }

  res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  return fullReply;
}
