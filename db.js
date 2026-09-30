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
            lang = $4,
            dark_mode = $5,
            updated_at = NOW()
        WHERE user_id = $6
    `, [
        JSON.stringify(data.subjects || []),
        JSON.stringify(data.timetable || {}),
        JSON.stringify(data.homework || []),
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

module.exports = {
    pool: pool,
    /* الحسابات */
    createAccount: createAccount,
    findAccountByUsername: findAccountByUsername,
    findAccountById: findAccountById,
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
    deleteTutoringItem: deleteTutoringItem
};
