import path from 'path';
import { VoiceRecording } from '../models/VoiceRecording.js';
import { ApiError } from '../utils/ApiError.js';
import { getStorage } from '../storage/index.js';
import { assertAssignedDoctor, getSubmissionForActor } from './accessService.js';
import { writeAudit } from './auditService.js';
import { AUDIT, ROLES } from '../constants/index.js';
import { env } from '../config/env.js';

const AUDIO_EXTENSIONS = new Set(['webm', 'wav', 'mp3', 'ogg', 'm4a', 'mp4', 'aac']);

function extensionOf(filename = '', mimeType = '') {
  const fromName = path.extname(String(filename)).replace('.', '').toLowerCase();
  if (AUDIO_EXTENSIONS.has(fromName)) return fromName;
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
  return 'webm';
}

function present(recording, actor) {
  const canEdit = actor?.role === ROLES.DOCTOR && String(recording.doctor) === String(actor._id);
  return {
    id: recording._id,
    submissionId: recording.submission,
    patientId: recording.patient,
    patientCode: recording.patientCode,
    patientName: recording.patientName,
    doctorId: recording.doctor,
    doctorName: recording.doctorName,
    departmentCode: recording.departmentCode,
    status: recording.status,
    mimeType: recording.mimeType,
    size: recording.size,
    durationMs: recording.durationMs,
    transcript: recording.transcript,
    transcriptDraft: recording.transcriptDraft,
    transcriptionProvider: recording.transcriptionProvider,
    chunkCount: recording.chunks?.length || 0,
    hasAudio: Boolean(recording.storageKey),
    clientSessionId: recording.clientSessionId || '',
    lastAutosavedAt: recording.lastAutosavedAt,
    error: recording.error || '',
    canEdit,
    createdAt: recording.createdAt,
    updatedAt: recording.updatedAt,
  };
}

export async function listVoiceRecordings(submissionId, actor) {
  const submission = await getSubmissionForActor(actor, submissionId);
  if (actor.role === ROLES.CLINIC_MANAGER) return [];
  const items = await VoiceRecording.find({ submission: submission._id, isDeleted: false }).sort({ createdAt: -1 });
  return items.map((item) => present(item, actor));
}

export async function createVoiceRecording(submissionId, input, actor, req) {
  const submission = await getSubmissionForActor(actor, submissionId);
  assertAssignedDoctor(actor, submission);
  if (input.clientSessionId) {
    const existing = await VoiceRecording.findOne({
      submission: submission._id,
      doctor: actor._id,
      clientSessionId: input.clientSessionId,
      isDeleted: false,
    });
    if (existing) return present(existing, actor);
  }
  const recording = await VoiceRecording.create({
    submission: submission._id,
    patient: submission.patient,
    doctor: actor._id,
    doctorName: actor.fullName,
    patientCode: submission.patientCode,
    patientName: submission.patientName,
    departmentCode: submission.departmentCode,
    status: input.status || 'recording',
    mimeType: input.mimeType || 'audio/webm',
    transcriptDraft: input.transcriptDraft || '',
    transcriptionProvider: input.transcriptionProvider || '',
    clientSessionId: input.clientSessionId || '',
    durationMs: input.durationMs || 0,
    lastAutosavedAt: new Date(),
  });
  await writeAudit({
    actor,
    action: AUDIT.VOICE_RECORDING_STARTED,
    entityType: 'VoiceRecording',
    entityId: recording._id,
    newValue: { submissionId: submission._id, patientCode: submission.patientCode },
    req,
  });
  return present(recording, actor);
}

export async function updateVoiceRecording(id, input, actor, req) {
  const recording = await VoiceRecording.findOne({ _id: id, isDeleted: false });
  if (!recording) throw new ApiError(404, 'Voice recording not found');
  const submission = await getSubmissionForActor(actor, recording.submission);
  assertAssignedDoctor(actor, submission);
  if (String(recording.doctor) !== String(actor._id)) {
    throw new ApiError(403, 'Only the recording doctor can update this recording');
  }
  if (input.status) recording.status = input.status;
  if (input.durationMs != null) recording.durationMs = Math.max(0, Number(input.durationMs) || 0);
  if (input.transcriptDraft != null) recording.transcriptDraft = String(input.transcriptDraft);
  if (input.transcript != null) recording.transcript = String(input.transcript);
  if (input.transcriptionProvider != null) recording.transcriptionProvider = String(input.transcriptionProvider);
  if (input.error != null) recording.error = String(input.error).slice(0, 500);
  if (input.finalizeTranscript) {
    recording.transcript = recording.transcriptDraft || recording.transcript;
  }
  recording.lastAutosavedAt = new Date();
  await recording.save();
  await writeAudit({
    actor,
    action: AUDIT.VOICE_RECORDING_UPDATED,
    entityType: 'VoiceRecording',
    entityId: recording._id,
    newValue: { status: recording.status, durationMs: recording.durationMs },
    req,
  });
  return present(recording, actor);
}

export async function saveVoiceAudio(id, file, actor, req, { asChunk = false, chunkIndex = 0, durationMs } = {}) {
  const recording = await VoiceRecording.findOne({ _id: id, isDeleted: false });
  if (!recording) throw new ApiError(404, 'Voice recording not found');
  const submission = await getSubmissionForActor(actor, recording.submission);
  assertAssignedDoctor(actor, submission);
  if (String(recording.doctor) !== String(actor._id)) {
    throw new ApiError(403, 'Only the recording doctor can upload audio');
  }
  if (!file?.buffer?.length) throw new ApiError(400, 'Audio file is required');
  const extension = extensionOf(file.originalname, file.mimetype);
  if (!AUDIO_EXTENSIONS.has(extension)) throw new ApiError(400, 'Unsupported audio format');
  recording.status = 'uploading';
  await recording.save();
  try {
    const storage = await getStorage();
    const saved = await storage.saveFile(file.buffer, {
      extension,
      contentType: file.mimetype || recording.mimeType || 'audio/webm',
    });
    if (asChunk) {
      const index = Number(chunkIndex) || recording.chunks.length;
      recording.chunks.push({
        index,
        storageKey: saved.storageKey,
        size: file.buffer.length,
        durationMs: durationMs != null ? Number(durationMs) || 0 : 0,
        uploadedAt: new Date(),
      });
      recording.size = (recording.size || 0) + file.buffer.length;
    } else {
      recording.storageKey = saved.storageKey;
      recording.size = file.buffer.length;
      recording.mimeType = file.mimetype || recording.mimeType;
      recording.status = 'ready';
      recording.error = '';
    }
    if (durationMs != null) recording.durationMs = Math.max(recording.durationMs || 0, Number(durationMs) || 0);
    recording.lastAutosavedAt = new Date();
    if (asChunk && recording.status === 'uploading') recording.status = 'recording';
    await recording.save();
    await writeAudit({
      actor,
      action: AUDIT.VOICE_AUDIO_SAVED,
      entityType: 'VoiceRecording',
      entityId: recording._id,
      newValue: { asChunk, size: file.buffer.length, storageKey: saved.storageKey },
      req,
    });
    return present(recording, actor);
  } catch (error) {
    recording.status = 'failed';
    recording.error = error.message || 'Audio upload failed';
    await recording.save();
    throw error;
  }
}

export async function readVoiceAudio(id, actor, req) {
  const recording = await VoiceRecording.findOne({ _id: id, isDeleted: false });
  if (!recording) throw new ApiError(404, 'Voice recording not found');
  await getSubmissionForActor(actor, recording.submission);
  if (actor.role === ROLES.CLINIC_MANAGER) throw new ApiError(403, 'Clinic managers cannot access voice recordings');
  if (!recording.storageKey) throw new ApiError(404, 'Audio is not available yet');
  const storage = await getStorage();
  const buffer = await storage.openFile(recording.storageKey);
  await writeAudit({
    actor,
    action: AUDIT.VOICE_AUDIO_PLAYED,
    entityType: 'VoiceRecording',
    entityId: recording._id,
    newValue: { patientCode: recording.patientCode },
    req,
  });
  return {
    buffer,
    mimeType: recording.mimeType || 'audio/webm',
    filename: `${recording.patientCode || 'voice'}-${recording._id}.${extensionOf('', recording.mimeType)}`,
  };
}

export async function createRealtimeSession(actor) {
  if (actor.role !== ROLES.DOCTOR) throw new ApiError(403, 'Only doctors can start realtime transcription');
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) {
    return {
      provider: 'browser-speech',
      configured: false,
      message: 'OPENAI_API_KEY is not configured. Use the browser speech provider for live transcription.',
    };
  }
  const model = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview';
  const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      voice: 'alloy',
      modalities: ['audio', 'text'],
      input_audio_transcription: { model: 'whisper-1' },
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new ApiError(502, `Realtime session could not be created: ${detail.slice(0, 200)}`);
  }
  const data = await response.json();
  return {
    provider: 'openai-realtime',
    configured: true,
    model,
    clientSecret: data.client_secret?.value || data.client_secret,
    expiresAt: data.client_secret?.expires_at || data.expires_at,
    sessionId: data.id,
    // WebRTC SDP exchange stays on the client; this secret renews the AI session only.
    webrtcUrl: 'https://api.openai.com/v1/realtime',
  };
}

export function voiceUploadLimits() {
  return Number(process.env.VOICE_MAX_FILE_SIZE || Math.max(env.maxFileSize, 50 * 1024 * 1024));
}
