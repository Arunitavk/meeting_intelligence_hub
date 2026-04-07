import { Router } from 'express';
import multer from 'multer';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ingestTranscript, listMeetings, deleteMeeting } from '../services/transcriptService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = join(__dirname, '..', 'uploads');

const router = Router();

// Configure multer: disk storage, 10 MB limit, only .txt and .vtt
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    // Prefix with timestamp to avoid collisions
    cb(null, `${Date.now()}_${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/\.(txt|vtt)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.originalname}. Only .txt and .vtt are allowed.`));
    }
  },
});

/**
 * POST /api/upload
 * Body: multipart/form-data with one or more files under the field name "transcripts"
 * Response: { meetings: [{ id, name, date, speakers, wordCount, chunkCount }] }
 */
router.post('/', upload.array('transcripts', 20), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded.' });
  }

  const results = [];
  const errors = [];

  for (const file of req.files) {
    try {
      const meeting = ingestTranscript(file.path, file.originalname);
      results.push(meeting);
    } catch (err) {
      errors.push({ file: file.originalname, error: err.message });
    }
  }

  res.json({ meetings: results, errors });
});

/**
 * GET /api/upload/meetings
 * Returns all uploaded meetings (metadata only, no chunk content).
 */
router.get('/meetings', (req, res) => {
  try {
    res.json({ meetings: listMeetings() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/upload/meetings/:id
 * Deletes a meeting and all its chunks.
 */
router.delete('/meetings/:id', (req, res) => {
  try {
    deleteMeeting(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Multer error handler (file type / size)
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message.startsWith('Unsupported')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

export default router;
