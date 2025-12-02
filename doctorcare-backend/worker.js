require('dotenv').config();
const { Worker } = require('bullmq');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { KMSClient, DecryptCommand } = require('@aws-sdk/client-kms');
const { Pool } = require('pg');
const fetch = require('node-fetch');
const streamToBuffer = require('stream-to-array'); // or use native stream -> buffer utility
const crypto = require('crypto');

const s3 = new S3Client({ region: process.env.AWS_REGION });
const kms = new KMSClient({ region: process.env.AWS_REGION });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const worker = new Worker('transcriptionQueue', async job => {
  const { recordingId, s3Key, kmsEncryptedKey } = job.data;
  console.log('processing', recordingId);

  // 1) fetch encrypted key from DB (or job payload)
  const encryptedKeyBuffer = Buffer.from(kmsEncryptedKey, 'base64'); // if passed encoded
  // 2) decrypt data key with KMS
  const dec = await kms.send(new DecryptCommand({ CiphertextBlob: encryptedKeyBuffer }));
  const dataKey = dec.Plaintext; // Buffer

  // 3) download audio from S3
  const obj = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: s3Key }));
  const bodyStream = obj.Body;
  const chunks = [];
  for await (const ch of bodyStream) chunks.push(ch);
  const encryptedBlob = Buffer.concat(chunks);

  // 4) undo local AES-GCM encryption (assuming structure iv(12)|tag(16)|ciphertext)
  const iv = encryptedBlob.slice(0,12);
  const tag = encryptedBlob.slice(12,28);
  const ciphertext = encryptedBlob.slice(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', dataKey, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  // 5) call STT provider (OpenAI transcription)
  // Save plaintext to temp file
  const tmpFile = `/tmp/${recordingId}.webm`; // choose correct ext
  require('fs').writeFileSync(tmpFile, plaintext);

  // Use OpenAI Audio Transcriptions endpoint
  const form = new FormData();
  form.append('file', require('fs').createReadStream(tmpFile));
  form.append('model', 'gpt-4o-mini-transcribe'); // example; check available models
  // call OpenAI
  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form
  });
  const sttResult = await resp.json();
  const transcript = sttResult.text || '';

  // 6) call LLM to generate prescription draft - pass transcript and appointment metadata
  const prompt = `
You are a clinical assistant. Given the conversation transcript below between a doctor and patient, extract:
- Diagnosis (short)
- Symptoms (short list)
- Medication recommendations (medicine name, dose, frequency, duration)
- Advice & follow-up
Return JSON with fields: diagnosis, symptoms[], medicines[ {name, dose, frequency, duration}], advice, follow_up_days.
Transcript:
"""${transcript}"""
`;
  const chatResp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini', // choose appropriate model and check policy
      messages: [{ role: 'system', content: 'You are a clinical assistant. Answer in JSON only.' }, { role: 'user', content: prompt }],
      temperature: 0.0
    })
  });
  const chatJson = await chatResp.json();
  const aiText = (chatJson.choices?.[0]?.message?.content) || '';

  // 7) Save AI draft to DB
  const client = await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('UPDATE recordings SET status=$1 WHERE id=$2', ['transcribed', recordingId]);
    await client.query(
      `INSERT INTO ai_prescriptions (recording_id, appointment_id, generated_by, draft_text, structured)
       VALUES ($1,$2,$3,$4,$5)`,
      [recordingId, null, 'ai', aiText, aiText /* ideally parse JSON first */]
    );
    await client.query('COMMIT');
  } catch(e){
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  // 8) notify doctor (push / websocket / email) — omitted for brevity
  return { transcript, aiText };
});
