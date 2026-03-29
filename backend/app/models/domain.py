from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Float, Boolean, func
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from app.database import Base
import datetime

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
    embedding = Column(Vector(1536)) # Assuming 1536 dimensions for OpenAI-like embeddings
    sentiment_score = Column(Float, nullable=True)
    sentiment_label = Column(String, nullable=True) # positive, negative, neutral, conflict, enthusiasm
    
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
