/* ============================================================
   server.js — سيرفر بوابة المساعد الدراسي
   نظام: حساب واحد فيه عدة مستخدمين
   ============================================================ */

var express = require('express');
var bcrypt = require('bcryptjs');
var jwt = require('jsonwebtoken');
var cookieParser = require('cookie-parser');
var path = require('path');
var db = require('./db');
function parseJsonField(value, fallback) {
    if (value == null) return fallback;
    if (typeof value === 'object') return value;   // JSONB يرجع كائنًا جاهزًا
    try { return JSON.parse(value); } catch (e) { return fallback; }
}
var app = express();
var PORT = process.env.PORT || 3000;

var JWT_SECRET = process.env.JWT_SECRET || 'study-portal-secret-' + Date.now();

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

/* ============================================================
   دوال مساعدة
   ============================================================ */

/* رمز الحساب */
function signAccountToken(account) {
    return jwt.sign(
        { accountId: account.id, username: account.username, type: 'account' },
        JWT_SECRET,
        { expiresIn: '30d' }
    );
}

/* رمز المستخدم */
function signUserToken(user, accountId) {
    return jwt.sign(
        { userId: user.id, accountId: accountId, name: user.name, type: 'user' },
        JWT_SECRET,
        { expiresIn: '30d' }
    );
}

/* التحقق من رمز الحساب */
function accountAuthRequired(req, res, next) {
    var token = req.cookies.account_token ||
        (req.headers.authorization && req.headers.authorization.replace('Bearer ', ''));
    if (!token) {
        return res.status(401).json({ error: 'not_authenticated' });
    }
    try {
        var payload = jwt.verify(token, JWT_SECRET);
        if (payload.type !== 'account') {
            return res.status(401).json({ error: 'wrong_token_type' });
        }
        req.accountId = payload.accountId;
        req.accountUsername = payload.username;
        next();
    } catch (e) {
        return res.status(401).json({ error: 'invalid_token' });
    }
}

/* التحقق من رمز المستخدم */
function userAuthRequired(req, res, next) {
    var token = req.cookies.user_token ||
        (req.headers.authorization && req.headers.authorization.replace('Bearer ', ''));
    if (!token) {
        return res.status(401).json({ error: 'not_authenticated' });
    }
    try {
        var payload = jwt.verify(token, JWT_SECRET);
        if (payload.type !== 'user') {
            return res.status(401).json({ error: 'wrong_token_type' });
        }
        req.userId = payload.userId;
        req.accountId = payload.accountId;
        req.userName = payload.name;
        next();
    } catch (e) {
        return res.status(401).json({ error: 'invalid_token' });
    }
}

function setCookie(res, name, token, days) {
    res.cookie(name, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: days * 24 * 3600 * 1000
    });
}

/* ============================================================
   المصادقة — الحسابات
   ============================================================ */

/* إنشاء حساب جديد */
app.post('/api/account/register', async function(req, res) {
    try {
        var username = (req.body.username || '').trim();
        var password = req.body.password || '';

        if (!username || !password) {
            return res.status(400).json({ error: 'missing_fields', message: 'الاسم وكلمة السر مطلوبان' });
        }
        if (username.length < 3) {
            return res.status(400).json({ error: 'username_too_short', message: 'اسم الحساب قصير (3 أحرف على الأقل)' });
        }
        if (password.length < 4) {
            return res.status(400).json({ error: 'password_too_short', message: 'كلمة السر قصيرة (4 أحرف على الأقل)' });
        }

        var existing = await db.findAccountByUsername(username);
        if (existing) {
            return res.status(409).json({ error: 'username_taken', message: 'اسم الحساب مستعمل' });
        }

        var hashed = bcrypt.hashSync(password, 10);
        var accountId = await db.createAccount(username, hashed);

        var account = { id: accountId, username: username };
        var token = signAccountToken(account);
        setCookie(res, 'account_token', token, 30);

        res.json({ ok: true, account: account, token: token });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'server_error', message: 'خطأ في السيرفر' });
    }
});

/* تسجيل دخول الحساب */
app.post('/api/account/login', async function(req, res) {
    try {
        var username = (req.body.username || '').trim();
        var password = req.body.password || '';

        if (!username || !password) {
            return res.status(400).json({ error: 'missing_fields', message: 'الاسم وكلمة السر مطلوبان' });
        }

        var account = await db.findAccountByUsername(username);
        if (!account) {
            return res.status(401).json({ error: 'invalid_credentials', message: 'اسم الحساب أو كلمة السر غير صحيحة' });
        }

        var ok = bcrypt.compareSync(password, account.password);
        if (!ok) {
            return res.status(401).json({ error: 'invalid_credentials', message: 'اسم الحساب أو كلمة السر غير صحيحة' });
        }

        var token = signAccountToken(account);
        setCookie(res, 'account_token', token, 30);

        res.json({ ok: true, account: { id: account.id, username: account.username }, token: token });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'server_error', message: 'خطأ في السيرفر' });
    }
});

/* تسجيل خروج الحساب */
app.post('/api/account/logout', function(req, res) {
    res.clearCookie('account_token');
    res.clearCookie('user_token');
    res.json({ ok: true });
});

/* معلومات الحساب الحالي */
app.get('/api/account/me', accountAuthRequired, async function(req, res) {
    try {
        var account = await db.findAccountById(req.accountId);
        if (!account) {
            return res.status(404).json({ error: 'not_found' });
        }
        res.json({ account: { id: account.id, username: account.username } });
    } catch (err) {
        res.status(500).json({ error: 'server_error' });
    }
});

/* ============================================================
   إدارة المستخدمين
   ============================================================ */

/* جلب قائمة المستخدمين في الحساب */
app.get('/api/users', accountAuthRequired, async function(req, res) {
    try {
        var users = await db.getUsersByAccount(req.accountId);
        res.json({ users: users });
    } catch (err) {
        console.error('Get users error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* إضافة مستخدم جديد للحساب */
app.post('/api/users', accountAuthRequired, async function(req, res) {
    try {
        var name = (req.body.name || '').trim();
        var password = (req.body.password || '').trim();

        if (!name) {
            return res.status(400).json({ error: 'missing_name', message: 'اسم المستخدم مطلوب' });
        }
        if (name.length < 2) {
            return res.status(400).json({ error: 'name_too_short', message: 'الاسم قصير جدا' });
        }

        var existing = await db.findUserByName(req.accountId, name);
        if (existing) {
            return res.status(409).json({ error: 'name_taken', message: 'يوجد مستخدم بهذا الاسم' });
        }

        var hashed = password ? bcrypt.hashSync(password, 10) : '';
        var userId = await db.createUser(req.accountId, name, hashed);

        res.json({ ok: true, userId: userId, name: name });
    } catch (err) {
        console.error('Create user error:', err);
        res.status(500).json({ error: 'server_error', message: 'خطأ في السيرفر' });
    }
});

/* تسجيل دخول مستخدم */
app.post('/api/users/:userId/login', accountAuthRequired, async function(req, res) {
    try {
        var userId = parseInt(req.params.userId, 10);
        var password = (req.body.password || '').trim();

        var user = await db.findUserById(userId);
        if (!user) {
            return res.status(404).json({ error: 'user_not_found' });
        }
        /* تأكد أن المستخدم ينتمي إلى الحساب */
        if (user.account_id !== req.accountId) {
            return res.status(403).json({ error: 'forbidden', message: 'غير مسموح' });
        }
        /* تحقق من أن المستخدم غير معطّل */
        if (user.disabled) {
            return res.status(403).json({ 
                error: 'user_disabled', 
                message: 'هذا الحساب معطّل. تواصل مع المدير.' 
            });
        }
        /* إذا كان للمستخدم كلمة سر، تحقق منها */
        if (user.password && user.password.length > 0) {
            var ok = bcrypt.compareSync(password, user.password);
            if (!ok) {
                return res.status(401).json({ error: 'invalid_password', message: 'كلمة السر غير صحيحة' });
            }
        }

        var token = signUserToken(user, req.accountId);
        setCookie(res, 'user_token', token, 30);

        res.json({ ok: true, user: { id: user.id, name: user.name } });
    } catch (err) {
        console.error('User login error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* حذف مستخدم */
app.delete('/api/users/:userId', accountAuthRequired, async function(req, res) {
    try {
        var userId = parseInt(req.params.userId, 10);

        var user = await db.findUserById(userId);
        if (!user) {
            return res.status(404).json({ error: 'user_not_found' });
        }
        if (user.account_id !== req.accountId) {
            return res.status(403).json({ error: 'forbidden' });
        }

        await db.deleteUser(userId);
        res.json({ ok: true });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* ============================================================
   بيانات المستخدم (بعد الدخول)
   ============================================================ */

/* جلب بيانات المستخدم الحالي */
app.get('/api/me', userAuthRequired, async function(req, res) {
    try {
        var user = await db.findUserById(req.userId);
        if (!user) {
            return res.status(404).json({ error: 'not_found' });
        }

        var data = (await db.getUserData(req.userId)) || {};

        var subjects = [];
var timetable = {};
var homework = [];
var preparation = {};
var prepChecked = { date: null, checked: {} };

try { subjects = JSON.parse(data.subjects || '[]'); } catch (e) { subjects = []; }
try { timetable = JSON.parse(data.timetable || '{}'); } catch (e) { timetable = {}; }
try { homework = JSON.parse(data.homework || '[]'); } catch (e) { homework = []; }
preparation = parseJsonField(data.preparation, {});
prepChecked = parseJsonField(data.prep_checked, { date: null, checked: {} });
var extras = parseJsonField(data.extras, {});       
res.json({
    user: {
        id: user.id,
        name: user.name,
        avatar: user.avatar || '',
        grade: user.grade || '',
        term: user.term || '',
        examType: user.exam_type || '',
        schoolYear: user.school_year || '',
        subjects: subjects,
        timetable: timetable,
        homework: homework,
        preparation: preparation,
        prepChecked: prepChecked,
        extras: extras,
        lang: data.lang || 'ar',
        darkMode: !!data.dark_mode
    }
});
    } catch (err) {
        console.error('Me error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* حفظ بيانات المستخدم الحالي */
app.put('/api/me', userAuthRequired, async function(req, res) {
    try {
        var body = req.body || {};

        if (body.avatar != null || body.grade != null || body.term != null ||
            body.examType != null || body.schoolYear != null) {
            await db.updateUserProfile(req.userId, {
                avatar: body.avatar,
                grade: body.grade,
                term: body.term,
                examType: body.examType,
                schoolYear: body.schoolYear
            });
        }

        var currentData = (await db.getUserData(req.userId)) || {};

        var subjects = body.subjects != null ? body.subjects : null;
var timetable = body.timetable != null ? body.timetable : null;
var homework = body.homework != null ? body.homework : null;
var preparation = body.preparation != null ? body.preparation : null;
var prepChecked = body.prepChecked != null ? body.prepChecked : null;
var extras = body.extras != null ? body.extras : null;       
var lang = body.lang != null ? body.lang : null;
var darkMode = body.darkMode != null ? body.darkMode : null;

if (subjects == null) {
    try { subjects = JSON.parse(currentData.subjects || '[]'); } catch (e) { subjects = []; }
}
if (timetable == null) {
    try { timetable = JSON.parse(currentData.timetable || '{}'); } catch (e) { timetable = {}; }
}
if (homework == null) {
    try { homework = JSON.parse(currentData.homework || '[]'); } catch (e) { homework = []; }
}
if (preparation == null) preparation = parseJsonField(currentData.preparation, {});
if (prepChecked == null) prepChecked = parseJsonField(currentData.prep_checked, { date: null, checked: {} });
if (extras == null) extras = parseJsonField(currentData.extras, {});
if (lang == null) lang = currentData.lang || 'ar';
if (darkMode == null) darkMode = !!currentData.dark_mode;

await db.saveUserData(req.userId, {
    subjects: subjects,
    timetable: timetable,
    homework: homework,
    preparation: preparation,
    prepChecked: prepChecked,
    extras: extras,
    lang: lang,
    darkMode: darkMode
});

        res.json({ ok: true, savedAt: new Date().toISOString() });
    } catch (err) {
        console.error('Save error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});
/* ============================================================
   نسخ إعدادات من مستخدم
   ============================================================ */
app.post('/api/users/copy', accountAuthRequired, async function(req, res) {
    try {
        var sourceUserId = parseInt(req.body.sourceUserId, 10);
        var targetName = (req.body.targetName || '').trim();
        var targetPassword = (req.body.targetPassword || '').trim();

        if (!sourceUserId || !targetName) {
            return res.status(400).json({ error: 'missing_fields', message: 'املأ كل الحقول' });
        }

        /* تحقق أن المستخدم المصدر ينتمي إلى هذا الحساب */
        var sourceUser = await db.findUserById(sourceUserId);
        if (!sourceUser || sourceUser.account_id !== req.accountId) {
            return res.status(403).json({ error: 'forbidden', message: 'المستخدم المصدر غير موجود' });
        }

        /* تحقق أن الاسم غير موجود */
        var existing = await db.findUserByName(req.accountId, targetName);
        if (existing) {
            return res.status(409).json({ error: 'name_taken', message: 'يوجد مستخدم بهذا الاسم' });
        }

        /* إنشاء المستخدم الجديد */
        var hashed = targetPassword ? bcrypt.hashSync(targetPassword, 10) : '';
        var newUserId = await db.createUser(req.accountId, targetName, hashed);

        /* نسخ الإعدادات */
        await db.copyUserSettings(sourceUserId, newUserId);

        res.json({ ok: true, userId: newUserId, name: targetName });
    } catch (err) {
        console.error('Copy user error:', err);
        res.status(500).json({ error: 'server_error', message: 'خطأ في السيرفر' });
    }
});

/* ============================================================
   دروس خصوصية (التدارك)
   ============================================================ */

/* جلب كل الجلسات */
app.get('/api/tutoring', userAuthRequired, async function(req, res) {
    try {
        var sessions = await db.getTutoringSessions(req.userId);
        res.json({ sessions: sessions });
    } catch (err) {
        console.error('Get tutoring error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* إنشاء جلسة جديدة */
app.post('/api/tutoring', userAuthRequired, async function(req, res) {
    try {
        var body = req.body || {};
        if (!body.subjectId || !body.name || !body.startDate || !body.endDate) {
            return res.status(400).json({ error: 'missing_fields', message: 'املأ كل الحقول المطلوبة' });
        }
        var id = await db.createTutoringSession(req.userId, {
            subjectId: body.subjectId,
            name: body.name,
            scheduleType: body.scheduleType || 'weekly',
            weekDay: body.weekDay || '',
            intervalDays: body.intervalDays || 7,
            startDate: body.startDate,
            endDate: body.endDate,
            timeStart: body.timeStart || '',
            timeEnd: body.timeEnd || '',
            room: body.room || '',
            addToTimetable: body.addToTimetable
        });
        res.json({ ok: true, id: id });
    } catch (err) {
        console.error('Create tutoring error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* تحديث جلسة */
app.put('/api/tutoring/:id', userAuthRequired, async function(req, res) {
    try {
        var sessionId = parseInt(req.params.id, 10);
        var existing = await db.getTutoringSessionById(sessionId, req.userId);
        if (!existing) {
            return res.status(404).json({ error: 'not_found' });
        }
        var body = req.body || {};
        await db.updateTutoringSession(sessionId, req.userId, {
            subjectId: body.subjectId,
            name: body.name,
            scheduleType: body.scheduleType,
            weekDay: body.weekDay,
            intervalDays: body.intervalDays,
            startDate: body.startDate,
            endDate: body.endDate,
            timeStart: body.timeStart,
            timeEnd: body.timeEnd,
            room: body.room,
            addToTimetable: body.addToTimetable
        });
        res.json({ ok: true });
    } catch (err) {
        console.error('Update tutoring error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* حذف جلسة */
app.delete('/api/tutoring/:id', userAuthRequired, async function(req, res) {
    try {
        var sessionId = parseInt(req.params.id, 10);
        await db.deleteTutoringSession(sessionId, req.userId);
        res.json({ ok: true });
    } catch (err) {
        console.error('Delete tutoring error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* جلب تمارين جلسة */
app.get('/api/tutoring/:id/items', userAuthRequired, async function(req, res) {
    try {
        var sessionId = parseInt(req.params.id, 10);
        /* تحقق أن الجلسة للمستخدم */
        var existing = await db.getTutoringSessionById(sessionId, req.userId);
        if (!existing) {
            return res.status(404).json({ error: 'not_found' });
        }
        var items = await db.getTutoringItems(sessionId);
        res.json({ items: items });
    } catch (err) {
        console.error('Get tutoring items error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* إضافة تمرين */
app.post('/api/tutoring/:id/items', userAuthRequired, async function(req, res) {
    try {
        var sessionId = parseInt(req.params.id, 10);
        var existing = await db.getTutoringSessionById(sessionId, req.userId);
        if (!existing) {
            return res.status(404).json({ error: 'not_found' });
        }
        var body = req.body || {};
        if (!body.sessionDate || !body.label) {
            return res.status(400).json({ error: 'missing_fields' });
        }
        var id = await db.createTutoringItem(sessionId, {
            sessionDate: body.sessionDate,
            label: body.label,
            checked: body.checked,
            note: body.note || ''
        });
        res.json({ ok: true, id: id });
    } catch (err) {
        console.error('Create tutoring item error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* تحديث تمرين */
app.put('/api/tutoring/items/:itemId', userAuthRequired, async function(req, res) {
    try {
        var itemId = parseInt(req.params.itemId, 10);
        var body = req.body || {};
        await db.updateTutoringItem(itemId, {
            label: body.label,
            checked: body.checked,
            note: body.note
        });
        res.json({ ok: true });
    } catch (err) {
        console.error('Update tutoring item error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* حذف تمرين */
app.delete('/api/tutoring/items/:itemId', userAuthRequired, async function(req, res) {
    try {
        var itemId = parseInt(req.params.itemId, 10);
        await db.deleteTutoringItem(itemId);
        res.json({ ok: true });
    } catch (err) {
        console.error('Delete tutoring item error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});
/* ============================================================
   المساعد الذكي (Gemini AI - New SDK)
   ============================================================ */

var { GoogleGenAI } = require('@google/genai');

var GEMINI_API_KEY = process.env.GEMINI_API_KEY;
var genAI = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

if (genAI) {
    console.log('✓ Gemini AI: مفتاح موجود');
} else {
    console.log('⚠️ Gemini AI: مفتاح مفقود');
}

/* مخزن مؤقت للمحادثات (RAM — يُحذف بعد 30 دقيقة) */
var aiChats = {};  /* { userId: { messages: [...], expiresAt: timestamp } } */

var AI_CHAT_TTL = 30 * 60 * 1000;  /* 30 دقيقة */

/* تنظيف كل 5 دقائق */
setInterval(function() {
    var now = Date.now();
    var cleaned = 0;
    Object.keys(aiChats).forEach(function(userId) {
        if (aiChats[userId].expiresAt < now) {
            delete aiChats[userId];
            cleaned++;
        }
    });
    if (cleaned > 0) {
        console.log('🧹 AI: تم حذف ' + cleaned + ' محادثة منتهية');
    }
}, 5 * 60 * 1000);

/* جلب محادثة المستخدم */
function getAIChat(userId) {
    if (!aiChats[userId]) {
        aiChats[userId] = {
            messages: [],
            expiresAt: Date.now() + AI_CHAT_TTL
        };
    } else {
        /* جدد الوقت */
        aiChats[userId].expiresAt = Date.now() + AI_CHAT_TTL;
    }
    return aiChats[userId];
}

/* -- مسار: إرسال سؤال -- */
app.post('/api/ai/chat', userAuthRequired, async function(req, res) {
    try {
        if (!genAI) {
            return res.status(503).json({ 
                ok: false, 
                error: 'gemini_not_configured',
                message: 'المساعد الذكي غير مُفعّل.'
            });
        }

        var message = (req.body.message || '').trim();
        if (!message) {
            return res.status(400).json({ ok: false, error: 'empty_message', message: 'اكتب سؤالك' });
        }
        if (message.length > 2000) {
            return res.status(400).json({ ok: false, error: 'too_long', message: 'السؤال طويل جدًا' });
        }

        var chat = getAIChat(req.userId);
        chat.messages.push({ role: 'user', content: message, timestamp: Date.now() });

        /* ابنِ المحتوى */
        var contents = [];
        var recentMessages = chat.messages.slice(-20);
        recentMessages.forEach(function(m) {
            contents.push({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }]
            });
        });

        /* نصيحة تعليمية */
        var systemPrompt = 'أنت مساعد دراسي للطالب ' + (req.userName || '') + 
            '. سنة الثانية ثانوي علوم. أجب بالعربية الفصحى أو الفرنسية. كن موجزًا وواضحًا.';

              /* ═══ محاولة الموديلات الجديدة ═══ */
        var aiText = null;
        var modelsToTry = [
            'gemini-3.8-flash',      /* الأحدث (مقترح من Google) */
            'gemini-2.5-flash',       /* احتياطي */
            'gemini-1.5-flash',       /* احتياطي أخير */
            'gemini-flash-latest'     /* الأحدث التلقائي */
        ];
        var lastErr = null;
        for (var i = 0; i < modelsToTry.length; i++) {
            try {
                console.log('🤖 محاولة الموديل:', modelsToTry[i]);
                
                var result = await genAI.models.generateContent({
                    model: modelsToTry[i],
                    contents: contents,
                    config: {
                        systemInstruction: systemPrompt,
                        maxOutputTokens: 1000,
                        temperature: 0.7
                    }
                });
                
                aiText = result.text;
                console.log('✓ نجح الموديل:', modelsToTry[i]);
                break;
            } catch (e) {
                console.warn('⚠️ فشل', modelsToTry[i], ':', e.message);
                lastErr = e;
            }
        }

        /* ═══ إذا فشلت كل المحاولات ═══ */
        if (!aiText) {
            throw lastErr || new Error('جميع الموديلات فشلت');
        }

        chat.messages.push({ role: 'model', content: aiText, timestamp: Date.now() });

        res.json({
            ok: true,
            reply: aiText,
            expiresAt: chat.expiresAt
        });
    } catch (err) {
        console.error('❌ AI error:', err);
        res.status(500).json({ 
            ok: false, 
            error: 'ai_error',
            message: 'خطأ: ' + (err.message || '')
        });
    }
});
/* -- مسار: جلب المحادثة -- */
app.get('/api/ai/chat', userAuthRequired, async function(req, res) {
    try {
        var chat = aiChats[req.userId] || { messages: [], expiresAt: 0 };
        var now = Date.now();
        var remaining = Math.max(0, chat.expiresAt - now);
        
        res.json({
            ok: true,
            messages: chat.messages.map(function(m) {
                return {
                    role: m.role,
                    content: m.content,
                    timestamp: m.timestamp
                };
            }),
            remainingMs: remaining
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: 'server_error' });
    }
});

/* -- مسار: مسح المحادثة -- */
app.delete('/api/ai/chat', userAuthRequired, async function(req, res) {
    try {
        delete aiChats[req.userId];
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: 'server_error' });
    }
});

/* -- مسار: التحقق من الحالة -- */
app.get('/api/ai/status', userAuthRequired, async function(req, res) {
    res.json({
        ok: true,
        enabled: !!genAI,
        hasChat: !!aiChats[req.userId]
    });
});

/* ============================================================
   خدمة الواجهة
   ============================================================ */
/* ============================================================
   تحديث بيانات المستخدم (الاسم / كلمة السر)
   ============================================================ */

/* تحديث الاسم */
app.put('/api/me/name', userAuthRequired, async function(req, res) {
    try {
        var newName = (req.body.name || '').trim();
        if (!newName || newName.length < 2) {
            return res.status(400).json({ error: 'invalid_name', message: 'الاسم قصير جدا' });
        }
        
        /* تحقق أن الاسم غير موجود في نفس الحساب */
        var existing = await db.findUserByName(req.accountId, newName);
        if (existing && existing.id !== req.userId) {
            return res.status(409).json({ error: 'name_taken', message: 'يوجد مستخدم بهذا الاسم' });
        }
        
        await db.updateUserName(req.userId, newName);
        res.json({ ok: true, name: newName });
    } catch (err) {
        console.error('Update name error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* تغيير كلمة السر - يتطلب القديمة */
app.put('/api/me/password', userAuthRequired, async function(req, res) {
    try {
        var oldPassword = (req.body.oldPassword || '').trim();
        var newPassword = (req.body.newPassword || '').trim();
        
        if (!newPassword || newPassword.length < 4) {
            return res.status(400).json({ error: 'short_password', message: 'كلمة السر قصيرة (4 أحرف على الأقل)' });
        }
        
        /* جلب المستخدم مع كلمة السر */
        var user = await db.getUserWithPassword(req.userId);
        if (!user) {
            return res.status(404).json({ error: 'not_found' });
        }
        
        /* إذا كان للمستخدم كلمة سر حالية، تحقق من القديمة */
        if (user.password && user.password.length > 0) {
            if (!oldPassword) {
                return res.status(400).json({ error: 'old_required', message: 'أدخل كلمة السر القديمة' });
            }
            var ok = bcrypt.compareSync(oldPassword, user.password);
            if (!ok) {
                return res.status(401).json({ error: 'wrong_old', message: 'كلمة السر القديمة غير صحيحة' });
            }
        }
        
        /* تحديث */
        var hashed = bcrypt.hashSync(newPassword, 10);
        await db.updateUserPassword(req.userId, hashed);
        
        res.json({ ok: true });
    } catch (err) {
        console.error('Update password error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});
/* ============================================================
   نظام التقدم اليومي والنقاط والـ Streak
   ============================================================ */

/* جلب حالة Streak الحالية */
app.get('/api/stats', userAuthRequired, async function(req, res) {
    try {
        var stats = await db.getUserStats(req.userId);
        var recent = await db.getRecentProgress(req.userId, 30);
        
        /* احصل على تاريخ اليوم بصيغة YYYY-MM-DD */
        var today = new Date();
        var todayStr = today.getFullYear() + '-' + 
                       String(today.getMonth() + 1).padStart(2, '0') + '-' + 
                       String(today.getDate()).padStart(2, '0');
        
        /* احصل على آخر يوم حقق فيه الهدف */
        var lastCompletedDay = stats.last_completed_day;
        var currentStreak = stats.current_streak || 0;
        
        /* هل اليوم محقق؟ */
        var todayProgress = await db.getDailyProgress(req.userId, todayStr);
        
        /* احسب الأيام الفائتة */
        var missedDays = [];
        var repairCostTotal = 0;
        var repairCost = stats.repair_cost || 20;
        
        if (lastCompletedDay) {
            /* من اليوم التالي لآخر يوم محقق، حتى أمس */
            var yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            var yesterdayStr = yesterday.getFullYear() + '-' + 
                              String(yesterday.getMonth() + 1).padStart(2, '0') + '-' + 
                              String(yesterday.getDate()).padStart(2, '0');
            
            var lastDate = new Date(lastCompletedDay);
            var dayAfterLast = new Date(lastDate);
            dayAfterLast.setDate(dayAfterLast.getDate() + 1);
            
            var checkDate = new Date(dayAfterLast);
            while (checkDate <= yesterday) {
                var checkStr = checkDate.getFullYear() + '-' + 
                              String(checkDate.getMonth() + 1).padStart(2, '0') + '-' + 
                              String(checkDate.getDate()).padStart(2, '0');
                
                var dayProgress = await db.getDailyProgress(req.userId, checkStr);
                if (!dayProgress || !dayProgress.goal_met) {
                    missedDays.push(checkStr);
                }
                checkDate.setDate(checkDate.getDate() + 1);
            }
        }
        
        /* إذا كانت هناك أيام فائتة، احسب التكلفة */
        if (missedDays.length > 0) {
            var cost = repairCost;
            for (var i = 0; i < missedDays.length; i++) {
                repairCostTotal += cost;
                cost += 10; /* +10 نقاط لكل يوم إضافي */
            }
        }
        
        res.json({
            ok: true,
            points: stats.points || 0,
            currentStreak: currentStreak,
            longestStreak: stats.longest_streak || 0,
            lastCompletedDay: lastCompletedDay,
            repairCost: repairCost,
            repairCount: stats.repair_count || 0,
            todayStr: todayStr,
            todayProgress: todayProgress,
            missedDays: missedDays,
            repairCostTotal: repairCostTotal,
            recent: recent
        });
    } catch (err) {
        console.error('Get stats error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* تعيين/تعديل الهدف اليومي */
app.post('/api/stats/goal', userAuthRequired, async function(req, res) {
    try {
        var goalType = req.body.goalType || 'papers';
        var goalValue = parseInt(req.body.goalValue, 10) || 5;
        
        if (goalValue < 1) goalValue = 1;
        if (goalValue > 100) goalValue = 100;
        
        var today = new Date();
        var todayStr = today.getFullYear() + '-' + 
                       String(today.getMonth() + 1).padStart(2, '0') + '-' + 
                       String(today.getDate()).padStart(2, '0');
        
        await db.upsertDailyProgress(req.userId, todayStr, {
            goalType: goalType,
            goalValue: goalValue
        });
        
        res.json({ ok: true, todayStr: todayStr });
    } catch (err) {
        console.error('Set goal error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* إضافة مهمة منجزة (+15 نقطة + زيادة العداد) */
app.post('/api/stats/complete-task', userAuthRequired, async function(req, res) {
    try {
        var delta = parseInt(req.body.delta, 10) || 1;
        var pointsToAdd = delta * 15;
        
        var today = new Date();
        var todayStr = today.getFullYear() + '-' + 
                       String(today.getMonth() + 1).padStart(2, '0') + '-' + 
                       String(today.getDate()).padStart(2, '0');
        
        /* احصل على تقدم اليوم */
        var todayProgress = await db.getDailyProgress(req.userId, todayStr);
        
        if (!todayProgress) {
            /* إنشاء صف لليوم */
            await db.upsertDailyProgress(req.userId, todayStr, {
                goalType: 'papers',
                goalValue: 5,
                currentValue: delta
            });
            todayProgress = await db.getDailyProgress(req.userId, todayStr);
        } else {
            /* زيادة العداد */
            await db.incrementDailyProgress(req.userId, todayStr, delta);
            todayProgress = await db.getDailyProgress(req.userId, todayStr);
        }
        
        /* إضافة النقاط */
        await db.updateUserPoints(req.userId, pointsToAdd);
        
        /* هل تحقق الهدف؟ */
        var goalMetNow = todayProgress.current_value >= todayProgress.goal_value;
        var wasGoalMet = todayProgress.goal_met === 1;
        var bonusPoints = 0;
        var streakBonus = 0;
        
        if (goalMetNow && !wasGoalMet) {
            /* تحقق الهدف لأول مرة اليوم */
            bonusPoints = 20;
            await db.updateUserPoints(req.userId, bonusPoints);
            
            /* تحديث حالة الهدف */
            await db.upsertDailyProgress(req.userId, todayStr, {
                goalMet: true,
                completedAt: new Date().toISOString()
            });
            
            /* تحديث Streak */
            var stats = await db.getUserStats(req.userId);
            var newStreak = (stats.current_streak || 0) + 1;
            var longest = Math.max(stats.longest_streak || 0, newStreak);
            
            /* مكافأة 7 أيام متتالية */
            if (newStreak > 0 && newStreak % 7 === 0) {
                streakBonus = 50;
                await db.updateUserPoints(req.userId, streakBonus);
            }
            
            await db.saveUserStats(req.userId, {
                points: (await db.getUserStats(req.userId)).points,
                currentStreak: newStreak,
                longestStreak: longest,
                lastCompletedDay: todayStr,
                repairCost: stats.repair_cost,
                repairCount: stats.repair_count,
                lastRepairDay: stats.last_repair_day
            });
        }
        
        var finalStats = await db.getUserStats(req.userId);
        
        res.json({
            ok: true,
            pointsAdded: pointsToAdd,
            bonusPoints: bonusPoints,
            streakBonus: streakBonus,
            totalPoints: finalStats.points,
            currentStreak: finalStats.current_streak,
            goalMet: goalMetNow
        });
    } catch (err) {
        console.error('Complete task error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* ترميم الأيام الفائتة */
app.post('/api/stats/repair', userAuthRequired, async function(req, res) {
    try {
        var days = req.body.days || [];  /* مصفوفة من التواريخ */
        if (!Array.isArray(days) || days.length === 0) {
            return res.status(400).json({ error: 'no_days' });
        }
        
        var stats = await db.getUserStats(req.userId);
        var currentCost = stats.repair_cost || 20;
        var totalCost = 0;
        var cost = currentCost;
        
        for (var i = 0; i < days.length; i++) {
            totalCost += cost;
            cost += 10;
        }
        
        if (stats.points < totalCost) {
            return res.status(400).json({ 
                error: 'not_enough_points', 
                needed: totalCost,
                have: stats.points
            });
        }
        
        /* اخصم النقاط */
        await db.updateUserPoints(req.userId, -totalCost);
        
        /* ارجع الأيام الفائتة كـ "محققة" */
        for (var j = 0; j < days.length; j++) {
            await db.ensureDayMet(req.userId, days[j]);
        }
        
        /* احسب الـ Streak الجديد */
        var today = new Date();
        var todayStr = today.getFullYear() + '-' + 
                       String(today.getMonth() + 1).padStart(2, '0') + '-' + 
                       String(today.getDate()).padStart(2, '0');
        
        /* اجلب الأيام المحققة المتتالية قبل اليوم */
        var consecutive = await db.getConsecutiveDays(req.userId, todayStr, 100);
        
        /* احسب عدد الأيام المتتالية */
        var newStreak = 0;
        var checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - 1);
        
        for (var k = 0; k < consecutive.length; k++) {
            var expectedStr = checkDate.getFullYear() + '-' + 
                             String(checkDate.getMonth() + 1).padStart(2, '0') + '-' + 
                             String(checkDate.getDate()).padStart(2, '0');
            if (consecutive[k] === expectedStr) {
                newStreak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                break;
            }
        }
        
        var longest = Math.max(stats.longest_streak || 0, newStreak);
        
        /* حفظ */
        await db.saveUserStats(req.userId, {
            points: stats.points - totalCost,
            currentStreak: newStreak,
            longestStreak: longest,
            lastCompletedDay: consecutive[0] || stats.last_completed_day,
            repairCost: cost,  /* السعر الجديد بعد الزيادة */
            repairCount: (stats.repair_count || 0) + days.length,
            lastRepairDay: todayStr
        });
        
        res.json({
            ok: true,
            costPaid: totalCost,
            newPoints: stats.points - totalCost,
            newStreak: newStreak,
            newRepairCost: cost
        });
    } catch (err) {
        console.error('Repair error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* إعادة تعيين سعر الترميم (دفع 100 نقطة) */
app.post('/api/stats/reset-repair-cost', userAuthRequired, async function(req, res) {
    try {
        var stats = await db.getUserStats(req.userId);
        
        if (stats.points < 100) {
            return res.status(400).json({ 
                error: 'not_enough_points',
                needed: 100,
                have: stats.points
            });
        }
        
        await db.updateUserPoints(req.userId, -100);
        
        var today = new Date();
        var todayStr = today.getFullYear() + '-' + 
                       String(today.getMonth() + 1).padStart(2, '0') + '-' + 
                       String(today.getDate()).padStart(2, '0');
        
        await db.saveUserStats(req.userId, {
            points: stats.points - 100,
            currentStreak: stats.current_streak,
            longestStreak: stats.longest_streak,
            lastCompletedDay: stats.last_completed_day,
            repairCost: 20,  /* إعادة الضبط */
            repairCount: 0,
            lastRepairDay: todayStr
        });
        
        res.json({
            ok: true,
            newPoints: stats.points - 100,
            newRepairCost: 20
        });
    } catch (err) {
        console.error('Reset repair cost error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* حفظ الهدف اليومي */
app.get('/api/stats/today', userAuthRequired, async function(req, res) {
    try {
        var today = new Date();
        var todayStr = today.getFullYear() + '-' + 
                       String(today.getMonth() + 1).padStart(2, '0') + '-' + 
                       String(today.getDate()).padStart(2, '0');
        
        var progress = await db.getDailyProgress(req.userId, todayStr);
        
        if (!progress) {
            /* إنشاء هدف افتراضي */
            await db.upsertDailyProgress(req.userId, todayStr, {
                goalType: 'papers',
                goalValue: 5,
                currentValue: 0
            });
            progress = await db.getDailyProgress(req.userId, todayStr);
        }
        
        res.json({ ok: true, progress: progress, todayStr: todayStr });
    } catch (err) {
        console.error('Get today error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});
/* ============================================================
   نظام تسجيل النتائج الفعلية
   ============================================================ */

/* جلب كل النتائج + الإحصائيات */
app.get('/api/results', userAuthRequired, async function(req, res) {
    try {
        var results = await db.getExamResults(req.userId);
        var coefficients = await db.getSubjectCoefficients(req.userId);
        
        res.json({
            ok: true,
            results: results,
            coefficients: coefficients
        });
    } catch (err) {
        console.error('Get results error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* إضافة نتيجة جديدة */
app.post('/api/results', userAuthRequired, async function(req, res) {
    try {
        var body = req.body || {};
        if (!body.subjectId || !body.subjectName || !body.examType || !body.examDate || body.score == null) {
            return res.status(400).json({ error: 'missing_fields', message: 'املأ كل الحقول المطلوبة' });
        }
        
        var id = await db.createExamResult(req.userId, {
            subjectId: body.subjectId,
            subjectName: body.subjectName,
            examType: body.examType,
            examDate: body.examDate,
            score: parseFloat(body.score),
            maxScore: parseFloat(body.maxScore) || 20,
            coefficient: parseFloat(body.coefficient) || 1,
            note: body.note || ''
        });
        
        res.json({ ok: true, id: id });
    } catch (err) {
        console.error('Create result error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* تحديث نتيجة */
app.put('/api/results/:id', userAuthRequired, async function(req, res) {
    try {
        var resultId = parseInt(req.params.id, 10);
        var existing = await db.getExamResultById(resultId, req.userId);
        if (!existing) {
            return res.status(404).json({ error: 'not_found' });
        }
        
        var body = req.body || {};
        await db.updateExamResult(resultId, req.userId, {
            subjectId: body.subjectId,
            subjectName: body.subjectName,
            examType: body.examType,
            examDate: body.examDate,
            score: body.score != null ? parseFloat(body.score) : null,
            maxScore: body.maxScore != null ? parseFloat(body.maxScore) : null,
            coefficient: body.coefficient != null ? parseFloat(body.coefficient) : null,
            note: body.note
        });
        
        res.json({ ok: true });
    } catch (err) {
        console.error('Update result error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* حذف نتيجة */
app.delete('/api/results/:id', userAuthRequired, async function(req, res) {
    try {
        var resultId = parseInt(req.params.id, 10);
        await db.deleteExamResult(resultId, req.userId);
        res.json({ ok: true });
    } catch (err) {
        console.error('Delete result error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* حفظ معامل مادة */
app.post('/api/results/coefficient', userAuthRequired, async function(req, res) {
    try {
        var body = req.body || {};
        if (!body.subjectId || body.coefficient == null) {
            return res.status(400).json({ error: 'missing_fields' });
        }
        
        await db.setSubjectCoefficient(req.userId, body.subjectId, parseFloat(body.coefficient));
        res.json({ ok: true });
    } catch (err) {
        console.error('Set coefficient error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});
/* ============================================================
   نظام لوحة ولي الأمر
   ============================================================ */

/* رمز جلسة ولي الأمر */
function signParentToken(parent) {
    return jwt.sign(
        { parentId: parent.id, email: parent.email, type: 'parent' },
        JWT_SECRET,
        { expiresIn: '30d' }
    );
}

/* التحقق من رمز ولي الأمر */
function parentAuthRequired(req, res, next) {
    var token = req.cookies.parent_token ||
        (req.headers.authorization && req.headers.authorization.replace('Bearer ', ''));
    if (!token) {
        return res.status(401).json({ error: 'not_authenticated' });
    }
    try {
        var payload = jwt.verify(token, JWT_SECRET);
        if (payload.type !== 'parent') {
            return res.status(401).json({ error: 'wrong_token_type' });
        }
        req.parentId = payload.parentId;
        req.parentEmail = payload.email;
        next();
    } catch (e) {
        return res.status(401).json({ error: 'invalid_token' });
    }
}

/* تسجيل حساب ولي أمر جديد */
app.post('/api/parent/register', async function(req, res) {
    try {
        var email = (req.body.email || '').trim().toLowerCase();
        var password = req.body.password || '';
        var name = (req.body.name || '').trim();
        var phone = (req.body.phone || '').trim();
        
        if (!email || !password || !name) {
            return res.status(400).json({ error: 'missing_fields', message: 'املأ كل الحقول' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: 'invalid_email', message: 'البريد الإلكتروني غير صالح' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'short_password', message: 'كلمة السر قصيرة (6 أحرف على الأقل)' });
        }
        
        var existing = await db.findParentByEmail(email);
        if (existing) {
            return res.status(409).json({ error: 'email_taken', message: 'البريد مستعمل' });
        }
        
        var hashed = bcrypt.hashSync(password, 10);
        var parentId = await db.createParent(email, hashed, name, phone);
        
        var parent = { id: parentId, email: email, name: name };
        var token = signParentToken(parent);
        setCookie(res, 'parent_token', token, 30);
        
        res.json({ ok: true, parent: parent, token: token });
    } catch (err) {
        console.error('Parent register error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* تسجيل دخول ولي الأمر */
app.post('/api/parent/login', async function(req, res) {
    try {
        var email = (req.body.email || '').trim().toLowerCase();
        var password = req.body.password || '';
        
        if (!email || !password) {
            return res.status(400).json({ error: 'missing_fields', message: 'املأ الحقول' });
        }
        
        var parent = await db.findParentByEmail(email);
        if (!parent) {
            return res.status(401).json({ error: 'invalid_credentials', message: 'البريد أو كلمة السر غير صحيحة' });
        }
        
        var ok = bcrypt.compareSync(password, parent.password);
        if (!ok) {
            return res.status(401).json({ error: 'invalid_credentials', message: 'البريد أو كلمة السر غير صحيحة' });
        }
        
        var token = signParentToken(parent);
        setCookie(res, 'parent_token', token, 30);
        
        res.json({
            ok: true,
            parent: { id: parent.id, email: parent.email, name: parent.name },
            token: token
        });
    } catch (err) {
        console.error('Parent login error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* تسجيل خروج ولي الأمر */
app.post('/api/parent/logout', function(req, res) {
    res.clearCookie('parent_token');
    res.json({ ok: true });
});

/* معلومات ولي الأمر الحالي */
app.get('/api/parent/me', parentAuthRequired, async function(req, res) {
    try {
        var parent = await db.findParentById(req.parentId);
        if (!parent) {
            return res.status(404).json({ error: 'not_found' });
        }
        res.json({ parent: { id: parent.id, email: parent.email, name: parent.name, phone: parent.phone } });
    } catch (err) {
        res.status(500).json({ error: 'server_error' });
    }
});

/* جلب أبناء ولي الأمر */
app.get('/api/parent/children', parentAuthRequired, async function(req, res) {
    try {
        var children = await db.getParentChildren(req.parentId);
        res.json({ children: children });
    } catch (err) {
        console.error('Get children error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* ربط ابن بواسطة الكود */
app.post('/api/parent/link', parentAuthRequired, async function(req, res) {
    try {
        var code = (req.body.code || '').trim();
        if (!code || code.length !== 6) {
            return res.status(400).json({ error: 'invalid_code', message: 'الكود يجب أن يكون 6 أرقام' });
        }
        
        var linkCode = await db.findLinkCode(code);
        if (!linkCode) {
            return res.status(404).json({ error: 'code_not_found', message: 'الكود غير صالح أو منتهي' });
        }
        
        /* أنشئ العلاقة */
        var relationId = await db.createParentChild(req.parentId, linkCode.user_id);
        if (!relationId) {
            return res.status(409).json({ error: 'already_linked', message: 'هذا الابن مرتبط بك مسبقاً' });
        }
        
        /* استعمل الكود */
        await db.useLinkCode(linkCode.id);
        
        res.json({ ok: true, message: 'تم إرسال الطلب. في انتظار موافقة ابنك.' });
    } catch (err) {
        console.error('Link error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* إلغاء ربط ابن */
app.delete('/api/parent/children/:userId', parentAuthRequired, async function(req, res) {
    try {
        var userId = parseInt(req.params.userId, 10);
        await db.removeParentChild(req.parentId, userId);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: 'server_error' });
    }
});

/* ============================================================
   Routes للابن
   ============================================================ */

/* توليد كود لربط ولي أمر */
app.post('/api/me/generate-link-code', userAuthRequired, async function(req, res) {
    try {
        var code = await db.createLinkCode(req.userId);
        res.json({ ok: true, code: code });
    } catch (err) {
        console.error('Generate code error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* جلب طلبات ولي الأمر المعلقة */
app.get('/api/me/parent-requests', userAuthRequired, async function(req, res) {
    try {
        var requests = await db.getPendingParentRequests(req.userId);
        res.json({ requests: requests });
    } catch (err) {
        console.error('Get requests error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* قبول طلب ولي الأمر */
app.post('/api/me/parent-requests/accept', userAuthRequired, async function(req, res) {
    try {
        var parentId = parseInt(req.body.parentId, 10);
        if (!parentId) {
            return res.status(400).json({ error: 'missing_parent_id' });
        }
        await db.confirmParentChild(parentId, req.userId);
        res.json({ ok: true });
    } catch (err) {
        console.error('Accept error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* رفض طلب ولي الأمر */
app.post('/api/me/parent-requests/reject', userAuthRequired, async function(req, res) {
    try {
        var parentId = parseInt(req.body.parentId, 10);
        if (!parentId) {
            return res.status(400).json({ error: 'missing_parent_id' });
        }
        await db.removeParentChild(parentId, req.userId);
        res.json({ ok: true });
    } catch (err) {
        console.error('Reject error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* جلب أولياء أمر المستخدم */
app.get('/api/me/parents', userAuthRequired, async function(req, res) {
    try {
        var parents = await db.getUserParents(req.userId);
        res.json({ parents: parents });
    } catch (err) {
        res.status(500).json({ error: 'server_error' });
    }
});

/* جلب بيانات ابن معين لولي الأمر */
app.get('/api/parent/children/:userId/data', parentAuthRequired, async function(req, res) {
    try {
        var userId = parseInt(req.params.userId, 10);
        
        /* تحقق أن الابن مرتبط ومؤكد */
        var children = await db.getParentChildren(req.parentId);
        var child = null;
        for (var i = 0; i < children.length; i++) {
            if (children[i].id === userId && children[i].confirmed) {
                child = children[i];
                break;
            }
        }
        if (!child) {
            return res.status(403).json({ error: 'forbidden', message: 'غير مسموح بالوصول' });
        }
        
        /* بيانات الابن */
        var userData = await db.getUserData(userId);
        var stats = await db.getUserStats(userId);
        var recent = await db.getRecentProgress(userId, 30);
        var results = await db.getExamResults(userId);
        
        /* استخرج المواضيع والواجبات */
        var subjects = [];
        var homework = [];
        try { subjects = JSON.parse(userData.subjects || '[]'); } catch(e) {}
        try { homework = JSON.parse(userData.homework || '[]'); } catch(e) {}
        
        /* احسب التقدم */
        var totalItems = 0, doneItems = 0;
        subjects.forEach(function(s) {
            if (s.sections) {
                s.sections.forEach(function(sec) {
                    sec.items.forEach(function(it) { totalItems++; if (it.checked) doneItems++; });
                });
            } else if (s.items) {
                s.items.forEach(function(it) { totalItems++; if (it.checked) doneItems++; });
            }
        });
        
        var pendingHw = homework.filter(function(h) { return !h.completed; });
        
        res.json({
            ok: true,
            child: {
                id: child.id,
                name: child.name,
                avatar: child.avatar,
                grade: child.grade,
                term: child.term,
                schoolYear: child.school_year
            },
            progress: {
                totalItems: totalItems,
                doneItems: doneItems,
                percent: totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0
            },
            stats: {
                points: stats.points || 0,
                currentStreak: stats.current_streak || 0,
                longestStreak: stats.longest_streak || 0
            },
            homework: {
                pending: pendingHw.length,
                pendingList: pendingHw.slice(0, 10),
                total: homework.length
            },
            recent: recent,
            results: results
        });
    } catch (err) {
        console.error('Get child data error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});
/* ============================================================
   نظام جلسات التركيز (Pomodoro)
   ============================================================ */

/* بدء جلسة جديدة */
app.post('/api/focus/start', userAuthRequired, async function(req, res) {
    try {
        var body = req.body || {};
        
        /* نظف الجلسات القديمة */
        await db.cleanupStaleSessions(req.userId);
        
        /* تحقق من عدم وجود جلسة نشطة */
        var active = await db.getActiveFocusSession(req.userId);
        if (active) {
            return res.status(409).json({ 
                error: 'session_active', 
                message: 'لديك جلسة نشطة بالفعل',
                session: active
            });
        }
        
        var session = await db.startFocusSession(req.userId, {
            subjectId: body.subjectId || '',
            subjectName: body.subjectName || '',
            goal: body.goal || '',
            sessionType: body.sessionType || 'focus',
            plannedMinutes: body.plannedMinutes || 25
        });
        
        res.json({ ok: true, session: session });
    } catch (err) {
        console.error('Start focus error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* إنهاء الجلسة */
app.post('/api/focus/end', userAuthRequired, async function(req, res) {
    try {
        var sessionId = parseInt(req.body.sessionId, 10);
        var actualMinutes = parseInt(req.body.actualMinutes, 10) || 0;
        var completed = !!req.body.completed;
        
        if (!sessionId) {
            return res.status(400).json({ error: 'missing_session_id' });
        }
        
        var result = await db.endFocusSession(sessionId, req.userId, actualMinutes, completed);
        
        /* إذا حسبت كمهمة، أضف النقاط */
        if (result.countedAsTask) {
            await db.updateUserPoints(req.userId, 15);
        }
        
        res.json({ 
            ok: true, 
            countedAsTask: result.countedAsTask,
            pointsEarned: result.countedAsTask ? 15 : 0
        });
    } catch (err) {
        console.error('End focus error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* جلب الجلسة النشطة */
app.get('/api/focus/active', userAuthRequired, async function(req, res) {
    try {
        var active = await db.getActiveFocusSession(req.userId);
        res.json({ ok: true, session: active });
    } catch (err) {
        console.error('Get active focus error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* جلب إحصائيات اليوم */
app.get('/api/focus/today', userAuthRequired, async function(req, res) {
    try {
        var sessions = await db.getTodayFocusSessions(req.userId);
        var stats = await db.getFocusStats(req.userId, 1);
        
        res.json({
            ok: true,
            sessions: sessions,
            stats: stats
        });
    } catch (err) {
        console.error('Get today focus error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* جلب إحصائيات آخر 7 أيام */
app.get('/api/focus/stats', userAuthRequired, async function(req, res) {
    try {
        var days = parseInt(req.query.days, 10) || 7;
        var stats = await db.getFocusStats(req.userId, days);
        var bySubject = await db.getFocusBySubject(req.userId, days);
        var recent = await db.getRecentFocusSessions(req.userId, days);
        
        res.json({
            ok: true,
            stats: stats,
            bySubject: bySubject,
            recent: recent
        });
    } catch (err) {
        console.error('Get focus stats error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* ============================================================
   إضافة ساعات التركيز لبيانات ولي الأمر
   ============================================================ */

/* جلب إحصائيات التركيز لابن معين (لولي الأمر) */
app.get('/api/parent/children/:userId/focus', parentAuthRequired, async function(req, res) {
    try {
        var userId = parseInt(req.params.userId, 10);
        
        /* تحقق أن الابن مرتبط ومؤكد */
        var children = await db.getParentChildren(req.parentId);
        var child = null;
        for (var i = 0; i < children.length; i++) {
            if (children[i].id === userId && children[i].confirmed) {
                child = children[i];
                break;
            }
        }
        if (!child) {
            return res.status(403).json({ error: 'forbidden' });
        }
        
        var stats = await db.getFocusStats(userId, 7);
        var bySubject = await db.getFocusBySubject(userId, 7);
        var todayStats = await db.getFocusStats(userId, 1);
        
        res.json({
            ok: true,
            week: stats,
            today: todayStats,
            bySubject: bySubject
        });
    } catch (err) {
        console.error('Get child focus error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});
/* ============================================================
   لوحة المدير (للحساب ayoub_jawedi فقط)
   ============================================================ */
var ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'ayoub_jawedi';

function adminRequired(req, res, next) {
    accountAuthRequired(req, res, function() {
        if (req.accountUsername !== ADMIN_USERNAME) {
            return res.status(403).json({ error: 'forbidden' });
        }
        next();
    });
}

app.get('/api/admin/overview', adminRequired, async function(req, res) {
    try {
        res.json(await db.getAdminOverview());
    } catch (err) {
        console.error('Admin overview error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});
/* ============================================================
   الجزء الجديد: الإعلان + المحادثات + التعطيل + النشاط
   ============================================================ */

/* ============================================================
   1) الإعلان العام — للمستخدمين
   ============================================================ */

/* جلب الإعلان (لا يحتاج تسجيل دخول) */
app.get('/api/announcement', async function(req, res) {
    try {
        var announcement = await db.getAnnouncement();
        res.json({ ok: true, announcement: announcement });
    } catch (err) {
        console.error('Get announcement error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* ============================================================
   2) المحادثات — للمستخدم
   ============================================================ */

/* جلب كل رسائل المستخدم الحالي */
app.get('/api/messages', userAuthRequired, async function(req, res) {
    try {
        var messages = await db.getUserMessages(req.userId);
        var unreadCount = await db.getUnreadCount(req.userId, 'user');
        res.json({ 
            ok: true, 
            messages: messages,
            unreadCount: unreadCount
        });
    } catch (err) {
        console.error('Get messages error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* إرسال رسالة جديدة (من المستخدم) */
app.post('/api/messages', userAuthRequired, async function(req, res) {
    try {
        var body = (req.body.body || '').trim();
        if (!body) {
            return res.status(400).json({ error: 'empty_message', message: 'الرسالة فارغة' });
        }
        if (body.length > 5000) {
            return res.status(400).json({ error: 'too_long', message: 'الرسالة طويلة جدًا' });
        }
        
        var result = await db.sendMessage(req.userId, 'user', body);
        res.json({ ok: true, messageId: result.id, createdAt: result.createdAt });
    } catch (err) {
        console.error('Send message error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* تحديد الرسائل كمقروءة (المستخدم) */
app.post('/api/messages/read', userAuthRequired, async function(req, res) {
    try {
        await db.markMessagesRead(req.userId, 'user');
        res.json({ ok: true });
    } catch (err) {
        console.error('Mark read error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* ============================================================
   3) الإدارة — التعطيل والتفعيل
   ============================================================ */

/* تعطيل مستخدم */
app.post('/api/admin/users/:userId/disable', adminRequired, async function(req, res) {
    try {
        var userId = parseInt(req.params.userId, 10);
        if (!userId) {
            return res.status(400).json({ error: 'invalid_user_id' });
        }
        
        var user = await db.findUserById(userId);
        if (!user) {
            return res.status(404).json({ error: 'user_not_found' });
        }
        
        await db.setUserDisabled(userId, true);
        res.json({ ok: true, message: 'تم تعطيل المستخدم' });
    } catch (err) {
        console.error('Disable user error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* تفعيل مستخدم */
app.post('/api/admin/users/:userId/enable', adminRequired, async function(req, res) {
    try {
        var userId = parseInt(req.params.userId, 10);
        if (!userId) {
            return res.status(400).json({ error: 'invalid_user_id' });
        }
        
        var user = await db.findUserById(userId);
        if (!user) {
            return res.status(404).json({ error: 'user_not_found' });
        }
        
        await db.setUserDisabled(userId, false);
        res.json({ ok: true, message: 'تم تفعيل المستخدم' });
    } catch (err) {
        console.error('Enable user error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* ============================================================
   4) الإدارة — إعادة تعيين كلمة السر
   ============================================================ */

/* إعادة تعيين كلمة سر مستخدم (المدير يكتب الجديدة) */
app.post('/api/admin/users/:userId/reset-password', adminRequired, async function(req, res) {
    try {
        var userId = parseInt(req.params.userId, 10);
        var newPassword = (req.body.newPassword || '').trim();
        
        if (!userId) {
            return res.status(400).json({ error: 'invalid_user_id' });
        }
        if (!newPassword || newPassword.length < 4) {
            return res.status(400).json({ 
                error: 'short_password', 
                message: 'كلمة السر قصيرة (4 أحرف على الأقل)' 
            });
        }
        
        var user = await db.findUserById(userId);
        if (!user) {
            return res.status(404).json({ error: 'user_not_found' });
        }
        
        var bcrypt = require('bcryptjs');
        var hashed = bcrypt.hashSync(newPassword, 10);
        await db.updateUserPassword(userId, hashed);
        
        res.json({ ok: true, message: 'تم إعادة تعيين كلمة السر' });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* ============================================================
   5) الإدارة — الرسم البياني (النشاط اليومي)
   ============================================================ */

app.get('/api/admin/activity', adminRequired, async function(req, res) {
    try {
        var days = parseInt(req.query.days, 10) || 30;
        var activity = await db.getAdminActivity(days);
        res.json({ ok: true, activity: activity, days: days });
    } catch (err) {
        console.error('Get activity error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* ============================================================
   6) الإدارة — المحادثات
   ============================================================ */

/* قائمة كل المحادثات */
app.get('/api/admin/conversations', adminRequired, async function(req, res) {
    try {
        var conversations = await db.getConversationsList();
        var totalUnread = await db.getTotalUnreadForAdmin();
        res.json({ 
            ok: true, 
            conversations: conversations,
            totalUnread: totalUnread
        });
    } catch (err) {
        console.error('Get conversations error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* جلب محادثة معينة مع مستخدم */
app.get('/api/admin/conversations/:userId', adminRequired, async function(req, res) {
    try {
        var userId = parseInt(req.params.userId, 10);
        if (!userId) {
            return res.status(400).json({ error: 'invalid_user_id' });
        }
        
        var user = await db.findUserById(userId);
        if (!user) {
            return res.status(404).json({ error: 'user_not_found' });
        }
        
        var messages = await db.getUserMessages(userId);
        
        /* حدّد رسائل المستخدم كمقروءة (لأن المدير يقرأها الآن) */
        await db.markMessagesRead(userId, 'admin');
        
        res.json({ 
            ok: true, 
            user: { id: user.id, name: user.name, avatar: user.avatar || '' },
            messages: messages
        });
    } catch (err) {
        console.error('Get conversation error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* رد المدير على مستخدم */
app.post('/api/admin/conversations/:userId/reply', adminRequired, async function(req, res) {
    try {
        var userId = parseInt(req.params.userId, 10);
        var body = (req.body.body || '').trim();
        
        if (!userId) {
            return res.status(400).json({ error: 'invalid_user_id' });
        }
        if (!body) {
            return res.status(400).json({ error: 'empty_message', message: 'الرسالة فارغة' });
        }
        if (body.length > 5000) {
            return res.status(400).json({ error: 'too_long', message: 'الرسالة طويلة جدًا' });
        }
        
        var user = await db.findUserById(userId);
        if (!user) {
            return res.status(404).json({ error: 'user_not_found' });
        }
        
        var result = await db.sendMessage(userId, 'admin', body);
        res.json({ ok: true, messageId: result.id, createdAt: result.createdAt });
    } catch (err) {
        console.error('Admin reply error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* ============================================================
   7) الإدارة — الإعلان العام
   ============================================================ */

/* نشر / تحديث إعلان */
app.post('/api/admin/announcement', adminRequired, async function(req, res) {
    try {
        var text = (req.body.text || '').trim();
        
        if (!text) {
            return res.status(400).json({ error: 'empty_text', message: 'نص الإعلان فارغ' });
        }
        if (text.length > 500) {
            return res.status(400).json({ error: 'too_long', message: 'الإعلان طويل جدًا (500 حرف كحد أقصى)' });
        }
        
        var announcementId = await db.setAnnouncement(text);
        res.json({ ok: true, id: announcementId, message: 'تم نشر الإعلان' });
    } catch (err) {
        console.error('Set announcement error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* حذف الإعلان */
app.delete('/api/admin/announcement', adminRequired, async function(req, res) {
    try {
        await db.clearAnnouncement();
        res.json({ ok: true, message: 'تم حذف الإعلان' });
    } catch (err) {
        console.error('Clear announcement error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* ============================================================
   نهاية الإضافات
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
    console.log('============================================');
});
