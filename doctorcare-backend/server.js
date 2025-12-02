require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { KMSClient, EncryptCommand, GenerateDataKeyCommand, DecryptCommand } = require('@aws-sdk/client-kms');
const { Pool } = require('pg');
const { Queue } = require('bullmq');
const jwt = require('jsonwebtoken');
const fs = require('fs');

const app = express();
app.use(express.json());

const s3 = new S3Client({ region: process.env.AWS_REGION });
const kms = new KMSClient({ region: process.env.AWS_REGION });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const queue = new Queue('transcriptionQueue', { connection: { host: 'localhost', port: 6379 }});

const upload = multer({ storage: multer.memoryStorage() }); // small demo; production use streaming direct-to-S3

// simple auth middleware (replace with real)
function auth(req, res, next){
  const authHeader = req.headers.authorization;
  if(!authHeader) return res.status(401).send('Unauthorized');
  const token = authHeader.split(' ')[1];
  try{
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  }catch(e){
    return res.status(401).send('Unauthorized');
  }
}

// Upload audio endpoint
app.post('/api/recordings/upload', auth, upload.single('audio'), async (req, res) => {
  // require consent in body
  if(!req.body.consent || req.body.consent !== 'true'){
    return res.status(400).send({ error: 'Consent required before recording' });
  }
  // 1) Generate data key from KMS
  const keyResp = await kms.send(new GenerateDataKeyCommand({
    KeyId: process.env.KMS_KEY_ID,
    KeySpec: 'AES_256'
  }));
  // keyResp.Plaintext (Buffer) used to encrypt file locally; CiphertextBlob stored in DB
  const plaintextKey = keyResp.Plaintext; // Buffer
  const encryptedDataKey = keyResp.CiphertextBlob; // Buffer

  // 2) Encrypt audio with AES-GCM locally (simple example)
  const crypto = require('crypto');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', plaintextKey, iv);
  const ciphertext = Buffer.concat([cipher.update(req.file.buffer), cipher.final()]);
  const tag = cipher.getAuthTag();

  // 3) Upload encrypted blob to S3 as {iv + tag + ciphertext}
  const s3Key = `recordings/${Date.now()}_${req.file.originalname}`;
  const uploadBody = Buffer.concat([iv, tag, ciphertext]);

  await s3.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: s3Key,
    Body: uploadBody,
    ServerSideEncryption: 'AES256' // server-side; you may keep client-side encrypted data as above as well
  }));

  // 4) Create DB recording row, store kms encrypted key
  const { appointmentId } = req.body; // validate
  const client = await pool.connect();
  try{
    const result = await client.query(
      `INSERT INTO recordings (appointment_id, s3_key, kms_encrypted_key, length_seconds, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [appointmentId, s3Key, encryptedDataKey, req.body.length || 0, req.user.id]
    );
    const recordingId = result.rows[0].id;
    // 5) enqueue transcription job
    await queue.add('transcribe', { recordingId, s3Key, kmsEncryptedKey: encryptedDataKey.toString('base64') });
    res.json({ recordingId, message: 'Uploaded and queued for transcription' });
  } finally { client.release(); }
});
