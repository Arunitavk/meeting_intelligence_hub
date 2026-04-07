from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Float, Boolean, func, JSON
from sqlalchemy.orm import relationship
from app.database import Base
import datetime
import uuid

class SentimentJob(Base):
    __tablename__ = "sentiment_jobs"
    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id"), unique=True)
    status = Column(String, default="pending") # pending, running, done, error
    error_msg = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    
    meeting = relationship("Meeting", back_populates="sentiment_job")

class SpeakerStat(Base):
    __tablename__ = "speaker_stats"
    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id"))
    speaker_name = Column(String, nullable=False)
    speaker_role = Column(String, nullable=True)
    talk_time_pct = Column(Float, default=0.0)
    sentiment_shift = Column(Float, default=0.0)
    avg_sentiment = Column(Float, default=0.0)
    dominant_label = Column(String, nullable=True)
    avatar_initials = Column(String, nullable=True)
    
    meeting = relationship("Meeting", back_populates="speaker_stats")

class ChatSession(Base):
    __tablename__ = "chat_sessions"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    user_id = Column(String, index=True, nullable=False) # mock UUID for auth layer
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    session_id = Column(String, ForeignKey("chat_sessions.id"), nullable=False)
    role = Column(String, nullable=False) # 'user' or 'assistant'
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class UserMemory(Base):
    __tablename__ = "user_memories"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    user_id = Column(String, index=True, nullable=False)
    memory_type = Column(String, nullable=False) # e.g. 'preference', 'fact'
    content = Column(Text, nullable=False)
    confidence = Column(Float, default=1.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    meetings = relationship("Meeting", back_populates="project")

class Meeting(Base):
    __tablename__ = "meetings"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    title = Column(String, nullable=False)
    date = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    overall_sentiment = Column(Float, nullable=True)
    
    project = relationship("Project", back_populates="meetings")
    files = relationship("TranscriptFile", back_populates="meeting")
    segments = relationship("TranscriptSegment", back_populates="meeting")
    decisions = relationship("Decision", back_populates="meeting")
    action_items = relationship("ActionItem", back_populates="meeting")
    sentiment_job = relationship("SentimentJob", back_populates="meeting", uselist=False)
    speaker_stats = relationship("SpeakerStat", back_populates="meeting")

class TranscriptFile(Base):
    __tablename__ = "transcript_files"
    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id"))
    filename = Column(String, nullable=False)
    file_type = Column(String, nullable=False) # 'txt' or 'vtt'
    word_count = Column(Integer, default=0)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())
    
    meeting = relationship("Meeting", back_populates="files")

class Speaker(Base):
    __tablename__ = "speakers"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True, index=True)

class TranscriptSegment(Base):
    __tablename__ = "transcript_segments"
    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id"))
    speaker_name = Column(String, nullable=True)
    text = Column(Text, nullable=False)
    start_time = Column(String, nullable=True)
    end_time = Column(String, nullable=True)
    embedding = Column(JSON) # Storing 1536-dim list as JSON string/object in SQLite
    sentiment_score = Column(Float, nullable=True)
    sentiment_label = Column(String, nullable=True) # positive, negative, neutral, conflict, enthusiasm, etc.
    excerpt = Column(Text, nullable=True)
    
    meeting = relationship("Meeting", back_populates="segments")

class Decision(Base):
    __tablename__ = "decisions"
    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id"))
    summary = Column(String, nullable=False)
    rationale = Column(Text, nullable=True)
    time_reference = Column(String, nullable=True)
    speakers = Column(String, nullable=True)
    
    meeting = relationship("Meeting", back_populates="decisions")

class ActionItem(Base):
    __tablename__ = "action_items"
    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id"))
    assignee = Column(String, nullable=True)
    task_description = Column(String, nullable=False)
    due_date = Column(String, nullable=True)
    status = Column(String, default="Not Started")
    
    meeting = relationship("Meeting", back_populates="action_items")
