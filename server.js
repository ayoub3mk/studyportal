/* ============================================================
   server.js — سيرفر بوابة المساعد الدراسي
   - يخدم ملفات الواجهة من مجلد public
   - يوفر واجهات API لتسجيل الدخول وإنشاء الحسابات
   - يوفر واجهات API لحفظ وجلب بيانات المستخدم
   ============================================================ */

var express = require('express');
var bcrypt = require('bcryptjs');
var jwt = require('jsonwebtoken');
var cookieParser = require('cookie-parser');
var path = require('path');
var db = require('./db');

var app = express();
var PORT = process.env.PORT || 3000;

/* مفتاح تشفير الرموز - في الإنتاج يجب أن يكون في متغير بيئة */
var JWT_SECRET = process.env.JWT_SECRET || 'study-portal-secret-key-change-me-in-production-' + Date.now();

/* الوسائط (middleware) */
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

/* ============================================================
   دوال مساعدة
   ============================================================ */

function signToken(user) {
    return jwt.sign(
        { id: user.id, username: user.username },
        JWT_SECRET,
        { expiresIn: '30d' }
    );
}

function authRequired(req, res, next) {
    var token = req.cookies.token || (req.headers.authorization && req.headers.authorization.replace('Bearer ', ''));
    if (!token) {
        return res.status(401).json({ error: 'not_authenticated' });
    }
    try {
        var payload = jwt.verify(token, JWT_SECRET);
        req.userId = payload.id;
        req.username = payload.username;
        next();
    } catch (e) {
        return res.status(401).json({ error: 'invalid_token' });
    }
}

/* ============================================================
   واجهات المصادقة
   ============================================================ */

/* إنشاء حساب جديد */
app.post('/api/register', function(req, res) {
    var username = (req.body.username || '').trim();
    var password = req.body.password || '';

    if (!username || !password) {
        return res.status(400).json({ error: 'missing_fields', message: 'الاسم وكلمة السر مطلوبان' });
    }
    if (username.length < 3) {
        return res.status(400).json({ error: 'username_too_short', message: 'الاسم قصير جدا (3 أحرف على الأقل)' });
    }
    if (password.length < 4) {
        return res.status(400).json({ error: 'password_too_short', message: 'كلمة السر قصيرة (4 أحرف على الأقل)' });
    }

    var existing = db.findUserByUsername(username);
    if (existing) {
        return res.status(409).json({ error: 'username_taken', message: 'اسم المستخدم مستعمل' });
    }

    var hashed = bcrypt.hashSync(password, 10);
    var userId = db.createUser(username, hashed);

    var user = { id: userId, username: username };
    var token = signToken(user);

    res.cookie('token', token, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 30 * 24 * 3600 * 1000
    });

    res.json({
        ok: true,
        user: user,
        token: token
    });
});

/* تسجيل الدخول */
app.post('/api/login', function(req, res) {
    var username = (req.body.username || '').trim();
    var password = req.body.password || '';

    if (!username || !password) {
        return res.status(400).json({ error: 'missing_fields', message: 'الاسم وكلمة السر مطلوبان' });
    }

    var user = db.findUserByUsername(username);
    if (!user) {
        return res.status(401).json({ error: 'invalid_credentials', message: 'اسم المستخدم أو كلمة السر غير صحيحة' });
    }

    var ok = bcrypt.compareSync(password, user.password);
    if (!ok) {
        return res.status(401).json({ error: 'invalid_credentials', message: 'اسم المستخدم أو كلمة السر غير صحيحة' });
    }

    var token = signToken(user);

    res.cookie('token', token, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 30 * 24 * 3600 * 1000
    });

    res.json({
        ok: true,
        user: { id: user.id, username: user.username },
        token: token
    });
});

/* تسجيل الخروج */
app.post('/api/logout', function(req, res) {
    res.clearCookie('token');
    res.json({ ok: true });
});

/* ============================================================
   واجهات البيانات
   ============================================================ */

/* جلب بيانات المستخدم الحالي */
app.get('/api/me', authRequired, function(req, res) {
    var user = db.findUserById(req.userId);
    if (!user) {
        return res.status(404).json({ error: 'not_found' });
    }

    var data = db.getUserData(req.userId) || {};

    var subjects = [];
    var timetable = {};
    var homework = [];

    try { subjects = JSON.parse(data.subjects || '[]'); } catch (e) { subjects = []; }
    try { timetable = JSON.parse(data.timetable || '{}'); } catch (e) { timetable = {}; }
    try { homework = JSON.parse(data.homework || '[]'); } catch (e) { homework = []; }

    res.json({
        user: {
            id: user.id,
            name: user.username,
            avatar: user.avatar || '',
            grade: user.grade || '',
            term: user.term || '',
            examType: user.exam_type || '',
            schoolYear: user.school_year || '',
            subjects: subjects,
            timetable: timetable,
            homework: homework,
            lang: data.lang || 'ar',
            darkMode: !!data.dark_mode
        }
    });
});

/* حفظ بيانات المستخدم (المواد، الجدول، الواجبات) */
app.put('/api/me', authRequired, function(req, res) {
    var body = req.body || {};

    /* تحديث معلومات الملف الشخصي إذا أُرسلت */
    if (body.avatar != null || body.grade != null || body.term != null ||
        body.examType != null || body.schoolYear != null) {
        db.updateUserProfile(req.userId, {
            avatar: body.avatar,
            grade: body.grade,
            term: body.term,
            examType: body.examType,
            schoolYear: body.schoolYear
        });
    }

    /* تحديث بيانات التطبيق */
    var currentData = db.getUserData(req.userId) || {};

    var subjects = body.subjects != null ? body.subjects : null;
    var timetable = body.timetable != null ? body.timetable : null;
    var homework = body.homework != null ? body.homework : null;
    var lang = body.lang != null ? body.lang : null;
    var darkMode = body.darkMode != null ? body.darkMode : null;

    /* إذا لم تُرسل قيمة، استخدم القيمة الحالية */
    if (subjects == null) {
        try { subjects = JSON.parse(currentData.subjects || '[]'); } catch (e) { subjects = []; }
    }
    if (timetable == null) {
        try { timetable = JSON.parse(currentData.timetable || '{}'); } catch (e) { timetable = {}; }
    }
    if (homework == null) {
        try { homework = JSON.parse(currentData.homework || '[]'); } catch (e) { homework = []; }
    }
    if (lang == null) lang = currentData.lang || 'ar';
    if (darkMode == null) darkMode = !!currentData.dark_mode;

    db.saveUserData(req.userId, {
        subjects: subjects,
        timetable: timetable,
        homework: homework,
        lang: lang,
        darkMode: darkMode
    });

    res.json({ ok: true, savedAt: new Date().toISOString() });
});

/* حذف حساب المستخدم */
app.delete('/api/me', authRequired, function(req, res) {
    db.deleteUser(req.userId);
    res.clearCookie('token');
    res.json({ ok: true });
});

/* ============================================================
   عرض صفحة الواجهة (لأي مسار غير API)
   ============================================================ */
app.get('*', function(req, res) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ============================================================
   تشغيل السيرفر
   ============================================================ */
app.listen(PORT, '0.0.0.0', function() {
    console.log('============================================');
    console.log('  بوابة المساعد الدراسي');
    console.log('  السيرفر يعمل على المنفذ: ' + PORT);
    console.log('  افتح: http://localhost:' + PORT);
    console.log('============================================');
});