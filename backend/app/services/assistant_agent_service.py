from sqlalchemy.ext.asyncio import AsyncSession
from app.services.chat_memory_service import ChatMemoryService, ChatSessionService
from app.services.user_memory_service import UserMemoryService
from app.services.vector_store import search_segments
from app.services.nlp_service import generate_embeddings
from app.core.config import settings
import uuid
from app.services.llm_provider import GeminiProvider, ClaudeProvider, GEMINI_AVAILABLE, CLAUDE_AVAILABLE
import logging

logger = logging.getLogger(__name__)

class QueryRewriteService:
    @staticmethod
    async def rewrite(query: str, history: list[str]) -> str:
        """Rewrite query only if there's relevant history (skip for first message)."""
        # OPTIMIZATION: Skip rewriting if no history or very short history
        if len(history) <= 1:  # No previous context
            return query
            
        sys_msg = (
            "Rewrite this follow-up question to be standalone using chat history. Keep it short. "
            "Output ONLY the rewritten question."
        )
        # OPTIMIZATION: Reduce history to last 2-3 messages only
        recent_history = history[-3:] if len(history) > 3 else history
        prompt = f"History:\n" + "\n".join(recent_history) + f"\n\nQuestion: {query}"
        
        # Try Claude first (quick timeout)
        if CLAUDE_AVAILABLE and settings.ANTHROPIC_API_KEY:
            try:
                rewritten = await ClaudeProvider.rewrite_query(system_prompt=sys_msg, user_prompt=prompt)
                logger.info("Query rewritten using Claude")
                return rewritten.strip() if rewritten else query
            except Exception as e:
                logger.debug(f"Claude rewrite failed: {e}")
                return query  # Don't fallback to Gemini, just use original
        
        return query

class TranscriptRetrievalService:
    @staticmethod
    async def retrieve(db: AsyncSession, query_embedding: list[float], project_id: int | None = None, meeting_ids: list[int] | None = None):
        return await search_segments(db, query_embedding, limit=5, project_id=project_id, meeting_ids=meeting_ids)

class AnswerGenerationService:
    @staticmethod
    async def generate_answer(rewritten_query: str, history_text: list[str], context_segments: list, user_prefs: list[str], decisions: list = None, action_items: list = None, meeting_title: str = None) -> dict:
        citations = []
        combined_context = ""
        
        for idx, seg in enumerate(context_segments):
            # Try to find meeting details
            seg_meeting_title = seg.get("meeting_title", f"Meeting {seg.get('meeting_id')}")
            meeting_date = seg.get("meeting_date", "Unknown Date")
            speaker = seg.get("speaker_name", "Unknown") or "Unknown"
            snippet = seg.get("text", "")
            time_ref = seg.get("start_time", "00:00:00")
            
            citations.append({
                "meeting": seg_meeting_title,
                "date": meeting_date,
                "timestamp": time_ref,
                "speaker": speaker,
                "text_snippet": snippet[:100] + ("..." if len(snippet)>100 else "")
            })
            combined_context += f"- [Meeting: {seg_meeting_title}, {meeting_date}, {time_ref}] {speaker}: {snippet}\n"

        logger.info(f"DEBUG: generate_answer called. CLAUDE_AVAILABLE={CLAUDE_AVAILABLE}, SEGMENTS={len(context_segments)}")
        
        pref_str = "\n".join([f"- {p}" for p in user_prefs]) if user_prefs else "None"
        hist_str = "\n".join(history_text) if history_text else "None"
        
        # Build decisions and action items context if provided
        decisions_str = "None"
        if decisions:
            decisions_str = "\n".join([f"- {d.get('summary', '')} (Rationale: {d.get('rationale', 'N/A')})" for d in decisions[:5]])
        
        action_items_str = "None"
        if action_items:
            action_items_str = "\n".join([f"- {ai.get('task_description', '')} | Assignee: {ai.get('assignee', 'TBD')} | Due: {ai.get('due_date', 'No deadline')}" for ai in action_items[:5]])
        
        sys_msg = (
            "You are Meeting Intelligence Assistant, a concise and reliable personal assistant for meeting transcripts and general questions.\n\n"
            "Your job:\n"
            "- Answer the user's question using the uploaded meeting transcripts, the current chat history, and stored user memory.\n"
            "- For transcript-based questions: Use previous chat turns to resolve pronouns, follow-up questions, short references, and context-dependent requests.\n"
            "- For general questions: Provide helpful, accurate information from your training.\n"
            "- For meeting summary requests: Provide a brief overview of decisions, action items, and key discussions.\n"
            "- Prefer the most recent relevant conversation context when the user asks follow-up questions.\n"
            "- Retrieve and use transcript evidence before answering transcript-related queries.\n"
            "- Always stay grounded in the provided transcript excerpts and memory records when available.\n"
            "- If the answer is not supported by the available evidence, say so clearly and ask for clarification instead of guessing.\n\n"
            "Behavior rules:\n"
            "- Be concise and to the point.\n"
            "- Answer only what the user asked; do not add long explanations unless requested.\n"
            "- If the question is a follow-up, connect it to the prior chat context automatically.\n"
            "- When user asks about decisions or action items, prioritize the provided lists below.\n"
            "- If the user asks about a person, meeting, decision, action item, concern, or reasoning, identify the exact supporting transcript segment(s).\n"
            "- Use the stored memory only for stable user preferences and useful prior chat context.\n"
            "- Do not invent facts, dates, speakers, or decisions when referring to transcripts.\n"
            "- When evidence is weak, respond with \"I couldn't find enough support in the transcripts\" rather than hallucinating.\n\n"
            "Output format:\n"
            "1. Direct answer in 1–3 short sentences.\n"
            "2. If relevant, include citations in this format:\n"
            "   - [Meeting: <meeting title>, <date>, <timestamp>]\n"
            "3. If the answer depends on prior chat memory, mention that briefly.\n"
            "4. If multiple candidate answers exist, choose the one most supported by evidence and note ambiguity."
        )
        
        prompt = (
            f"USER MEMORY:\n{pref_str}\n\n"
            f"CHAT HISTORY:\n{hist_str}\n\n"
            f"KEY DECISIONS FROM MEETING:\n{decisions_str}\n\n"
            f"ACTION ITEMS FROM MEETING:\n{action_items_str}\n\n"
            f"TRANSCRIPT EVIDENCE:\n{combined_context if combined_context else 'No transcript evidence available.'}\n\n"
            f"QUESTION:\n{rewritten_query}"
        )

        # Try Claude ONLY (no Gemini fallback - free tier is exhausted)
        if CLAUDE_AVAILABLE and settings.ANTHROPIC_API_KEY:
            try:
                logger.info("Generating answer with Claude...")
                answer = await ClaudeProvider.generate_answer(system_prompt=sys_msg, user_prompt=prompt)
                return {
                    "answer": answer,
                    "citations": citations,
                    "mode": "claude"
                }
            except Exception as e:
                logger.error(f"Claude generation failed: {e}")
        
        # Enhanced offline fallback
        if not context_segments:
            return {
                "answer": "I couldn't find enough information to answer this question. Please provide more details or check your transcripts.",
                "citations": [],
                "mode": "offline_fallback"
            }
        
        # Build summary from available data
        summary_lines = ["Based on the available meeting data:\n"]
        
        if decisions:
            summary_lines.append("\n**Key Decisions:**\n")
            for d in decisions[:3]:
                summary_lines.append(f"• {d.get('summary', 'Unknown decision')}\n")
        
        if action_items:
            summary_lines.append("\n**Action Items:**\n")
            for ai in action_items[:3]:
                task = ai.get('task_description', 'Unknown')
                assignee = ai.get('assignee', 'Unassigned')
                summary_lines.append(f"• {task} (Assigned to: {assignee})\n")
        
        if context_segments:
            summary_lines.append("\n**Relevant Context:**\n")
            for seg in context_segments[:3]:
                speaker = seg.get("speaker_name", "Unknown")
                snippet = (seg.get("text", "") or "").strip()[:120]
                if snippet and snippet != "---":
                    summary_lines.append(f"• {speaker}: \"{snippet}...\"\n")
        
        fallback_answer = "".join(summary_lines)
        return {
            "answer": fallback_answer,
            "citations": citations,
            "mode": "offline_fallback"
        }

    @staticmethod
    async def prepare_stream_context(rewritten_query: str, history_text: list[str], context_segments: list, user_prefs: list[str], decisions: list = None, action_items: list = None) -> tuple:
        citations = []
        combined_context = ""
        
        for idx, seg in enumerate(context_segments):
            meeting_title = seg.get("meeting_title", f"Meeting {seg.get('meeting_id')}")
            meeting_date = seg.get("meeting_date", "Unknown Date")
            speaker = seg.get("speaker_name", "Unknown") or "Unknown"
            snippet = seg.get("text", "")
            time_ref = seg.get("start_time", "00:00:00")
            
            citations.append({
                "meeting": meeting_title,
                "date": meeting_date,
                "timestamp": time_ref,
                "speaker": speaker,
                "text_snippet": snippet[:100] + ("..." if len(snippet)>100 else "")
            })
            combined_context += f"- [Meeting: {meeting_title}, {meeting_date}, {time_ref}] {speaker}: {snippet}\n"

        pref_str = "\n".join([f"- {p}" for p in user_prefs]) if user_prefs else "None"
        hist_str = "\n".join(history_text) if history_text else "None"
        
        # Build decisions and action items context if provided
        decisions_str = "None"
        if decisions:
            decisions_str = "\n".join([f"- {d.get('summary', '')} (Rationale: {d.get('rationale', 'N/A')})" for d in decisions[:5]])
        
        action_items_str = "None"
        if action_items:
            action_items_str = "\n".join([f"- {ai.get('task_description', '')} | Assignee: {ai.get('assignee', 'TBD')} | Due: {ai.get('due_date', 'No deadline')}" for ai in action_items[:5]])
        
        sys_msg = (
            "You are Meeting Intelligence Assistant, a concise and reliable personal assistant for meeting transcripts and general questions.\n\n"
            "Your job:\n"
            "- Answer the user's question using the uploaded meeting transcripts, the current chat history, and stored user memory.\n"
            "- For transcript-based questions: Use previous chat turns to resolve pronouns, follow-up questions, short references, and context-dependent requests.\n"
            "- For general questions: Provide helpful, accurate information from your training.\n"
            "- For meeting summary requests: Provide a brief overview of decisions, action items, and key discussions.\n"
            "- Prefer the most recent relevant conversation context when the user asks follow-up questions.\n"
            "- Retrieve and use transcript evidence before answering transcript-related queries.\n"
            "- Always stay grounded in the provided transcript excerpts and memory records when available.\n"
            "- If the answer is not supported by the available evidence, say so clearly and ask for clarification instead of guessing.\n\n"
            "Behavior rules:\n"
            "- Be concise and to the point.\n"
            "- Answer only what the user asked; do not add long explanations unless requested.\n"
            "- If the question is a follow-up, connect it to the prior chat context automatically.\n"
            "- When user asks about decisions or action items, prioritize the provided lists below.\n"
            "- If the user asks about a person, meeting, decision, action item, concern, or reasoning, identify the exact supporting transcript segment(s).\n"
            "- Use the stored memory only for stable user preferences and useful prior chat context.\n"
            "- Do not invent facts, dates, speakers, or decisions when referring to transcripts.\n"
            "- When evidence is weak, respond with \"I couldn't find enough support in the transcripts\" rather than hallucinating.\n\n"
            "Output format:\n"
            "1. Direct answer in 1–3 short sentences.\n"
            "2. If relevant, include citations in this format:\n"
            "   - [Meeting: <meeting title>, <date>, <timestamp>]\n"
            "3. If the answer depends on prior chat memory, mention that briefly.\n"
            "4. If multiple candidate answers exist, choose the one most supported by evidence and note ambiguity."
        )
        
        prompt = (
            f"USER MEMORY:\n{pref_str}\n\n"
            f"CHAT HISTORY:\n{hist_str}\n\n"
            f"KEY DECISIONS FROM MEETING:\n{decisions_str}\n\n"
            f"ACTION ITEMS FROM MEETING:\n{action_items_str}\n\n"
            f"TRANSCRIPT EVIDENCE:\n{combined_context if combined_context else 'No transcript evidence available.'}\n\n"
            f"QUESTION:\n{rewritten_query}"
        )
        
        return sys_msg, prompt, citations

class AssistantAgentService:
    @staticmethod
    async def process_chat(db: AsyncSession, session_id: str, message: str, project_id: int | None = None, meeting_ids: list[int] | None = None) -> dict:
        print("\n\n" + "!"*80 + "\n" + "DEBUG: process_chat ACTIVE" + "\n" + "!"*80 + "\n\n", flush=True)
        # Step 1: Load chat memory
        session_id = str(session_id)
        session = await ChatSessionService.get_session(db, session_id)
        if not session:
            raise ValueError(f"Session not found for ID: {session_id}")

        # Get history (limit N turns)
        history_msgs = await ChatMemoryService.get_history(db, session_id, limit=6)
        history_text = [f"{m.role}: {m.content}" for m in history_msgs]
        
        # Step 2: Load user memory
        prefs = await UserMemoryService.get_memories(db, session.user_id)
        pref_texts = [p.content for p in prefs]

        # Step 3: Rewrite the query
        rewritten = await QueryRewriteService.rewrite(message, history_text)

        # Step 4: Retrieve transcript evidence
        emb = await generate_embeddings(rewritten)
        segments = await search_segments(db, emb, project_id=project_id, meeting_ids=meeting_ids)

        # Step 5: Generate answer
        result = await AnswerGenerationService.generate_answer(rewritten, history_text, segments, pref_texts)
        
        # Step 6: Save turn (user first, then assistant)
        await ChatMemoryService.add_message(db, session_id, "user", message)
        await ChatMemoryService.add_message(db, session_id, "assistant", result["answer"])
        
        return result

    @staticmethod
    async def process_chat_stream(db: AsyncSession, session_id: str, message: str, project_id: int | None = None, meeting_ids: list[int] | None = None):
        logger.info(f"DEBUG: process_chat_stream for session {session_id}")
        
        # 1. Load session immediately and yield "thinking" message
        session_id = str(session_id)
        session = await ChatSessionService.get_session(db, session_id)
        if not session:
            # Session lost (e.g. DB reset) — auto-recreate with same ID so frontend continues working
            logger.warning(f"Session {session_id} not found, auto-recreating...")
            from app.models.domain import ChatSession
            session = ChatSession(id=session_id, user_id="00000000-0000-0000-0000-000000000001",
                                  project_id=project_id, meeting_id=(meeting_ids[0] if meeting_ids else None))
            db.add(session)
            await db.commit()
            await db.refresh(session)

        # OPTIMIZATION: Yield "thinking" metadata immediately so UI shows instant feedback
        yield {
            "type": "metadata",
            "citations": [],  # Empty initially, will update later
            "rewritten_query": message,
            "mode": "thinking",  # Signal UI to show "Analyzing your question..."
            "is_initial": True
        }

        # 2. Do preprocessing in parallel (history, rewrite, embed, search)
        history_msgs = await ChatMemoryService.get_history(db, session_id, limit=6)
        history_text = [f"{m.role}: {m.content}" for m in history_msgs]
        prefs = await UserMemoryService.get_memories(db, session.user_id)
        pref_texts = [p.content for p in prefs]

        rewritten = await QueryRewriteService.rewrite(message, history_text)
        emb = await generate_embeddings(rewritten)
        segments = await search_segments(db, emb, project_id=project_id, meeting_ids=meeting_ids)

        # Fetch decisions and action items for context
        from sqlalchemy.future import select
        from app.models.domain import Decision, ActionItem
        
        decisions = []
        action_items = []
        
        # Get meeting IDs to fetch relevant decisions and action items
        relevant_meeting_ids = set()
        for seg in segments:
            if seg.get("meeting_id"):
                relevant_meeting_ids.add(seg.get("meeting_id"))
        
        if relevant_meeting_ids:
            # Fetch decisions for these meetings
            decisions_query = select(Decision).where(Decision.meeting_id.in_(list(relevant_meeting_ids)))
            decisions_result = await db.execute(decisions_query)
            decisions = [{"summary": d.summary, "rationale": d.rationale} for d in decisions_result.scalars().all()]
            
            # Fetch action items for these meetings
            action_items_query = select(ActionItem).where(ActionItem.meeting_id.in_(list(relevant_meeting_ids)))
            action_items_result = await db.execute(action_items_query)
            action_items = [{"task_description": ai.task_description, "assignee": ai.assignee, "due_date": ai.due_date} for ai in action_items_result.scalars().all()]

        sys_msg, prompt, citations = await AnswerGenerationService.prepare_stream_context(rewritten, history_text, segments, pref_texts, decisions, action_items)

        # 3. Yield updated metadata with actual citations from search results
        yield {
            "type": "metadata",
            "citations": citations,
            "rewritten_query": rewritten,
            "mode": "claude" if (CLAUDE_AVAILABLE and settings.ANTHROPIC_API_KEY) else ("gemini" if (GEMINI_AVAILABLE and settings.GEMINI_API_KEY) else "offline_fallback"),
            "is_initial": False
        }

        # 4. Stream from Claude, then enhanced offline fallback (NO Gemini - free tier quota exhausted)
        full_answer = ""
        provider_failed = False

        # Try Claude ONLY (primary provider)
        if CLAUDE_AVAILABLE and settings.ANTHROPIC_API_KEY:
            try:
                logger.info("Streaming answer from Claude...")
                async for chunk in ClaudeProvider.generate_answer_stream(sys_msg, prompt):
                    full_answer += chunk
                    yield {"type": "delta", "text": chunk}
                logger.info("Claude streaming completed successfully")
            except Exception as e:
                logger.error(f"Claude stream failed: {e}")
                provider_failed = True

        # If Claude fails, use enhanced offline fallback with actual meeting data
        if not full_answer:
            logger.info("Using enhanced offline fallback with meeting summaries and action items")
            
            # Build better fallback response using decisions and action items
            fallback_lines = []
            
            # Add helpful message based on what we know
            if action_items or decisions:
                if message.lower().find("summary") >= 0 or message.lower().find("action") >= 0 or message.lower().find("decision") >= 0:
                    # User asked about summary, actions, or decisions - provide them directly
                    fallback_lines.append("Based on the meeting data:\n")
                    
                    if decisions:
                        fallback_lines.append("\n**Key Decisions Made:**\n")
                        for d in decisions[:3]:
                            decision_summary = d.get('summary', 'Unknown decision')
                            fallback_lines.append(f"• {decision_summary}\n")
                    
                    if action_items:
                        fallback_lines.append("\n**Action Items:**\n")
                        for ai in action_items[:3]:
                            task = ai.get('task_description', 'Unknown task')
                            assignee = ai.get('assignee') or 'Unassigned'
                            due_date = ai.get('due_date') or 'No deadline'
                            fallback_lines.append(f"• {task} (Assigned to: {assignee}, Due: {due_date})\n")
                else:
                    # General fallback
                    fallback_lines.append("I'm processing your question using available meeting data.\n\n")
                    fallback_lines.append("**Meeting Summary:**\n")
                    if decisions:
                        fallback_lines.append(f"• {len(decisions)} decision(s) recorded\n")
                    if action_items:
                        fallback_lines.append(f"• {len(action_items)} action item(s) tracked\n")
                    fallback_lines.append(f"• {len(segments)} relevant transcript segments found\n\n")
                    
                    if segments:
                        fallback_lines.append("**Relevant Excerpts:**\n")
                        for i, seg in enumerate(segments[:3]):
                            speaker = seg.get("speaker_name") or "Unknown"
                            text_snip = (seg.get("text") or "").strip()[:150]
                            meeting = seg.get("meeting_title") or f"Meeting {seg.get('meeting_id')}"
                            ts = seg.get("start_time") or ""
                            
                            if text_snip and text_snip != "---":
                                ts_str = f" [{ts}]" if ts else ""
                                fallback_lines.append(f"\n• **{meeting}**{ts_str} — {speaker}: \"{text_snip}...\"\n")
            else:
                # No decisions or action items - show transcript context
                fallback_lines.append("Based on the available transcripts:\n\n")
                if segments:
                    for i, seg in enumerate(segments[:3]):
                        speaker = seg.get("speaker_name") or "Unknown"
                        text_snip = (seg.get("text") or "").strip()[:150]
                        meeting = seg.get("meeting_title") or f"Meeting {seg.get('meeting_id')}"
                        ts = seg.get("start_time") or ""
                        
                        if text_snip and text_snip != "---":
                            ts_str = f" [{ts}]" if ts else ""
                            fallback_lines.append(f"• **{meeting}**{ts_str} — {speaker}: \"{text_snip}...\"\n")
                else:
                    fallback_lines.append("Please provide more details for better results.\n")

            fallback_text = "".join(fallback_lines)
            
            # Stream the fallback response word by word
            for word in fallback_text.split(" "):
                chunk = word + " "
                full_answer += chunk
                yield {"type": "delta", "text": chunk}

        # 4. Save final message to DB
        if full_answer:
            await ChatMemoryService.add_message(db, session_id, "user", message)
            await ChatMemoryService.add_message(db, session_id, "assistant", full_answer)

        yield {"type": "done"}
