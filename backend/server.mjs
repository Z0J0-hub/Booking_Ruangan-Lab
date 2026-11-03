import dotenv from 'dotenv';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import mysql from 'mysql2/promise';
import nodemailer from 'nodemailer';
import { hasMissedCheckIn, isCheckInTooEarly, isValidSchedule } from './booking-policy.mjs';

// Use the same environment file for root scripts and commands run in backend/.
// Container environment variables retain precedence over the local file.
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

const port = Number(process.env.PORT || 3000);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be configured and contain at least 32 characters.');
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || 'library_booking',
  user: process.env.DB_USER || 'library_booking',
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  timezone: 'Z',
  dateStrings: true,
});

const app = express();
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim());

function isDevelopmentOrigin(origin) {
  if (process.env.NODE_ENV === 'production') return false;
  try {
    const url = new URL(origin);
    return url.protocol === 'http:'
      && ['localhost', '127.0.0.1'].includes(url.hostname)
      && ['5173', '5174'].includes(url.port);
  } catch {
    return false;
  }
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || isDevelopmentOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin is not allowed by CORS.'));
  },
}));
app.use(express.json({ limit: '32kb' }));
app.use('/api', rateLimit({
  windowMs: 60_000,
  limit: Number(process.env.RATE_LIMIT_MAX || 100),
  standardHeaders: true,
  legacyHeaders: false,
}));

function sendError(res, status, message) {
  return res.status(status).json({ message });
}

function makeAccessToken(user) {
  return jwt.sign(
    { sub: user.id, jti: randomUUID() },
    jwtSecret,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' },
  );
}

function normalizeDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function toIsoDateTime(value) {
  return value ? `${value.replace(' ', 'T')}Z` : null;
}

function sanitizeUser(user) {
  const { password_hash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

async function authenticate(req, res, next) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return sendError(res, 401, 'Silakan masuk terlebih dahulu.');

  let claims;
  try {
    claims = jwt.verify(token, jwtSecret);
  } catch {
    return sendError(res, 401, 'Sesi tidak valid atau sudah kedaluwarsa.');
  }
  if (claims.purpose === 'password-reset') {
    req.resetUserId = claims.sub;
    return next();
  }

  const [revokedTokens] = await pool.execute(
    'SELECT token_id FROM revoked_tokens WHERE token_id = ? AND expires_at > UTC_TIMESTAMP()',
    [claims.jti],
  );
  if (revokedTokens.length) return sendError(res, 401, 'Sesi sudah berakhir. Silakan masuk kembali.');

  const [users] = await pool.execute(
    'SELECT id, username, full_name, email, role, member_type, phone, student_id, employee_id, created_at, updated_at FROM users WHERE id = ?',
    [claims.sub],
  );
  if (!users[0]) return sendError(res, 401, 'Sesi tidak valid. Silakan masuk kembali.');
  req.user = users[0];
  req.authClaims = claims;
  return next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return sendError(res, 403, 'Akses khusus administrator.');
  return next();
}

async function cancelMissedCheckIns() {
  const [result] = await pool.execute(
    `UPDATE bookings
     SET status = 'cancelled',
         cancellation_reason = 'Dibatalkan otomatis: belum check-in dalam 15 menit setelah jadwal dimulai.'
     WHERE status = 'approved'
       AND checked_in_at IS NULL
       AND start_time <= UTC_TIMESTAMP() - INTERVAL 15 MINUTE`,
  );
  if (result.affectedRows > 0) {
    console.info(`Automatically cancelled ${result.affectedRows} booking(s) for missed check-in.`);
  }
}

const healthCheck = async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    sendError(res, 503, 'Database is unavailable.');
  }
};
app.get(['/health', '/api/health'], healthCheck);

app.post('/api/auth/register', async (req, res) => {
  const { email, password, username, full_name, phone, student_id, employee_id, member_type } = req.body;
  if (
    typeof email !== 'string' || typeof password !== 'string'
    || typeof username !== 'string' || typeof full_name !== 'string'
    || !['student', 'employee'].includes(member_type)
    || !email.trim() || !username.trim() || !full_name.trim()
    || email.length > 190 || username.length > 80 || full_name.length > 160
  ) {
    return sendError(res, 400, 'Lengkapi nama, username, email, kata sandi, dan jenis pengguna.');
  }
  if (String(password).length < 8) return sendError(res, 400, 'Kata sandi minimal 8 karakter.');
  if (member_type === 'student' && !student_id) return sendError(res, 400, 'NIM wajib diisi untuk mahasiswa.');
  if (member_type === 'employee' && !employee_id) return sendError(res, 400, 'NIP wajib diisi untuk pegawai.');

  try {
    const id = randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.execute(
      `INSERT INTO users
       (id, username, full_name, email, password_hash, role, member_type, phone, student_id, employee_id)
       VALUES (?, ?, ?, ?, ?, 'user', ?, ?, ?, ?)`,
      [id, username.trim(), full_name.trim(), email.trim().toLowerCase(), passwordHash, member_type, phone || null,
        member_type === 'student' ? student_id : null, member_type === 'employee' ? employee_id : null],
    );
    return res.status(201).json({ message: 'Akun berhasil dibuat. Silakan masuk.' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return sendError(res, 409, 'Email atau username sudah digunakan.');
    console.error('Registration failed:', error);
    return sendError(res, 500, 'Pendaftaran gagal. Silakan coba kembali.');
  }
});

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const [users] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
  const user = users[0];
  if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.password_hash))) {
    return sendError(res, 401, 'Email atau kata sandi salah.');
  }
  return res.json({ token: makeAccessToken(user), user: sanitizeUser(user) });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  if (req.resetUserId) return sendError(res, 401, 'Token pemulihan hanya dapat digunakan untuk mengatur kata sandi.');
  return res.json({ user: req.user });
});

app.post('/api/auth/logout', authenticate, async (req, res) => {
  if (req.resetUserId) return sendError(res, 401, 'Token pemulihan bukan sesi login.');
  await pool.execute(
    'INSERT IGNORE INTO revoked_tokens (token_id, expires_at) VALUES (?, ?)',
    [req.authClaims.jti, normalizeDateTime(new Date(req.authClaims.exp * 1000).toISOString())],
  );
  return res.json({ message: 'Berhasil keluar.' });
});

app.post('/api/auth/password/forgot', async (req, res) => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return sendError(res, 503, 'Fitur reset kata sandi belum dikonfigurasi pada server.');
  }
  const email = String(req.body.email || '').trim().toLowerCase();
  const [users] = await pool.execute('SELECT id, email FROM users WHERE email = ?', [email]);
  if (!users[0]) return res.json({ message: 'Jika email terdaftar, tautan reset akan dikirim.' });

  const resetToken = jwt.sign(
    { sub: users[0].id, purpose: 'password-reset' },
    jwtSecret,
    { expiresIn: '30m' },
  );
  const tokenHash = createHash('sha256').update(resetToken).digest('hex');
  await pool.execute(
    'INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE))',
    [tokenHash, users[0].id],
  );
  const resetUrl = new URL('/', process.env.FRONTEND_URL || 'http://localhost:5173');
  resetUrl.searchParams.set('type', 'recovery');
  resetUrl.searchParams.set('token', resetToken);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: users[0].email,
    subject: 'Atur ulang kata sandi booking ruangan',
    text: `Gunakan tautan ini dalam 30 menit untuk mengatur ulang kata sandi: ${resetUrl}`,
  });
  return res.json({ message: 'Jika email terdaftar, tautan reset akan dikirim.' });
});

app.post('/api/auth/password/reset', authenticate, async (req, res) => {
  if (!req.resetUserId) return sendError(res, 400, 'Gunakan tautan pemulihan kata sandi yang dikirim ke email.');
  const password = String(req.body.password || '');
  if (password.length < 8) return sendError(res, 400, 'Kata sandi minimal 8 karakter.');

  const authorization = req.headers.authorization || '';
  const token = authorization.slice(7);
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const [resetTokens] = await pool.execute(
    'SELECT token_hash FROM password_reset_tokens WHERE token_hash = ? AND user_id = ? AND expires_at > UTC_TIMESTAMP()',
    [tokenHash, req.resetUserId],
  );
  if (!resetTokens[0]) return sendError(res, 401, 'Tautan pemulihan tidak valid atau sudah kedaluwarsa.');

  const passwordHash = await bcrypt.hash(password, 12);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, req.resetUserId]);
    await connection.execute('DELETE FROM password_reset_tokens WHERE token_hash = ?', [tokenHash]);
    await connection.commit();
    return res.json({ message: 'Kata sandi berhasil diperbarui.' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

app.get('/api/rooms', authenticate, async (req, res) => {
  if (req.resetUserId) return sendError(res, 401, 'Silakan masuk kembali.');
  const [rooms] = await pool.execute('SELECT * FROM rooms ORDER BY name');
  return res.json(rooms);
});

app.post('/api/rooms', authenticate, requireAdmin, async (req, res) => {
  const { name, location, capacity, description = '' } = req.body;
  if (typeof name !== 'string' || typeof location !== 'string'
    || !name.trim() || !location.trim()
    || !Number.isInteger(Number(capacity)) || Number(capacity) < 1) {
    return sendError(res, 400, 'Nama, lokasi, dan kapasitas ruangan wajib diisi.');
  }
  const room = { id: randomUUID(), name: name.trim(), location: location.trim(), capacity: Number(capacity), description: String(description).trim() };
  await pool.execute('INSERT INTO rooms (id, name, location, capacity, description) VALUES (?, ?, ?, ?, ?)',
    [room.id, room.name, room.location, room.capacity, room.description]);
  return res.status(201).json(room);
});

app.put('/api/rooms/:id', authenticate, requireAdmin, async (req, res) => {
  const { name, location, capacity, description = '' } = req.body;
  if (typeof name !== 'string' || typeof location !== 'string'
    || !name.trim() || !location.trim()
    || !Number.isInteger(Number(capacity)) || Number(capacity) < 1) {
    return sendError(res, 400, 'Nama, lokasi, dan kapasitas ruangan wajib diisi.');
  }
  const [result] = await pool.execute(
    'UPDATE rooms SET name = ?, location = ?, capacity = ?, description = ? WHERE id = ?',
    [name.trim(), location.trim(), Number(capacity), String(description).trim(), req.params.id],
  );
  if (!result.affectedRows) return sendError(res, 404, 'Ruangan tidak ditemukan.');
  return res.json({ message: 'Ruangan diperbarui.' });
});

app.get('/api/bookings', authenticate, async (req, res) => {
  if (req.resetUserId) return sendError(res, 401, 'Silakan masuk kembali.');
  await cancelMissedCheckIns();
  const isAdmin = req.user.role === 'admin';
  const activeScheduleOnly = req.query.status === 'active';
  const filters = [];
  const values = [];
  if (!isAdmin && !activeScheduleOnly) {
    filters.push('b.user_id = ?');
    values.push(req.user.id);
  }
  if (activeScheduleOnly) filters.push("b.status IN ('pending', 'approved', 'in_progress')");
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
  const [bookings] = await pool.execute(
    `SELECT b.*, r.name AS room_name, r.location AS room_location, r.capacity AS room_capacity,
            r.description AS room_description, u.full_name AS profile_name
     FROM bookings b
     JOIN rooms r ON r.id = b.room_id
     JOIN users u ON u.id = b.user_id
     ${where}
     ORDER BY b.start_time ASC
     LIMIT ${limit}`,
    values,
  );
  if (activeScheduleOnly) {
    return res.json(bookings.map((booking) => ({
      id: booking.id,
      room_id: booking.room_id,
      start_time: toIsoDateTime(booking.start_time),
      end_time: toIsoDateTime(booking.end_time),
      status: booking.status,
    })));
  }
  const response = bookings.map((booking) => ({
    id: booking.id,
    user_id: booking.user_id,
    room_id: booking.room_id,
    start_time: toIsoDateTime(booking.start_time),
    end_time: toIsoDateTime(booking.end_time),
    purpose: booking.purpose,
    status: booking.status,
    cancellation_reason: booking.cancellation_reason,
    auto_approval_reason: booking.auto_approval_reason,
    checked_in_at: toIsoDateTime(booking.checked_in_at),
    checkin_token: booking.user_id === req.user.id ? booking.checkin_token : undefined,
    created_at: toIsoDateTime(booking.created_at),
    updated_at: toIsoDateTime(booking.updated_at),
    room: { id: booking.room_id, name: booking.room_name, location: booking.room_location, capacity: booking.room_capacity, description: booking.room_description },
    profile: isAdmin ? { full_name: booking.profile_name } : undefined,
  }));
  return res.json(response);
});

app.post('/api/bookings', authenticate, async (req, res) => {
  if (req.resetUserId) return sendError(res, 401, 'Silakan masuk kembali.');
  const { room_id: roomId, start_time: startValue, end_time: endValue, purpose } = req.body;
  if (typeof startValue !== 'string' || typeof endValue !== 'string' || typeof purpose !== 'string') {
    return sendError(res, 400, 'Lengkapi ruangan, waktu mulai, waktu selesai, dan tujuan booking.');
  }
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (!roomId || !purpose.trim() || !isValidSchedule(start, end)) {
    return sendError(res, 400, 'Jadwal harus pada hari kerja, pukul 08.00–18.00, menggunakan interval 30 menit, dan berada di masa depan.');
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rooms] = await connection.execute('SELECT id FROM rooms WHERE id = ? FOR UPDATE', [roomId]);
    if (!rooms[0]) {
      await connection.rollback();
      return sendError(res, 404, 'Ruangan tidak ditemukan.');
    }
    const [conflicts] = await connection.execute(
      `SELECT id FROM bookings
       WHERE room_id = ? AND status IN ('pending', 'approved', 'in_progress')
         AND start_time < ? AND end_time > ?
       LIMIT 1 FOR UPDATE`,
      [roomId, normalizeDateTime(end.toISOString()), normalizeDateTime(start.toISOString())],
    );
    if (conflicts.length) {
      await connection.rollback();
      return sendError(res, 409, 'Jadwal ruangan sudah terisi. Pilih waktu lain.');
    }

    const booking = {
      id: randomUUID(),
      user_id: req.user.id,
      room_id: roomId,
      start_time: normalizeDateTime(start.toISOString()),
      end_time: normalizeDateTime(end.toISOString()),
      purpose: purpose.trim(),
      status: 'approved',
      checkin_token: randomBytes(32).toString('hex'),
      auto_approval_reason: 'Disetujui otomatis: jadwal valid dan ruangan tersedia.',
    };
    await connection.execute(
      `INSERT INTO bookings
       (id, user_id, room_id, start_time, end_time, purpose, status, checkin_token, auto_approval_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [booking.id, booking.user_id, booking.room_id, booking.start_time, booking.end_time,
        booking.purpose, booking.status, booking.checkin_token, booking.auto_approval_reason],
    );
    await connection.commit();
    return res.status(201).json({
      ...booking,
      start_time: toIsoDateTime(booking.start_time),
      end_time: toIsoDateTime(booking.end_time),
      checked_in_at: null,
      cancellation_reason: null,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Booking creation failed:', error);
    return sendError(res, 500, 'Booking gagal disimpan.');
  } finally {
    connection.release();
  }
});

app.patch('/api/bookings/:id', authenticate, requireAdmin, async (req, res) => {
  const { status, cancellation_reason: reason } = req.body;
  if (!['approved', 'cancelled'].includes(status)) return sendError(res, 400, 'Status booking tidak valid.');
  if (status === 'cancelled' && !String(reason || '').trim()) {
    return sendError(res, 400, 'Alasan pembatalan wajib diisi.');
  }
  const [result] = await pool.execute(
    'UPDATE bookings SET status = ?, cancellation_reason = ? WHERE id = ? AND status IN (?, ?)',
    [status, status === 'cancelled' ? String(reason).trim() : null, req.params.id, 'pending', 'approved'],
  );
  if (!result.affectedRows) return sendError(res, 404, 'Booking tidak ditemukan atau sudah diproses.');
  return res.json({ message: status === 'approved' ? 'Booking disetujui.' : 'Booking dibatalkan.' });
});

app.post('/api/bookings/:id/check-in', authenticate, async (req, res) => {
  if (req.resetUserId) return sendError(res, 401, 'Silakan masuk kembali.');
  const [bookings] = await pool.execute('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
  const booking = bookings[0];
  if (!booking) return sendError(res, 404, 'Booking tidak ditemukan.');
  if (req.user.role !== 'admin' && booking.user_id !== req.user.id) {
    return sendError(res, 403, 'QR check-in ini bukan milik akun Anda.');
  }
  if (!req.body.token || req.body.token !== booking.checkin_token) {
    return sendError(res, 400, 'QR check-in tidak valid.');
  }
  if (booking.status === 'in_progress' && booking.checked_in_at) {
    return res.json({ message: 'Booking ini sudah di-check-in.', checked_in_at: toIsoDateTime(booking.checked_in_at) });
  }
  if (booking.status !== 'approved') return sendError(res, 409, 'Booking ini tidak dapat di-check-in.');
  const now = new Date();
  const start = new Date(`${booking.start_time.replace(' ', 'T')}Z`);
  if (isCheckInTooEarly(start, now)) {
    return sendError(res, 400, 'Check-in dibuka 15 menit sebelum jadwal dimulai.');
  }
  if (hasMissedCheckIn(start, booking.checked_in_at, now)) {
    await cancelMissedCheckIns();
    return sendError(res, 409, 'Batas check-in 15 menit telah lewat. Booking dibatalkan otomatis.');
  }

  const [result] = await pool.execute(
    `UPDATE bookings SET checked_in_at = UTC_TIMESTAMP(), status = 'in_progress'
     WHERE id = ? AND status = 'approved' AND checked_in_at IS NULL`,
    [booking.id],
  );
  if (!result.affectedRows) return sendError(res, 409, 'Booking sudah di-check-in atau telah dibatalkan.');
  return res.json({ message: 'Check-in berhasil. Selamat menggunakan ruangan.', checked_in_at: new Date().toISOString() });
});

app.use((error, _req, res, _next) => {
  console.error('Unhandled API error:', error);
  if (res.headersSent) return;
  return sendError(res, 500, 'Terjadi kesalahan pada server.');
});

async function start() {
  const schema = await readFile(fileURLToPath(new URL('./schema.sql', import.meta.url)), 'utf8');
  for (const statement of schema.split(';').map((part) => part.trim()).filter(Boolean)) {
    await pool.query(statement);
  }

  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const [existingAdmins] = await pool.execute('SELECT id FROM users WHERE role = ? LIMIT 1', ['admin']);
    if (!existingAdmins.length) {
      const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
      await pool.execute(
        `INSERT INTO users (id, username, full_name, email, password_hash, role, member_type)
         VALUES (?, ?, ?, ?, ?, 'admin', 'employee')`,
        [randomUUID(), process.env.ADMIN_USERNAME || 'admin', process.env.ADMIN_NAME || 'Administrator',
          process.env.ADMIN_EMAIL.trim().toLowerCase(), passwordHash],
      );
      console.info('Initial administrator account created.');
    }
  }

  await cancelMissedCheckIns();
  const cancellationTimer = setInterval(() => {
    cancelMissedCheckIns().catch((error) => console.error('Automatic cancellation job failed:', error));
  }, 10_000);
  cancellationTimer.unref();
  app.listen(port, '0.0.0.0', () => console.info(`Booking API listening on port ${port}.`));
}

start().catch((error) => {
  console.error('Unable to start booking API:', error);
  process.exitCode = 1;
});
