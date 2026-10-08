/* ============================================================
   db.js — قاعدة البيانات (Postgres على Supabase)
   نظام: حساب واحد فيه عدة مستخدمين
   ============================================================ */

var { Pool } = require('pg');

var DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('خطأ: DATABASE_URL غير موجود');
    process.exit(1);
}

var pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});

pool.query('SELECT NOW()')
    .then(function() {
        console.log('✓ تم الاتصال بـ Supabase (Postgres)');
    })
    .catch(function(err) {
        console.error('✗ فشل الاتصال:', err.message);
    });

/* ============================================================
   دوال الحسابات (Accounts)
   ============================================================ */

async function createAccount(username, hashedPassword) {
    var result = await pool.query(
        'INSERT INTO accounts (username, password) VALUES ($1, $2) RETURNING id',
        [username, hashedPassword]
    );
    return result.rows[0].id;
}

async function findAccountByUsername(username) {
    var result = await pool.query('SELECT * FROM accounts WHERE username = $1', [username]);
    return result.rows[0] || null;
}

async function findAccountById(id) {
    var result = await pool.query('SELECT * FROM accounts WHERE id = $1', [id]);
    return result.rows[0] || null;
}

/* ============================================================
   دوال المستخدمين (Users)
   ============================================================ */

async function createUser(accountId, name, hashedPassword) {
    var result = await pool.query(
        'INSERT INTO users (account_id, name, password) VALUES ($1, $2, $3) RETURNING id',
        [accountId, name, hashedPassword]
    );
    var userId = result.rows[0].id;
    /* إنشاء صف بيانات فارغ */
    await pool.query('INSERT INTO user_data (user_id) VALUES ($1)', [userId]);
    return userId;
}

async function getUsersByAccount(accountId) {
    var result = await pool.query(
        'SELECT id, name, avatar, grade, term, exam_type, school_year FROM users WHERE account_id = $1 ORDER BY created_at ASC',
        [accountId]
    );
    return result.rows;
}

async function findUserById(userId) {
    var result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    return result.rows[0] || null;
}

async function findUserByName(accountId, name) {
    var result = await pool.query(
        'SELECT * FROM users WHERE account_id = $1 AND name = $2',
        [accountId, name]
    );
    return result.rows[0] || null;
}

async function updateUserProfile(userId, profile) {
    await pool.query(`
        UPDATE users SET
            avatar = COALESCE($1, avatar),
            grade = COALESCE($2, grade),
            term = COALESCE($3, term),
            exam_type = COALESCE($4, exam_type),
            school_year = COALESCE($5, school_year)
        WHERE id = $6
    `, [
        profile.avatar != null ? profile.avatar : null,
        profile.grade != null ? profile.grade : null,
        profile.term != null ? profile.term : null,
        profile.examType != null ? profile.examType : null,
        profile.schoolYear != null ? profile.schoolYear : null,
        userId
    ]);
}

async function deleteUser(userId) {
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
}
/* ============================================================
   لوحة المدير: نظرة عامة على الموقع
   ============================================================ */
async function getAdminOverview() {
    var out = { totals: {}, users: [] };

    async function count(sql) {
        try {
            var r = await pool.query(sql);
            return (r.rows[0] && r.rows[0].n) || 0;
        } catch (e) {
            console.error('admin count error:', e.message);
            return 0;
        }
    }

    out.totals = {
        accounts:  await count('SELECT COUNT(*)::int AS n FROM accounts'),
        users:     await count('SELECT COUNT(*)::int AS n FROM users'),
        parents:   await count('SELECT COUNT(*)::int AS n FROM parent_accounts'),
        newWeek:   await count("SELECT COUNT(*)::int AS n FROM users WHERE created_at > NOW() - INTERVAL '7 days'"),
        activeDay: await count("SELECT COUNT(*)::int AS n FROM user_data WHERE updated_at > NOW() - INTERVAL '1 day'"),
        activeWeek: await count("SELECT COUNT(*)::int AS n FROM user_data WHERE updated_at > NOW() - INTERVAL '7 days'")
    };

    try {
        var r = await pool.query(`
            SELECT u.id, u.name, u.grade, u.created_at,
                   a.username AS account,
                   d.updated_at AS last_active,
                   COALESCE(s.points, 0) AS points,
                   COALESCE(s.current_streak, 0) AS streak
            FROM users u
            JOIN accounts a ON a.id = u.account_id
            LEFT JOIN user_data d ON d.user_id = u.id
            LEFT JOIN user_stats s ON s.user_id = u.id
            ORDER BY d.updated_at DESC NULLS LAST
            LIMIT 500
        `);
        out.users = r.rows;
    } catch (e) {
        console.error('admin users error:', e.message);
    }
    return out;
}
/* ============================================================
   دوال بيانات المستخدم (User Data)
   ============================================================ */

async function getUserData(userId) {
    var result = await pool.query('SELECT * FROM user_data WHERE user_id = $1', [userId]);
    return result.rows[0] || null;
}

async function saveUserData(userId, data) {
    await pool.query(`
        UPDATE user_data SET
            subjects = $1,
            timetable = $2,
            homework = $3,
            preparation = $4,
            prep_checked = $5,
            extras = $6,
            lang = $7,
            dark_mode = $8,
            updated_at = NOW()
        WHERE user_id = $9
    `, [
        JSON.stringify(data.subjects || []),
        JSON.stringify(data.timetable || {}),
        JSON.stringify(data.homework || []),
        JSON.stringify(data.preparation || {}),
        JSON.stringify(data.prepChecked || { date: null, checked: {} }),
        JSON.stringify(data.extras || {}),
        data.lang || 'ar',
        data.darkMode ? 1 : 0,
        userId
    ]);
}

/* ============================================================
   التصدير
   ============================================================ */
/* ============================================================
   دالة نسخ الإعدادات من مستخدم موجود
   تنسخ: المواد (بدون أوراق) + الجدول + إعدادات الملف
   ============================================================ */
/* تحديث اسم المستخدم */
async function updateUserName(userId, newName) {
    var result = await pool.query(
        'UPDATE users SET name = $1 WHERE id = $2 RETURNING id',
        [newName, userId]
    );
    return result.rowCount > 0;
}

/* تحديث كلمة سر المستخدم */
async function updateUserPassword(userId, hashedPassword) {
    var result = await pool.query(
        'UPDATE users SET password = $1 WHERE id = $2 RETURNING id',
        [hashedPassword, userId]
    );
    return result.rowCount > 0;
}

/* جلب المستخدم بكلمة السر */
async function getUserWithPassword(userId) {
    var result = await pool.query(
        'SELECT * FROM users WHERE id = $1',
        [userId]
    );
    return result.rows[0] || null;
}

async function copyUserSettings(sourceUserId, targetUserId) {
    /* جلب مصدر البيانات */
    var sourceUser = await findUserById(sourceUserId);
    if (!sourceUser) throw new Error('source_not_found');
    
    var sourceData = await getUserData(sourceUserId);
    if (!sourceData) throw new Error('source_data_not_found');
    
    /* جلب المواد والجدول من المصدر */
    var sourceSubjects = [];
    var sourceTimetable = {};
    try { sourceSubjects = JSON.parse(sourceData.subjects || '[]'); } catch (e) { sourceSubjects = []; }
    try { sourceTimetable = JSON.parse(sourceData.timetable || '{}'); } catch (e) { sourceTimetable = {}; }
    
    /* نسخ المواد - مع إزالة الأوراق */
    var newSubjects = sourceSubjects.map(function(s) {
        var copy = {
            id: s.id,
            name: s.name,
            examDate: s.examDate || ''
        };
        if (s.sections) {
            /* رياضيات - أقسام بدون أوراق */
            copy.sections = s.sections.map(function(sec) {
                return {
                    key: sec.key,
                    labelKey: sec.labelKey,
                    badgeKey: sec.badgeKey,
                    items: []
                };
            });
        } else {
            /* مادة عادية - بدون أوراق */
            copy.items = [];
        }
        return copy;
    });
    
    /* نسخ الجدول كما هو */
    var newTimetable = JSON.parse(JSON.stringify(sourceTimetable));
    
    /* تحديث الملف الشخصي للمستخدم الجديد */
    await updateUserProfile(targetUserId, {
        grade: sourceUser.grade,
        term: sourceUser.term,
        examType: sourceUser.exam_type,
        schoolYear: sourceUser.school_year
    });
    
    /* حفظ البيانات الجديدة للمستخدم الجديد */
    await saveUserData(targetUserId, {
        subjects: newSubjects,
        timetable: newTimetable,
        homework: [],
        lang: sourceData.lang || 'ar',
        darkMode: !!sourceData.dark_mode
    });
    
    return { ok: true };
}

/* ============================================================
   دوال دروس خصوصية (التدارك)
   ============================================================ */

/* جلب كل جلسات التدارك لمستخدم */
async function getTutoringSessions(userId) {
    var result = await pool.query(
        'SELECT * FROM tutoring_sessions WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
    );
    return result.rows;
}

/* جلب جلسة واحدة */
async function getTutoringSessionById(sessionId, userId) {
    var result = await pool.query(
        'SELECT * FROM tutoring_sessions WHERE id = $1 AND user_id = $2',
        [sessionId, userId]
    );
    return result.rows[0] || null;
}

/* إنشاء جلسة تدارك */
async function createTutoringSession(userId, data) {
    var result = await pool.query(`
        INSERT INTO tutoring_sessions
        (user_id, subject_id, name, schedule_type, week_day, interval_days,
         start_date, end_date, time_start, time_end, room, add_to_timetable)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id
    `, [
        userId,
        data.subjectId,
        data.name,
        data.scheduleType || 'weekly',
        data.weekDay || '',
        data.intervalDays || 7,
        data.startDate,
        data.endDate,
        data.timeStart || '',
        data.timeEnd || '',
        data.room || '',
        data.addToTimetable ? 1 : 0
    ]);
    return result.rows[0].id;
}

/* تحديث جلسة */
async function updateTutoringSession(sessionId, userId, data) {
    await pool.query(`
        UPDATE tutoring_sessions SET
            subject_id = $1,
            name = $2,
            schedule_type = $3,
            week_day = $4,
            interval_days = $5,
            start_date = $6,
            end_date = $7,
            time_start = $8,
            time_end = $9,
            room = $10,
            add_to_timetable = $11
        WHERE id = $12 AND user_id = $13
    `, [
        data.subjectId,
        data.name,
        data.scheduleType || 'weekly',
        data.weekDay || '',
        data.intervalDays || 7,
        data.startDate,
        data.endDate,
        data.timeStart || '',
        data.timeEnd || '',
        data.room || '',
        data.addToTimetable ? 1 : 0,
        sessionId,
        userId
    ]);
}

/* حذف جلسة */
async function deleteTutoringSession(sessionId, userId) {
    await pool.query(
        'DELETE FROM tutoring_sessions WHERE id = $1 AND user_id = $2',
        [sessionId, userId]
    );
}

/* جلب كل تمارين جلسة */
async function getTutoringItems(sessionId) {
    var result = await pool.query(
        'SELECT * FROM tutoring_items WHERE session_id = $1 ORDER BY session_date ASC, created_at ASC',
        [sessionId]
    );
    return result.rows;
}

/* إضافة تمرين لجلسة */
async function createTutoringItem(sessionId, data) {
    var result = await pool.query(`
        INSERT INTO tutoring_items
        (session_id, session_date, label, checked, note)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
    `, [
        sessionId,
        data.sessionDate,
        data.label,
        data.checked ? 1 : 0,
        data.note || ''
    ]);
    return result.rows[0].id;
}

/* تحديث تمرين */
async function updateTutoringItem(itemId, data) {
    await pool.query(`
        UPDATE tutoring_items SET
            label = COALESCE($1, label),
            checked = COALESCE($2, checked),
            note = COALESCE($3, note)
        WHERE id = $4
    `, [
        data.label != null ? data.label : null,
        data.checked != null ? (data.checked ? 1 : 0) : null,
        data.note != null ? data.note : null,
        itemId
    ]);
}

/* حذف تمرين */
async function deleteTutoringItem(itemId) {
    await pool.query('DELETE FROM tutoring_items WHERE id = $1', [itemId]);
}
/* ============================================================
   نظام التقدم اليومي والنقاط والـ Streak
   ============================================================ */

/* جلب إحصائيات المستخدم */
async function getUserStats(userId) {
    var result = await pool.query('SELECT * FROM user_stats WHERE user_id = $1', [userId]);
    if (result.rows.length === 0) {
        /* إنشاء صف جديد إذا لم يكن موجوداً */
        await pool.query('INSERT INTO user_stats (user_id) VALUES ($1)', [userId]);
        result = await pool.query('SELECT * FROM user_stats WHERE user_id = $1', [userId]);
    }
    return result.rows[0];
}

/* تحديث نقاط المستخدم */
async function updateUserPoints(userId, delta) {
    await pool.query(`
        UPDATE user_stats SET
            points = GREATEST(0, points + $1),
            updated_at = NOW()
        WHERE user_id = $2
    `, [delta, userId]);
}

/* حفظ إحصائيات كاملة */
async function saveUserStats(userId, stats) {
    await pool.query(`
        UPDATE user_stats SET
            points = $1,
            current_streak = $2,
            longest_streak = $3,
            last_completed_day = $4,
            repair_cost = $5,
            repair_count = $6,
            last_repair_day = $7,
            updated_at = NOW()
        WHERE user_id = $8
    `, [
        stats.points || 0,
        stats.currentStreak || 0,
        stats.longestStreak || 0,
        stats.lastCompletedDay || null,
        stats.repairCost || 20,
        stats.repairCount || 0,
        stats.lastRepairDay || null,
        userId
    ]);
}

/* جلب تقدم يوم معين */
async function getDailyProgress(userId, day) {
    var result = await pool.query(
        'SELECT * FROM daily_progress WHERE user_id = $1 AND day = $2',
        [userId, day]
    );
    return result.rows[0] || null;
}

/* جلب كل تقدم الأسبوع الأخير */
async function getRecentProgress(userId, days) {
    var result = await pool.query(`
        SELECT * FROM daily_progress 
        WHERE user_id = $1 AND day >= CURRENT_DATE - $2::int
        ORDER BY day DESC
    `, [userId, days || 30]);
    return result.rows;
}

/* إنشاء أو تحديث تقدم اليوم */
async function upsertDailyProgress(userId, day, data) {
    /* تحقق أولاً */
    var existing = await getDailyProgress(userId, day);
    
    if (existing) {
        /* تحديث */
        await pool.query(`
            UPDATE daily_progress SET
                goal_type = COALESCE($1, goal_type),
                goal_value = COALESCE($2, goal_value),
                current_value = COALESCE($3, current_value),
                goal_met = COALESCE($4, goal_met),
                completed_at = COALESCE($5, completed_at)
            WHERE user_id = $6 AND day = $7
        `, [
            data.goalType || null,
            data.goalValue != null ? data.goalValue : null,
            data.currentValue != null ? data.currentValue : null,
            data.goalMet != null ? (data.goalMet ? 1 : 0) : null,
            data.completedAt || null,
            userId,
            day
        ]);
    } else {
        /* إنشاء */
        await pool.query(`
            INSERT INTO daily_progress 
            (user_id, day, goal_type, goal_value, current_value, goal_met, completed_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            userId,
            day,
            data.goalType || 'papers',
            data.goalValue != null ? data.goalValue : 5,
            data.currentValue != null ? data.currentValue : 0,
            data.goalMet ? 1 : 0,
            data.completedAt || null
        ]);
    }
}

/* زيادة قيمة اليوم الحالي */
async function incrementDailyProgress(userId, day, delta) {
    await pool.query(`
        UPDATE daily_progress SET
            current_value = current_value + $1
        WHERE user_id = $2 AND day = $3
    `, [delta, userId, day]);
}
/* ═══════════════════════════════════════════════════
   حساب الـ Streak الحقيقي من قاعدة البيانات
   ═══════════════════════════════════════════════════ */
async function calculateCurrentStreak(userId) {
    try {
        /* اجلب كل الأيام المحققة (آخر سنة) */
        var result = await pool.query(`
            SELECT TO_CHAR(day, 'YYYY-MM-DD') AS day_str
            FROM daily_progress 
            WHERE user_id = $1 AND goal_met = 1
            ORDER BY day DESC
            LIMIT 400
        `, [userId]);
        
        /* إذا لا توجد أيام محققة */
        if (result.rows.length === 0) {
            return 0;
        }
        
        /* كائن للبحث السريع */
        var metDays = {};
        result.rows.forEach(function(r) {
            metDays[r.day_str] = true;
        });
        
        /* ابدأ من اليوم */
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        
        var streak = 0;
        var checkDate = new Date(today);
        var triedToday = false;
        
        /* ابحث عن Streak حقيقي */
        while (true) {
            var checkStr = checkDate.getFullYear() + '-' + 
                          String(checkDate.getMonth() + 1).padStart(2, '0') + '-' + 
                          String(checkDate.getDate()).padStart(2, '0');
            
            if (metDays[checkStr]) {
                streak++;
                checkDate.setDate(checkDate.getDate() - 1);
                triedToday = true;
            } else {
                /* إذا اليوم غير محقق، جرّب أمس مرة واحدة */
                if (!triedToday) {
                    triedToday = true;
                    checkDate.setDate(checkDate.getDate() - 1);
                    continue;
                }
                break;
            }
            
            if (streak > 1000) break;
        }
        
        return streak;
    } catch (e) {
        console.error('calculateCurrentStreak error:', e.message);
        return 0;
    }
}
/* جلب آخر N أيام التي حقق فيها الهدف */
async function getConsecutiveDays(userId, fromDay, count) {
    var result = await pool.query(`
        SELECT TO_CHAR(day, 'YYYY-MM-DD') AS day_str
        FROM daily_progress 
        WHERE user_id = $1 AND goal_met = 1 AND day <= $2::date
        ORDER BY day DESC
        LIMIT $3
    `, [userId, fromDay, count]);
    return result.rows.map(function(r) { return r.day_str; });
} 

/* جلب الأيام الفائتة (التي لم يُحقق فيها الهدف) */
async function getMissedDays(userId, sinceDay, untilDay) {
    var result = await pool.query(`
        SELECT day FROM daily_progress 
        WHERE user_id = $1 
            AND day >= $2 
            AND day < $3 
            AND goal_met = 0
        ORDER BY day ASC
    `, [userId, sinceDay, untilDay]);
    return result.rows.map(function(r) { return r.day; });
}

/* حذف تقدم يوم (عند الترميم) */
async function repairDay(userId, day) {
    /* نحول الهدف إلى محقق */
    await pool.query(`
        UPDATE daily_progress SET
            goal_met = 1,
            completed_at = NOW()
        WHERE user_id = $1 AND day = $2
    `, [userId, day]);
}

/* إضافة يوم محقق يدوياً (في حالة الترميم) */
async function ensureDayMet(userId, day) {
    var existing = await getDailyProgress(userId, day);
    if (existing) {
        await repairDay(userId, day);
    } else {
        await pool.query(`
            INSERT INTO daily_progress 
            (user_id, day, goal_type, goal_value, current_value, goal_met, completed_at)
            VALUES ($1, $2, 'papers', 5, 5, 1, NOW())
        `, [userId, day]);
    }
}
/* ============================================================
   نظام تسجيل النتائج الفعلية
   ============================================================ */

/* جلب كل نتائج المستخدم */
async function getExamResults(userId) {
    var result = await pool.query(
        'SELECT * FROM exam_results WHERE user_id = $1 ORDER BY exam_date DESC, created_at DESC',
        [userId]
    );
    return result.rows;
}

/* جلب نتيجة واحدة */
async function getExamResultById(resultId, userId) {
    var result = await pool.query(
        'SELECT * FROM exam_results WHERE id = $1 AND user_id = $2',
        [resultId, userId]
    );
    return result.rows[0] || null;
}

/* إضافة نتيجة جديدة */
async function createExamResult(userId, data) {
    var result = await pool.query(`
        INSERT INTO exam_results
        (user_id, subject_id, subject_name, exam_type, exam_date, score, max_score, coefficient, note)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
    `, [
        userId,
        data.subjectId,
        data.subjectName,
        data.examType,
        data.examDate,
        data.score,
        data.maxScore || 20,
        data.coefficient || 1,
        data.note || ''
    ]);
    return result.rows[0].id;
}

/* تحديث نتيجة */
async function updateExamResult(resultId, userId, data) {
    await pool.query(`
        UPDATE exam_results SET
            subject_id = COALESCE($1, subject_id),
            subject_name = COALESCE($2, subject_name),
            exam_type = COALESCE($3, exam_type),
            exam_date = COALESCE($4, exam_date),
            score = COALESCE($5, score),
            max_score = COALESCE($6, max_score),
            coefficient = COALESCE($7, coefficient),
            note = COALESCE($8, note),
            updated_at = NOW()
        WHERE id = $9 AND user_id = $10
    `, [
        data.subjectId || null,
        data.subjectName || null,
        data.examType || null,
        data.examDate || null,
        data.score != null ? data.score : null,
        data.maxScore != null ? data.maxScore : null,
        data.coefficient != null ? data.coefficient : null,
        data.note != null ? data.note : null,
        resultId,
        userId
    ]);
}

/* حذف نتيجة */
async function deleteExamResult(resultId, userId) {
    await pool.query('DELETE FROM exam_results WHERE id = $1 AND user_id = $2', [resultId, userId]);
}

/* جلب معاملات المواد */
async function getSubjectCoefficients(userId) {
    var result = await pool.query(
        'SELECT * FROM subject_coefficients WHERE user_id = $1',
        [userId]
    );
    return result.rows;
}

/* حفظ/تحديث معامل مادة */
async function setSubjectCoefficient(userId, subjectId, coefficient) {
    await pool.query(`
        INSERT INTO subject_coefficients (user_id, subject_id, coefficient)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, subject_id)
        DO UPDATE SET coefficient = $3
    `, [userId, subjectId, coefficient]);
}
/* ============================================================
   نظام لوحة ولي الأمر
   ============================================================ */

/* إنشاء حساب ولي أمر */
async function createParent(email, hashedPassword, name, phone) {
    var result = await pool.query(
        'INSERT INTO parent_accounts (email, password, name, phone) VALUES ($1, $2, $3, $4) RETURNING id',
        [email, hashedPassword, name, phone || '']
    );
    return result.rows[0].id;
}

/* البحث عن ولي أمر بالبريد */
async function findParentByEmail(email) {
    var result = await pool.query('SELECT * FROM parent_accounts WHERE email = $1', [email]);
    return result.rows[0] || null;
}

/* البحث عن ولي أمر بالمعرف */
async function findParentById(id) {
    var result = await pool.query('SELECT * FROM parent_accounts WHERE id = $1', [id]);
    return result.rows[0] || null;
}

/* توليد كود 6 أرقام للابن */
async function createLinkCode(userId) {
    /* احذف الأكواد القديمة للمستخدم */
    await pool.query('DELETE FROM parent_link_codes WHERE user_id = $1', [userId]);
    
    /* ولّد كوداً فريداً */
    var code = '';
    var attempts = 0;
    while (attempts < 10) {
        code = '';
        for (var i = 0; i < 6; i++) {
            code += Math.floor(Math.random() * 10);
        }
        var exists = await pool.query('SELECT id FROM parent_link_codes WHERE code = $1', [code]);
        if (exists.rows.length === 0) break;
        attempts++;
    }
    
    /* ينتهي بعد 24 ساعة */
    var expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);
    
    await pool.query(
        'INSERT INTO parent_link_codes (user_id, code, expires_at) VALUES ($1, $2, $3)',
        [userId, code, expiresAt.toISOString()]
    );
    
    return code;
}

/* البحث عن كود */
async function findLinkCode(code) {
    var result = await pool.query(
        'SELECT * FROM parent_link_codes WHERE code = $1 AND used = 0 AND expires_at > NOW()',
        [code]
    );
    return result.rows[0] || null;
}

/* استعمال الكود */
async function useLinkCode(codeId) {
    await pool.query('UPDATE parent_link_codes SET used = 1 WHERE id = $1', [codeId]);
}

/* إنشاء علاقة parent-child */
async function createParentChild(parentId, userId) {
    var result = await pool.query(
        'INSERT INTO parent_children (parent_id, user_id, confirmed) VALUES ($1, $2, 0) ON CONFLICT (parent_id, user_id) DO NOTHING RETURNING id',
        [parentId, userId]
    );
    return result.rows[0] ? result.rows[0].id : null;
}

/* تأكيد العلاقة */
async function confirmParentChild(parentId, userId) {
    await pool.query(
        'UPDATE parent_children SET confirmed = 1 WHERE parent_id = $1 AND user_id = $2',
        [parentId, userId]
    );
}

/* رفض/حذف العلاقة */
async function removeParentChild(parentId, userId) {
    await pool.query(
        'DELETE FROM parent_children WHERE parent_id = $1 AND user_id = $2',
        [parentId, userId]
    );
}

/* جلب أبناء ولي الأمر */
async function getParentChildren(parentId) {
    var result = await pool.query(`
        SELECT pc.id as relation_id, pc.confirmed, pc.created_at as linked_at,
               u.id, u.name, u.avatar, u.grade, u.term, u.exam_type, u.school_year
        FROM parent_children pc
        JOIN users u ON u.id = pc.user_id
        WHERE pc.parent_id = $1
        ORDER BY pc.confirmed ASC, pc.created_at DESC
    `, [parentId]);
    return result.rows;
}

/* جلب أولياء أمر الابن (المؤكدين) */
async function getUserParents(userId) {
    var result = await pool.query(`
        SELECT pa.id, pa.name, pa.email, pc.confirmed
        FROM parent_children pc
        JOIN parent_accounts pa ON pa.id = pc.parent_id
        WHERE pc.user_id = $1
        ORDER BY pc.created_at DESC
    `, [userId]);
    return result.rows;
}

/* جلب طلبات ولي الأمر المعلقة للابن */
async function getPendingParentRequests(userId) {
    var result = await pool.query(`
        SELECT pa.id as parent_id, pa.name, pa.email, pc.created_at
        FROM parent_children pc
        JOIN parent_accounts pa ON pa.id = pc.parent_id
        WHERE pc.user_id = $1 AND pc.confirmed = 0
        ORDER BY pc.created_at DESC
    `, [userId]);
    return result.rows;
}
/* ============================================================
   نظام جلسات التركيز (Pomodoro)
   ============================================================ */

/* بدء جلسة جديدة */
async function startFocusSession(userId, data) {
    var result = await pool.query(`
        INSERT INTO focus_sessions
        (user_id, subject_id, subject_name, goal, session_type, planned_minutes, started_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING id, started_at
    `, [
        userId,
        data.subjectId || '',
        data.subjectName || '',
        data.goal || '',
        data.sessionType || 'focus',
        data.plannedMinutes || 25
    ]);
    return result.rows[0];
}

/* إنهاء جلسة */
async function endFocusSession(sessionId, userId, actualMinutes, completed) {
    var countedAsTask = (actualMinutes >= 30 && completed) ? 1 : 0;
    await pool.query(`
        UPDATE focus_sessions SET
            ended_at = NOW(),
            actual_minutes = $1,
            completed = $2,
            counted_as_task = $3
        WHERE id = $4 AND user_id = $5
    `, [actualMinutes, completed ? 1 : 0, countedAsTask, sessionId, userId]);
    return { countedAsTask: countedAsTask };
}

/* جلب الجلسة النشطة (بدون end) */
async function getActiveFocusSession(userId) {
    var result = await pool.query(`
        SELECT * FROM focus_sessions 
        WHERE user_id = $1 AND ended_at IS NULL
        ORDER BY started_at DESC
        LIMIT 1
    `, [userId]);
    return result.rows[0] || null;
}

/* جلب جلسات اليوم */
async function getTodayFocusSessions(userId) {
    var result = await pool.query(`
        SELECT * FROM focus_sessions 
        WHERE user_id = $1 
            AND started_at >= CURRENT_DATE
            AND ended_at IS NOT NULL
        ORDER BY started_at DESC
    `, [userId]);
    return result.rows;
}

/* جلب جلسات آخر N أيام */
async function getRecentFocusSessions(userId, days) {
    var result = await pool.query(`
        SELECT * FROM focus_sessions 
        WHERE user_id = $1 
            AND started_at >= NOW() - ($2 || ' days')::interval
            AND ended_at IS NOT NULL
        ORDER BY started_at DESC
    `, [userId, days || 7]);
    return result.rows;
}

/* إحصائيات الوقت */
async function getFocusStats(userId, days) {
    var result = await pool.query(`
        SELECT 
            COALESCE(SUM(actual_minutes), 0) as total_minutes,
            COUNT(*) as total_sessions,
            COALESCE(SUM(CASE WHEN session_type = 'focus' THEN actual_minutes ELSE 0 END), 0) as focus_minutes,
            COALESCE(SUM(CASE WHEN session_type = 'break' THEN actual_minutes ELSE 0 END), 0) as break_minutes,
            COALESCE(SUM(counted_as_task), 0) as tasks_counted
        FROM focus_sessions 
        WHERE user_id = $1 
            AND started_at >= NOW() - ($2 || ' days')::interval
            AND ended_at IS NOT NULL
    `, [userId, days || 1]);
    return result.rows[0];
}

/* إحصائيات حسب المادة */
async function getFocusBySubject(userId, days) {
    var result = await pool.query(`
        SELECT 
            subject_id,
            subject_name,
            SUM(actual_minutes) as total_minutes,
            COUNT(*) as sessions_count
        FROM focus_sessions 
        WHERE user_id = $1 
            AND started_at >= NOW() - ($2 || ' days')::interval
            AND ended_at IS NOT NULL
            AND subject_id != ''
        GROUP BY subject_id, subject_name
        ORDER BY total_minutes DESC
    `, [userId, days || 7]);
    return result.rows;
}

/* حذف الجلسات القديمة غير المكتملة */
async function cleanupStaleSessions(userId) {
    await pool.query(`
        DELETE FROM focus_sessions 
        WHERE user_id = $1 
            AND ended_at IS NULL 
            AND started_at < NOW() - INTERVAL '6 hours'
    `, [userId]);
}
/* ============================================================
   الجزء الجديد: التعطيل + الإعلان + المحادثات + النشاط
   ============================================================ */

/* -------- 1) تعطيل / تفعيل مستخدم -------- */

async function setUserDisabled(userId, disabled) {
    var result = await pool.query(
        'UPDATE users SET disabled = $1 WHERE id = $2 RETURNING id',
        [disabled ? true : false, userId]
    );
    return result.rowCount > 0;
}

/* -------- 2) الإعلان العام -------- */

async function setAnnouncement(text) {
    var announcementId = 'ann_' + Date.now();
    var value = {
        text: text || '',
        id: announcementId,
        updatedAt: new Date().toISOString()
    };
    await pool.query(`
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ('announcement', $1::jsonb, NOW())
        ON CONFLICT (key) DO UPDATE
        SET value = $1::jsonb, updated_at = NOW()
    `, [JSON.stringify(value)]);
    return announcementId;
}

async function getAnnouncement() {
    try {
        var result = await pool.query(
            "SELECT value FROM app_settings WHERE key = 'announcement'"
        );
        if (result.rows.length === 0) return { text: '', id: null };
        return result.rows[0].value || { text: '', id: null };
    } catch (e) {
        return { text: '', id: null };
    }
}

async function clearAnnouncement() {
    await pool.query(`
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ('announcement', '{"text":"","id":null}'::jsonb, NOW())
        ON CONFLICT (key) DO UPDATE
        SET value = '{"text":"","id":null}'::jsonb, updated_at = NOW()
    `);
    return true;
}

/* -------- 3) المحادثات (المستخدم ↔ المدير) -------- */

/* إرسال رسالة (من المستخدم أو المدير) */
async function sendMessage(userId, sender, body) {
    if (sender !== 'user' && sender !== 'admin') {
        throw new Error('invalid_sender');
    }
    var result = await pool.query(`
        INSERT INTO messages (user_id, sender, body, is_read, created_at)
        VALUES ($1, $2, $3, FALSE, NOW())
        RETURNING id, created_at
    `, [userId, sender, body]);
    return {
        id: result.rows[0].id,
        createdAt: result.rows[0].created_at
    };
}

/* جلب كل رسائل مستخدم (محادثة كاملة) */
async function getUserMessages(userId) {
    var result = await pool.query(`
        SELECT id, user_id, sender, body, is_read, created_at
        FROM messages
        WHERE user_id = $1
        ORDER BY created_at ASC
    `, [userId]);
    return result.rows;
}

/* تحديد رسائل كمقروءة */
async function markMessagesRead(userId, as) {
    /* as = 'user' أو 'admin' — من الذي يقرأ؟ */
    /* نحدّث الرسائل المُرسَلة من الطرف الآخر */
    var otherSender = as === 'user' ? 'admin' : 'user';
    await pool.query(`
        UPDATE messages
        SET is_read = TRUE
        WHERE user_id = $1 AND sender = $2 AND is_read = FALSE
    `, [userId, otherSender]);
    return true;
}

/* عدد الرسائل غير المقروءة */
async function getUnreadCount(userId, as) {
    /* as = من الذي يريد العدّ؟ */
    /* إذا user → يعدّ رسائل المدير غير المقروءة */
    /* إذا admin → يعدّ رسائل المستخدم غير المقروءة */
    var otherSender = as === 'user' ? 'admin' : 'user';
    var result = await pool.query(`
        SELECT COUNT(*)::int AS n
        FROM messages
        WHERE user_id = $1 AND sender = $2 AND is_read = FALSE
    `, [userId, otherSender]);
    return result.rows[0].n || 0;
}

/* قائمة المحادثات للمدير (مجموعة حسب المستخدم) */
async function getConversationsList() {
    var result = await pool.query(`
        SELECT 
            u.id AS user_id,
            u.name AS user_name,
            u.avatar,
            u.disabled,
            a.username AS account_username,
            m.body AS last_message,
            m.sender AS last_sender,
            m.created_at AS last_at,
            COALESCE((
                SELECT COUNT(*)::int FROM messages 
                WHERE user_id = u.id 
                  AND sender = 'user' 
                  AND is_read = FALSE
            ), 0) AS unread_count
        FROM users u
        JOIN accounts a ON a.id = u.account_id
        JOIN LATERAL (
            SELECT body, sender, created_at
            FROM messages
            WHERE user_id = u.id
            ORDER BY created_at DESC
            LIMIT 1
        ) m ON TRUE
        ORDER BY 
            COALESCE((
                SELECT COUNT(*)::int FROM messages 
                WHERE user_id = u.id 
                  AND sender = 'user' 
                  AND is_read = FALSE
            ), 0) DESC,
            m.created_at DESC
        LIMIT 200
    `);
    return result.rows;
}

/* -------- 4) النشاط اليومي (للرسم البياني) -------- */

async function getAdminActivity(days) {
    days = parseInt(days, 10) || 30;
    if (days < 1) days = 1;
    if (days > 90) days = 90;

    var result = await pool.query(`
        SELECT 
            TO_CHAR(d.day, 'YYYY-MM-DD') AS date,
            COALESCE((
                SELECT COUNT(DISTINCT ud.user_id)::int
                FROM user_data ud
                WHERE DATE(ud.updated_at) = d.day
            ), 0) AS active_users
        FROM generate_series(
            CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day',
            CURRENT_DATE,
            INTERVAL '1 day'
        ) AS d(day)
        ORDER BY d.day ASC
    `, [days]);

    return result.rows;
}

/* -------- 5) إحصائيات إضافية للمدير -------- */

/* مستخدمون جدد خلال آخر N يوم */
async function getNewUsersCount(days) {
    days = parseInt(days, 10) || 7;
    var result = await pool.query(`
        SELECT COUNT(*)::int AS n
        FROM users
        WHERE created_at > NOW() - ($1 || ' days')::interval
    `, [days]);
    return result.rows[0].n || 0;
}

/* مستخدمون معطّلون */
async function getDisabledCount() {
    var result = await pool.query(
        'SELECT COUNT(*)::int AS n FROM users WHERE disabled = TRUE'
    );
    return result.rows[0].n || 0;
}

/* عدد الرسائل غير المقروءة للمدير (كل المستخدمين) */
async function getTotalUnreadForAdmin() {
    var result = await pool.query(`
        SELECT COUNT(*)::int AS n
        FROM messages
        WHERE sender = 'user' AND is_read = FALSE
    `);
    return result.rows[0].n || 0;
}
    /* الشارات */
    getUserBadges: getUserBadges,
    unlockBadge: unlockBadge,
    checkAndUnlockBadges: checkAndUnlockBadges,
/* ============================================================
   نظام الشارات (Badges)
   ============================================================ */

/* جلب شارات المستخدم */
async function getUserBadges(userId) {
    var result = await pool.query(
        'SELECT badge_id, unlocked_at FROM user_badges WHERE user_id = $1 ORDER BY unlocked_at DESC',
        [userId]
    );
    return result.rows;
}

/* فتح شارة (تتجاهل إذا موجودة) */
async function unlockBadge(userId, badgeId) {
    try {
        var result = await pool.query(`
            INSERT INTO user_badges (user_id, badge_id, unlocked_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (user_id, badge_id) DO NOTHING
            RETURNING id
        `, [userId, badgeId]);
        return result.rowCount > 0; /* true إذا فُتحت الآن */
    } catch (e) {
        console.error('unlockBadge error:', e.message);
        return false;
    }
}

/* فحص كل الشارات بناءً على إحصائيات المستخدم */
async function checkAndUnlockBadges(userId) {
    try {
        var stats = await getUserStats(userId);
        var progress = await getRecentProgress(userId, 3650); /* كل الأيام */
        
        /* احسب الإجمالي */
        var totalPapers = 0;
        var perfectDays = 0;
        progress.forEach(function(p) {
            totalPapers += (p.current_value || 0);
            if (p.goal_met) perfectDays++;
        });
        
        /* جلسات التركيز */
        var focusStats = await getFocusStats(userId, 3650);
        var focusSessions = parseInt(focusStats.total_sessions, 10) || 0;
        
        /* الشارات المفتوحة حالياً */
        var existing = await getUserBadges(userId);
        var existingIds = {};
        existing.forEach(function(b) { existingIds[b.badge_id] = true; });
        
        /* افحص كل شارة */
        var newlyUnlocked = [];
        var checks = [
            { id: 'first_task',       ok: totalPapers >= 1 },
            { id: 'first_paper',      ok: totalPapers >= 1 },
            { id: 'papers_10',        ok: totalPapers >= 10 },
            { id: 'papers_50',        ok: totalPapers >= 50 },
            { id: 'papers_100',       ok: totalPapers >= 100 },
            { id: 'papers_500',       ok: totalPapers >= 500 },
            { id: 'streak_3',         ok: (stats.current_streak || 0) >= 3 || (stats.longest_streak || 0) >= 3 },
            { id: 'streak_7',         ok: (stats.longest_streak || 0) >= 7 },
            { id: 'streak_30',        ok: (stats.longest_streak || 0) >= 30 },
            { id: 'streak_100',       ok: (stats.longest_streak || 0) >= 100 },
            { id: 'points_1000',      ok: (stats.points || 0) >= 1000 },
            { id: 'points_5000',      ok: (stats.points || 0) >= 5000 },
            { id: 'focus_10',         ok: focusSessions >= 10 },
            { id: 'focus_50',         ok: focusSessions >= 50 },
            { id: 'perfect_day',      ok: perfectDays >= 1 },
            { id: 'perfect_week',     ok: perfectDays >= 7 },
            { id: 'perfect_month',    ok: perfectDays >= 30 }
        ];
        
        for (var i = 0; i < checks.length; i++) {
            var c = checks[i];
            if (c.ok && !existingIds[c.id]) {
                var unlocked = await unlockBadge(userId, c.id);
                if (unlocked) newlyUnlocked.push(c.id);
            }
        }
        
        return newlyUnlocked;
    } catch (e) {
        console.error('checkAndUnlockBadges error:', e.message);
        return [];
    }
}

/* ============================================================
   نهاية الإضافات
   ============================================================ */
module.exports = {
    pool: pool,
    /* الحسابات */
    createAccount: createAccount,
    findAccountByUsername: findAccountByUsername,
    findAccountById: findAccountById,
    getAdminOverview: getAdminOverview,
    /* المستخدمون */
    createUser: createUser,
    getUsersByAccount: getUsersByAccount,
    findUserById: findUserById,
    findUserByName: findUserByName,
    updateUserProfile: updateUserProfile,
    deleteUser: deleteUser,
    copyUserSettings: copyUserSettings,
    updateUserName: updateUserName,
    updateUserPassword: updateUserPassword,
    getUserWithPassword: getUserWithPassword,
       /* الميزات الجديدة */
    setUserDisabled: setUserDisabled,
    setAnnouncement: setAnnouncement,
    getAnnouncement: getAnnouncement,
    clearAnnouncement: clearAnnouncement,
    sendMessage: sendMessage,
    getUserMessages: getUserMessages,
    markMessagesRead: markMessagesRead,
    getUnreadCount: getUnreadCount,
    getConversationsList: getConversationsList,
    getAdminActivity: getAdminActivity,
    getNewUsersCount: getNewUsersCount,
    getDisabledCount: getDisabledCount,
    getTotalUnreadForAdmin: getTotalUnreadForAdmin,
    getAdminOverview: getAdminOverview,
    /* البيانات */
    getUserData: getUserData,
    saveUserData: saveUserData,
    /* دروس خصوصية */
    getTutoringSessions: getTutoringSessions,
    getTutoringSessionById: getTutoringSessionById,
    createTutoringSession: createTutoringSession,
    updateTutoringSession: updateTutoringSession,
    deleteTutoringSession: deleteTutoringSession,
    getTutoringItems: getTutoringItems,
    createTutoringItem: createTutoringItem,
    updateTutoringItem: updateTutoringItem,
    deleteTutoringItem: deleteTutoringItem,
    /* نظام التقدم والـ Streak */
    getUserStats: getUserStats,
    updateUserPoints: updateUserPoints,
    saveUserStats: saveUserStats,
    getDailyProgress: getDailyProgress,
    getRecentProgress: getRecentProgress,
    upsertDailyProgress: upsertDailyProgress,
    incrementDailyProgress: incrementDailyProgress,
    getConsecutiveDays: getConsecutiveDays,
    calculateCurrentStreak: calculateCurrentStreak,
    getMissedDays: getMissedDays,
    repairDay: repairDay,
    ensureDayMet: ensureDayMet,
    /* نظام النتائج */
    getExamResults: getExamResults,
    getExamResultById: getExamResultById,
    createExamResult: createExamResult,
    updateExamResult: updateExamResult,
    deleteExamResult: deleteExamResult,
    getSubjectCoefficients: getSubjectCoefficients,
    setSubjectCoefficient: setSubjectCoefficient,
    /* لوحة ولي الأمر */
    createParent: createParent,
    findParentByEmail: findParentByEmail,
    findParentById: findParentById,
    createLinkCode: createLinkCode,
    findLinkCode: findLinkCode,
    useLinkCode: useLinkCode,
    createParentChild: createParentChild,
    confirmParentChild: confirmParentChild,
    removeParentChild: removeParentChild,
    getParentChildren: getParentChildren,
    getUserParents: getUserParents,
    getPendingParentRequests: getPendingParentRequests,
    /* جلسات التركيز */
    startFocusSession: startFocusSession,
    endFocusSession: endFocusSession,
    getActiveFocusSession: getActiveFocusSession,
    getTodayFocusSessions: getTodayFocusSessions,
    getRecentFocusSessions: getRecentFocusSessions,
    getFocusStats: getFocusStats,
    getFocusBySubject: getFocusBySubject,
    cleanupStaleSessions: cleanupStaleSessions
};
