import { asyncHandler } from '../utils/asyncHandler.js';
import * as voice from '../services/voiceService.js';

export const listForSubmission = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await voice.listVoiceRecordings(req.params.id, req.user) });
});

export const create = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await voice.createVoiceRecording(req.params.id, req.body, req.user, req) });
});

export const update = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await voice.updateVoiceRecording(req.params.id, req.body, req.user, req) });
});

export const uploadAudio = asyncHandler(async (req, res) => {
  const asChunk = String(req.body?.asChunk || '') === 'true';
  const chunkIndex = Number(req.body?.chunkIndex || 0);
  const durationMs = req.body?.durationMs != null ? Number(req.body.durationMs) : undefined;
  res.json({
    success: true,
    data: await voice.saveVoiceAudio(req.params.id, req.file, req.user, req, { asChunk, chunkIndex, durationMs }),
  });
});

export const playAudio = asyncHandler(async (req, res) => {
  const file = await voice.readVoiceAudio(req.params.id, req.user, req);
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${file.filename}"`);
  res.send(file.buffer);
});

export const realtimeSession = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await voice.createRealtimeSession(req.user) });
});
