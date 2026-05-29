# 👁️ المراقب - شبكة السلامة على الطريق

## 📋 نظرة عامة

"المراقب" هو تطبيق ويب تفاعلي (PWA) مصمم للسائقين في المغرب. يتيح إنشاء مجموعات حسب المدينة، محادثات صوتية مباشرة (Push-to-Talk)، وإرسال إشعارات خطر فورية مع تسجيل صوتي تلقائي.

## ✨ المميزات

### 🔐 التسجيل البسيط
- **بلا وثائق معقدة**: غير اسم، هاتف، نوع المركبة
- **جميع المركبات**: طاكسي، شاحنات، حافلات، دراجات، سيارات خاصة

### 👥 المجموعات
- مجموعات حسب **المدينة** (الرباط، الدار البيضاء، مراكش...)
- كل مجموعة عندها **مشرف** (Admin)
- أنواع المركبات المسموحة لكل مجموعة

### 🎙️ Push-to-Talk
- اضغط واستمر للتحدث مع المجموعة
- الصوت يخرج **مباشرة** لجميع الأعضاء المتصلين

### 🚨 نظام الإنذار (Toggle)
- **ضغطة واحدة** = تبدأ التسجيل التلقائي
- **ضغطة ثانية** = توقف وترسل البلاغ

### 🗺️ الخريطة التفاعلية
- تتبع GPS فوري لأعضاء المجموعة
- Leaflet.js + OpenStreetMap

### 🛡️ مكافحة البلاغات الكاذبة
- Rate Limiting: 3 بلاغات/ساعة
- Cooldown: 10 دقائق
- تأكيد/نفي من الأعضاء
- حظر 30 دقيقة للبلاغات الكاذبة

### 📢 فضاءات الإشهار
- Top Banner (320×90)
- Bottom Banner (320×50)
- Native Ads

## 🛠️ التقنيات

- **Backend**: Node.js + Express + Socket.io
- **Database**: MongoDB (Mongoose)
- **Frontend**: HTML5 + CSS3 + JavaScript
- **Maps**: Leaflet.js + OpenStreetMap
- **Real-time**: Socket.io WebSocket
- **Container**: Docker + Docker Compose

## 🚀 التشغيل

### Docker (الأسهل)
```bash
cd al-muraqib-app
cp .env.example .env
sudo docker-compose up -d
```

### Node.js مباشرة
```bash
cd al-muraqib-app
npm install
cp .env.example .env
npm start
```

## 🔑 بيانات الدخول

### المستخدم
- سجل حساب جديد من التطبيق

### الأدمن
- **Username**: `admin`
- **Password**: `admin123`
- **URL**: `http://localhost:3000/admin.html`

## 📁 هيكل المشروع

```
al-muraqib-app/
├── server.js              # الخادم الرئيسي
├── package.json           # تبعيات Node.js
├── Dockerfile             # Docker image
├── docker-compose.yml     # Docker services
├── .env.example           # نموذج الإعدادات
├── public/
│   ├── index.html         # واجهة التطبيق
│   ├── app.js             # منطق Frontend
│   ├── style.css          # التنسيقات
│   ├── admin.html         # لوحة التحكم
│   ├── privacy.html       # سياسة الخصوصية
│   ├── manifest.json      # PWA manifest
│   └── sw.js              # Service Worker
├── uploads/               # مجلد التسجيلات الصوتية
└── README.md
```

## 🔒 الأمان

- تشفير كلمات المرور بـ bcrypt
- JWT Tokens للمصادقة
- Rate Limiting للبلاغات
- CORS مفعل
- HTTPS في الإنتاج
- حد أقصى لحجم الملفات (50MB)

## 📝 سياسة الخصوصية

- التسجيلات الصوتية: تُحذف تلقائياً بعد 30 دقيقة
- المواقع القديمة: تُحذف بعد 24 ساعة
- لا بيع للبيانات لشركات خارجية
- المستخدم يمكنه حذف حسابه في أي وقت

## 👨‍💻 المطور

تم تطوير هذا المشروع كحل مفتوح المصدر للسائقين في المغرب.

---

**👁️ المراقب - السلامة أولاً** 🛡️
