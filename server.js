const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ===== CONFIG =====
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'al-muraqib-secret-2024';
const ALERT_COOLDOWN = parseInt(process.env.ALERT_COOLDOWN_MINUTES) || 10;
const MAX_ALERTS_PER_HOUR = parseInt(process.env.MAX_ALERTS_PER_HOUR) || 3;
const PENALTY_DURATION = parseInt(process.env.PENALTY_DURATION_MINUTES) || 30;
const NEARBY_RADIUS = parseInt(process.env.NEARBY_DRIVERS_RADIUS) || 5000;
const ALERT_RADIUS = parseInt(process.env.ALERT_RADIUS) || 3000;
const MAX_AUDIO_DURATION = parseInt(process.env.MAX_AUDIO_DURATION_SECONDS) || 60;
const AUDIO_RETENTION = parseInt(process.env.AUDIO_RETENTION_MINUTES) || 30;

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Rate limiting for alerts
const alertLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: MAX_ALERTS_PER_HOUR,
  message: { error: 'تجاوزت الحد المسموح من البلاغات. حاول لاحقاً.' }
});

// Multer config for audio uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const unique = uuidv4() + path.extname(file.originalname);
    cb(null, unique);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['audio/webm', 'audio/ogg', 'audio/wav', 'audio/mp4'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('نوع الملف غير مدعوم'), false);
  }
});

// Create uploads directory
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// ===== MONGOOSE SCHEMAS =====

// User Schema (simplified - no heavy docs)
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  vehicleType: { type: String, enum: ['taxi_petit', 'taxi_grand', 'camion', 'bus', 'moto', 'voiture', 'autre'], required: true },
  plate: { type: String, default: '' },
  password: { type: String, required: true },

  // Anti-fraud
  alertCount: { type: Number, default: 0 },
  falseAlertCount: { type: Number, default: 0 },
  lastAlertAt: { type: Date, default: null },
  penaltyUntil: { type: Date, default: null },
  isBlocked: { type: Boolean, default: false },

  // Location
  lat: { type: Number, default: 0 },
  lng: { type: Number, default: 0 },
  status: { type: String, enum: ['online', 'offline', 'danger'], default: 'offline' },
  lastSeen: { type: Date, default: Date.now },

  // Stats
  totalAlertsSent: { type: Number, default: 0 },
  totalAlertsReceived: { type: Number, default: 0 },
  helpedDrivers: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// Group Schema
const groupSchema = new mongoose.Schema({
  groupId: { type: String, unique: true, default: () => uuidv4() },
  name: { type: String, required: true },
  city: { type: String, required: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  adminName: { type: String, required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  allowedVehicles: [{ type: String }],
  description: { type: String, default: '' },
  isPublic: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
const Group = mongoose.model('Group', groupSchema);

// Alert Schema
const alertSchema = new mongoose.Schema({
  alertId: { type: String, unique: true, default: () => uuidv4() },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, required: true },
  userPhone: { type: String, required: true },
  userVehicle: { type: String, required: true },
  userPlate: { type: String, default: '' },

  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },

  audioUrl: { type: String, default: null },
  audioDuration: { type: Number, default: 0 },

  status: {
    type: String,
    enum: ['active', 'verified', 'false_alarm', 'resolved', 'cancelled'],
    default: 'active'
  },
  verifications: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: String,
    type: { type: String, enum: ['confirm', 'deny'] },
    reason: String,
    createdAt: { type: Date, default: Date.now }
  }],
  confirmCount: { type: Number, default: 0 },
  denyCount: { type: Number, default: 0 },

  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  resolvedAt: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 30 * 60 * 1000) }
});
const Alert = mongoose.model('Alert', alertSchema);

// Message Schema (for group chat history)
const messageSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, required: true },
  userVehicle: { type: String, required: true },
  type: { type: String, enum: ['normal', 'alert'], default: 'normal' },
  audioUrl: { type: String, default: null },
  audioDuration: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

// Admin Schema
const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'superadmin'], default: 'admin' }
});
const Admin = mongoose.model('Admin', adminSchema);

// ===== AUTH MIDDLEWARE =====
const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'غير مصرح' });
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (err) {
    res.status(401).json({ error: 'توكن غير صالح' });
  }
};

const adminAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'غير مصرح' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const admin = await Admin.findById(decoded.id);
    if (!admin) return res.status(403).json({ error: 'غير مصرح' });
    req.admin = admin;
    next();
  } catch (err) {
    res.status(401).json({ error: 'توكن غير صالح' });
  }
};

// ===== HELPER FUNCTIONS =====
function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function isPenaltyActive(user) {
  if (!user.penaltyUntil) return false;
  return new Date() < user.penaltyUntil;
}

function isCooldownActive(user) {
  if (!user.lastAlertAt) return false;
  const cooldownMs = ALERT_COOLDOWN * 60 * 1000;
  return (Date.now() - user.lastAlertAt.getTime()) < cooldownMs;
}

// Auto-delete old audio files
function cleanupOldAudio() {
  const uploadsDir = './uploads';
  const now = Date.now();
  fs.readdir(uploadsDir, (err, files) => {
    if (err) return;
    files.forEach(file => {
      const filePath = path.join(uploadsDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        const ageMinutes = (now - stats.mtime.getTime()) / (1000 * 60);
        if (ageMinutes > AUDIO_RETENTION) {
          fs.unlink(filePath, () => {});
        }
      });
    });
  });
}
setInterval(cleanupOldAudio, 10 * 60 * 1000); // Every 10 minutes

// ===== API ROUTES =====

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, phone, vehicleType, plate, password } = req.body;
    if (!name || !phone || !vehicleType || !password) {
      return res.status(400).json({ error: 'جميع الحقول المطلوبة يجب ملؤها' });
    }
    const existing = await User.findOne({ phone });
    if (existing) return res.status(400).json({ error: 'رقم الهاتف مسجل مسبقاً' });

    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ name, phone, vehicleType, plate: plate || '', password: hashed });
    await user.save();

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({
      token,
      user: { id: user._id, name, phone, vehicleType, plate: plate || '' }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    const user = await User.findOne({ phone });
    if (!user) return res.status(400).json({ error: 'بيانات الدخول غير صحيحة' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'بيانات الدخول غير صحيحة' });
    if (user.isBlocked) return res.status(403).json({ error: 'الحساب محظور. اتصل بالإدارة.' });

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
    user.status = 'online';
    user.lastSeen = new Date();
    await user.save();

    res.json({
      token,
      user: {
        id: user._id, name: user.name, phone: user.phone,
        vehicleType: user.vehicleType, plate: user.plate,
        status: user.status, penaltyUntil: user.penaltyUntil,
        falseAlertCount: user.falseAlertCount
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// Get current user
app.get('/api/user/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// Update location
app.post('/api/user/location', auth, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const user = await User.findByIdAndUpdate(req.userId, {
      lat, lng, lastSeen: new Date()
    }, { new: true }).select('-password');

    io.emit('user:location', { userId: req.userId, lat, lng, status: user.status });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ===== GROUP ROUTES =====

// Create group
app.post('/api/groups', auth, async (req, res) => {
  try {
    const { name, city, allowedVehicles, description, isPublic } = req.body;
    if (!name || !city) return res.status(400).json({ error: 'اسم المجموعة والمدينة مطلوبان' });

    const user = await User.findById(req.userId);
    const group = new Group({
      name, city,
      adminId: req.userId,
      adminName: user.name,
      members: [req.userId],
      allowedVehicles: allowedVehicles || [user.vehicleType],
      description: description || '',
      isPublic: isPublic !== false
    });
    await group.save();

    res.status(201).json({ success: true, group });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// Get all groups
app.get('/api/groups', auth, async (req, res) => {
  try {
    const { city, search } = req.query;
    let query = { isPublic: true };
    if (city) query.city = new RegExp(city, 'i');
    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { city: new RegExp(search, 'i') }
      ];
    }

    const groups = await Group.find(query)
      .populate('members', 'name status')
      .sort({ createdAt: -1 });

    // Add online count
    const groupsWithCount = groups.map(g => ({
      ...g.toObject(),
      onlineCount: g.members.filter(m => m.status === 'online').length
    }));

    res.json(groupsWithCount);
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// Get my groups
app.get('/api/groups/my', auth, async (req, res) => {
  try {
    const groups = await Group.find({ members: req.userId })
      .populate('members', 'name status vehicleType')
      .sort({ createdAt: -1 });
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// Join group
app.post('/api/groups/:groupId/join', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

    const user = await User.findById(req.userId);
    if (!group.allowedVehicles.includes(user.vehicleType)) {
      return res.status(403).json({ error: 'نوع مركبتك غير مسموح به في هذه المجموعة' });
    }

    if (!group.members.includes(req.userId)) {
      group.members.push(req.userId);
      await group.save();
    }

    res.json({ success: true, message: 'تم الانضمام للمجموعة' });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// Leave group
app.post('/api/groups/:groupId/leave', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

    group.members = group.members.filter(m => m.toString() !== req.userId);
    await group.save();

    res.json({ success: true, message: 'تمت مغادرة المجموعة' });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// Get group members with locations
app.get('/api/groups/:groupId/members', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId)
      .populate('members', '-password');
    if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

    res.json(group.members);
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// Get group messages
app.get('/api/groups/:groupId/messages', auth, async (req, res) => {
  try {
    const messages = await Message.find({ groupId: req.params.groupId })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('userId', 'name vehicleType');
    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ===== UPLOAD AUDIO =====
app.post('/api/upload/audio', auth, upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'لم يتم رفع الملف' });
    const url = `/uploads/${req.file.filename}`;
    res.json({ success: true, url, filename: req.file.filename });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في رفع الملف' });
  }
});

// ===== ALERT SYSTEM =====
app.post('/api/alerts', auth, alertLimiter, async (req, res) => {
  try {
    const { groupId, lat, lng, audioUrl, audioDuration } = req.body;
    const user = await User.findById(req.userId);

    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    if (user.isBlocked) return res.status(403).json({ error: 'الحساب محظور' });
    if (isPenaltyActive(user)) {
      const minsLeft = Math.ceil((user.penaltyUntil - Date.now()) / 60000);
      return res.status(403).json({ error: `محظور من إرسال البلاغات لمدة ${minsLeft} دقيقة.` });
    }
    if (isCooldownActive(user)) {
      const minsLeft = Math.ceil((ALERT_COOLDOWN * 60000 - (Date.now() - user.lastAlertAt.getTime())) / 60000);
      return res.status(429).json({ error: `انتظر ${minsLeft} دقيقة قبل إرسال بلاغ جديد.` });
    }

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

    const alert = new Alert({
      groupId,
      userId: user._id,
      userName: user.name,
      userPhone: user.phone,
      userVehicle: user.vehicleType,
      userPlate: user.plate,
      location: { lat, lng },
      audioUrl: audioUrl || null,
      audioDuration: audioDuration || 0
    });
    await alert.save();

    // Save as message too
    const message = new Message({
      groupId,
      userId: user._id,
      userName: user.name,
      userVehicle: user.vehicleType,
      type: 'alert',
      audioUrl: audioUrl || null,
      audioDuration: audioDuration || 0
    });
    await message.save();

    // Update user stats
    user.lastAlertAt = new Date();
    user.totalAlertsSent += 1;
    user.status = 'danger';
    await user.save();

    // Get group members
    const groupMembers = await User.find({
      _id: { $in: group.members, $ne: user._id },
      status: 'online'
    });

    // Send notifications via Socket.io
    groupMembers.forEach(member => {
      io.to(member._id.toString()).emit('alert:incoming', {
        alertId: alert.alertId,
        groupId: group._id,
        userName: user.name,
        userPhone: user.phone,
        userVehicle: user.vehicleType,
        userPlate: user.plate,
        lat, lng,
        distance: Math.round(getDistance(lat, lng, member.lat, member.lng)),
        createdAt: alert.createdAt,
        audioUrl: alert.audioUrl,
        audioDuration: alert.audioDuration
      });
    });

    io.to(groupId).emit('alert:new', {
      alertId: alert.alertId,
      userName: user.name,
      lat, lng,
      createdAt: alert.createdAt,
      audioUrl: alert.audioUrl
    });

    res.json({
      success: true,
      alertId: alert.alertId,
      message: 'تم إرسال البلاغ بنجاح'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// Cancel alert
app.post('/api/alerts/:alertId/cancel', auth, async (req, res) => {
  try {
    const alert = await Alert.findOne({ alertId: req.params.alertId, userId: req.userId });
    if (!alert) return res.status(404).json({ error: 'البلاغ غير موجود' });

    alert.status = 'cancelled';
    await alert.save();

    await User.findByIdAndUpdate(req.userId, { status: 'online' });

    io.to(alert.groupId.toString()).emit('alert:cancelled', { alertId: alert.alertId });
    res.json({ success: true, message: 'تم إلغاء البلاغ' });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// Verify alert
app.post('/api/alerts/:alertId/verify', auth, async (req, res) => {
  try {
    const { type, reason } = req.body;
    const alert = await Alert.findOne({ alertId: req.params.alertId });
    if (!alert) return res.status(404).json({ error: 'البلاغ غير موجود' });
    if (alert.status === 'cancelled') return res.status(400).json({ error: 'البلاغ ملغى' });

    const user = await User.findById(req.userId);
    const existing = alert.verifications.find(v => v.userId.toString() === req.userId);
    if (existing) return res.status(400).json({ error: 'لقد قمت بالتحقق من هذا البلاغ مسبقاً' });

    alert.verifications.push({
      userId: req.userId,
      userName: user.name,
      type,
      reason: reason || ''
    });

    if (type === 'confirm') alert.confirmCount += 1;
    else alert.denyCount += 1;

    // Auto-false after 3 denies
    if (alert.denyCount >= 3 && alert.status === 'active') {
      alert.status = 'false_alarm';
      const sender = await User.findById(alert.userId);
      if (sender) {
        sender.falseAlertCount += 1;
        sender.penaltyUntil = new Date(Date.now() + PENALTY_DURATION * 60000);
        sender.status = 'online';
        await sender.save();

        io.to(sender._id.toString()).emit('alert:penalty', {
          message: `تم تحديد بلاغك ككاذب. محظور لمدة ${PENALTY_DURATION} دقيقة.`,
          penaltyUntil: sender.penaltyUntil
        });
      }
    }

    if (alert.confirmCount >= 2 && alert.status === 'active') {
      alert.status = 'verified';
    }

    await alert.save();

    io.to(alert.groupId.toString()).emit('alert:verified', {
      alertId: alert.alertId,
      type,
      userName: user.name,
      confirmCount: alert.confirmCount,
      denyCount: alert.denyCount
    });

    res.json({ success: true, message: type === 'confirm' ? 'تم تأكيد البلاغ' : 'تم نفي البلاغ' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// Resolve alert
app.post('/api/alerts/:alertId/resolve', auth, async (req, res) => {
  try {
    const alert = await Alert.findOne({ alertId: req.params.alertId });
    if (!alert) return res.status(404).json({ error: 'البلاغ غير موجود' });

    alert.status = 'resolved';
    alert.resolvedBy = req.userId;
    alert.resolvedAt = new Date();
    await alert.save();

    await User.findByIdAndUpdate(req.userId, { $inc: { helpedDrivers: 1 } });
    await User.findByIdAndUpdate(alert.userId, { status: 'online' });

    io.to(alert.groupId.toString()).emit('alert:resolved', { alertId: alert.alertId });
    res.json({ success: true, message: 'تم حل البلاغ' });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// Get active alerts for group
app.get('/api/groups/:groupId/alerts', auth, async (req, res) => {
  try {
    const alerts = await Alert.find({
      groupId: req.params.groupId,
      status: { $in: ['active', 'verified'] },
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 });
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ===== ADMIN ROUTES =====
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (!admin) return res.status(400).json({ error: 'بيانات الدخول غير صحيحة' });

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) return res.status(400).json({ error: 'بيانات الدخول غير صحيحة' });

    const token = jwt.sign({ id: admin._id, role: admin.role }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, admin: { username: admin.username, role: admin.role } });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const onlineUsers = await User.countDocuments({ status: 'online' });
    const activeAlerts = await Alert.countDocuments({ status: { $in: ['active', 'verified'] } });
    const falseAlerts = await Alert.countDocuments({ status: 'false_alarm' });
    const resolvedAlerts = await Alert.countDocuments({ status: 'resolved' });
    const blockedUsers = await User.countDocuments({ isBlocked: true });
    const totalGroups = await Group.countDocuments();

    res.json({ totalUsers, onlineUsers, activeAlerts, falseAlerts, resolvedAlerts, blockedUsers, totalGroups });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

app.get('/api/admin/alerts', adminAuth, async (req, res) => {
  try {
    const alerts = await Alert.find()
      .populate('userId', 'name phone vehicleType')
      .populate('groupId', 'name city')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

app.get('/api/admin/users', adminAuth, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

app.post('/api/admin/users/:userId/block', adminAuth, async (req, res) => {
  try {
    const { block } = req.body;
    const user = await User.findByIdAndUpdate(req.params.userId, { isBlocked: block }, { new: true });
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    io.to(user._id.toString()).emit('account:blocked', { blocked: block });
    res.json({ success: true, message: block ? 'تم حظر المستخدم' : 'تم إلغاء الحظر' });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ===== SOCKET.IO =====
const connectedUsers = new Map();

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('auth', async (token) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (user) {
        socket.userId = user._id.toString();
        socket.join(user._id.toString());
        connectedUsers.set(user._id.toString(), socket.id);

        user.status = 'online';
        user.lastSeen = new Date();
        await user.save();

        // Join user's groups
        const groups = await Group.find({ members: user._id });
        groups.forEach(g => socket.join(g._id.toString()));

        socket.broadcast.emit('user:online', { userId: user._id, name: user.name });
      }
    } catch (err) {
      console.log('Socket auth failed');
    }
  });

  // Join group room
  socket.on('group:join', (groupId) => {
    socket.join(groupId);
  });

  // Leave group room
  socket.on('group:leave', (groupId) => {
    socket.leave(groupId);
  });

  // Live audio streaming for PTT
  socket.on('ptt:start', async (data) => {
    const { groupId } = data;
    if (!socket.userId || !groupId) return;

    socket.to(groupId).emit('ptt:started', {
      userId: socket.userId,
      message: '🔴 بث صوتي مباشر!'
    });
  });

  socket.on('ptt:chunk', (data) => {
    const { groupId, chunk } = data;
    if (!socket.userId || !groupId) return;

    socket.to(groupId).emit('ptt:audio', {
      userId: socket.userId,
      chunk
    });
  });

  socket.on('ptt:stop', (data) => {
    const { groupId } = data;
    if (!groupId) return;

    socket.to(groupId).emit('ptt:stopped', { userId: socket.userId });
  });

  // Location updates
  socket.on('location:update', async (data) => {
    if (!socket.userId) return;
    const { lat, lng } = data;
    await User.findByIdAndUpdate(socket.userId, { lat, lng, lastSeen: new Date() });
    socket.broadcast.emit('user:moved', { userId: socket.userId, lat, lng });
  });

  // Disconnect
  socket.on('disconnect', async () => {
    if (socket.userId) {
      connectedUsers.delete(socket.userId);
      await User.findByIdAndUpdate(socket.userId, { status: 'offline', lastSeen: new Date() });
      socket.broadcast.emit('user:offline', { userId: socket.userId });
    }
    console.log('Client disconnected:', socket.id);
  });
});

// ===== DATABASE & SERVER START =====
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/al-muraqib';

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('✅ MongoDB Connected');

    // Create default admin if not exists
    const adminExists = await Admin.findOne({ username: 'admin' });
    if (!adminExists) {
      const hashed = await bcrypt.hash('admin123', 10);
      await Admin.create({ username: 'admin', password: hashed, role: 'superadmin' });
      console.log('🔑 Default admin created: admin / admin123');
    }

    server.listen(PORT, () => {
      console.log(`🚀 المراقب يعمل على البورت ${PORT}`);
      console.log(`📊 الإعدادات:`);
      console.log(`  - Cooldown: ${ALERT_COOLDOWN} دقائق`);
      console.log(`  - Max alerts/hour: ${MAX_ALERTS_PER_HOUR}`);
      console.log(`  - Penalty: ${PENALTY_DURATION} دقائق`);
      console.log(`  - Audio retention: ${AUDIO_RETENTION} دقائق`);
      console.log(`  - Max audio duration: ${MAX_AUDIO_DURATION} ثانية`);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });
