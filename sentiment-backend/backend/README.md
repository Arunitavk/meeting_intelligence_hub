# Meeting Intelligence — Backend

## Setup

```bash
cp .env.example .env        # fill in your ANTHROPIC_API_KEY
npm install
npm run dev                 # starts with --watch (auto-restarts on change)
```

---

## API Reference

### POST /api/upload
Upload one or more transcripts.

```
Content-Type: multipart/form-data
Field name:   transcripts  (multiple files allowed)
Formats:      .txt  .vtt
```

Response:
```json
{
  "meetings": [{ "id": "...", "name": "...", "date": "...", "chunkCount": 12 }],
  "errors":   []
}
```

---

### GET /api/upload/meetings
Returns all uploaded meetings.

---

### DELETE /api/upload/meetings/:id
Deletes a meeting and all its transcript chunks.

---

### POST /api/chat
Streams a chatbot response as Server-Sent Events.

Body:
```json
{ "message": "What decisions were made?", "sessionId": "abc-123" }
```

Response: `text/event-stream`
```
data: {"type":"delta","text":"Based on "}
data: {"type":"delta","text":"the transcripts..."}
data: {"type":"done"}
```

---

### GET /api/chat/history?sessionId=abc-123
Returns full chat history for a session.

---

## Frontend Integration

### 1. Generate and persist a sessionId
```js
// Run once on app load, persist across page refreshes
const sessionId = localStorage.getItem('sessionId') ?? (() => {
  const id = crypto.randomUUID();
  localStorage.setItem('sessionId', id);
  return id;
})();
```

### 2. Send a chat message and stream the response
SSE requires a GET request natively, but we need POST (to send a body).
Use `fetch()` with a `ReadableStream` reader instead:

```js
async function sendMessage(userMessage, onDelta, onDone) {
  const res = await fetch('http://localhost:3001/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: userMessage, sessionId }),
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line in buffer

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const event = JSON.parse(line.slice(6));
      if (event.type === 'delta') onDelta(event.text);
      if (event.type === 'done')  onDone();
      if (event.type === 'error') console.error(event.message);
    }
  }
}
```

### 3. Upload transcripts
```js
async function uploadFiles(fileList) {
  const form = new FormData();
  for (const file of fileList) form.append('transcripts', file);

  const res = await fetch('http://localhost:3001/api/upload', {
    method: 'POST',
    body: form,
  });
  return res.json(); // { meetings, errors }
}
```

### 4. Load chat history on page reload
```js
async function loadHistory() {
  const res = await fetch(`http://localhost:3001/api/chat/history?sessionId=${sessionId}`);
  const { history } = await res.json();
  // history: [{ role, content, created_at }]
  return history;
}
```

---

## Upgrading to semantic search (optional)

Replace the `scoreChunk()` function in `services/contextService.js` with:

1. On ingest: generate an embedding for each chunk → store as a BLOB or in a vector DB.
2. On query: generate an embedding for the user question → cosine-similarity against all chunk embeddings → return top-K.

Good options: `@xenova/transformers` (local, free), OpenAI `text-embedding-3-small`, or Cohere Embed.
