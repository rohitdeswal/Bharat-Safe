import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const voiceFiles = Object.freeze(['alarm','sos','allclear','test','guide_start','guide_quiet','guide_help','guide_end'].flatMap(line => [`${line}_en.mp3`, `${line}_hi.mp3`]));
const voiceDirectory = fileURLToPath(new URL('../public/voices/', import.meta.url));

export function createVoiceRouter({ directory = voiceDirectory } = {}) {
  const router = express.Router();
  router.get('/:filename', (req, res) => {
    const filename = req.params.filename;
    if (!voiceFiles.includes(filename)) return res.status(404).json({ error: 'Voice file not found' });
    const file = path.join(directory, filename);
    res.set('Cache-Control', 'public, max-age=86400');
    res.type('audio/mpeg').sendFile(file, error => {
      if (error && !res.headersSent) res.status(error.statusCode === 404 ? 404 : 500).end();
    });
  });
  return router;
}
