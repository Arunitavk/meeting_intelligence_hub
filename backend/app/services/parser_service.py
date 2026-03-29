import webvtt
import io
import re
import PyPDF2

def parse_pdf(content_bytes: bytes):
    """Parses a PDF file by extracting text and falling back to txt parser logic."""
    f = io.BytesIO(content_bytes)
    text = ""
    try:
        reader = PyPDF2.PdfReader(f)
        for page in reader.pages:
            extracted = page.extract_text()
            if extracted:
                text += extracted + "\n"
    except Exception as e:
        print(f"Error parsing PDF: {e}")
    return parse_txt(text)

def parse_vtt(content: str):
    """Parses a VTT file and returns a list of segments."""
    segments = []
    # Write string to a file-like object because webvtt-py reads files
    f = io.StringIO(content)
    try:
        for caption in webvtt.read_buffer(f):
            text = caption.text.replace("\n", " ").strip()
            # Simple speaker extraction if format is "Speaker Name: text"
            speaker = None
            if ": " in text:
                parts = text.split(": ", 1)
                # Naive heuristic to ensure it's a name, not just part of a phrase with a colon
                if len(parts[0].split()) <= 3: 
                    speaker = parts[0]
                    text = parts[1]
            segments.append({
                "start_time": caption.start,
                "end_time": caption.end,
                "text": text,
                "speaker": speaker
            })
    except Exception as e:
        print(f"Error parsing VTT: {e}")
    return segments

def parse_txt(content: str):
    """Parses a plain TXT file by splitting into paragraphs/lines."""
    segments = []
    lines = content.split('\n')
    for line in lines:
        line = line.strip()
        if not line:
            continue
        speaker = None
        # Basic heuristic for TXT speaker names e.g. "John:" or "John Doe:"
        if ": " in line:
            parts = line.split(": ", 1)
            if len(parts[0].split()) <= 3:
                speaker = parts[0]
                line = parts[1]
        segments.append({
            "start_time": None,
            "end_time": None,
            "text": line,
            "speaker": speaker
        })
    return segments
