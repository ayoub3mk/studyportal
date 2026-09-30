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

        try { subjects = JSON.parse(data.subjects || '[]'); } catch (e) { subjects = []; }
        try { timetable = JSON.parse(data.timetable || '{}'); } catch (e) { timetable = {}; }
        try { homework = JSON.parse(data.homework || '[]'); } catch (e) { homework = []; }

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
        if (lang == null) lang = currentData.lang || 'ar';
        if (darkMode == null) darkMode = !!currentData.dark_mode;

        await db.saveUserData(req.userId, {
            subjects: subjects,
            timetable: timetable,
            homework: homework,
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
