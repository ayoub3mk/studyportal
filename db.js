/* ============================================================
   db.js — قاعدة البيانات (Postgres على Supabase)
   - يستخدم مكتبة pg للاتصال بـ Postgres
   - متوافق مع بيانات الاتصال عبر DATABASE_URL
   ============================================================ */

var { Pool } = require('pg');

/* رابط الاتصال - يُقرأ من متغير البيئة */
var DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('خطأ: DATABASE_URL غير موجود في متغيرات البيئة');
    process.exit(1);
}

/* إعداد الاتصال */
var pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});

/* اختبار الاتصال عند بدء التشغيل */
pool.query('SELECT NOW()')
    .then(function() {
        console.log('✓ تم الاتصال بـ Supabase (Postgres)');
    })
    .catch(function(err) {
        console.error('✗ فشل الاتصال بـ Postgres:', err.message);
    });

/* إنشاء الجداول إذا لم تكن موجودة */
async function initDatabase() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id          SERIAL PRIMARY KEY,
            username    TEXT    NOT NULL UNIQUE,
            password    TEXT    NOT NULL,
            avatar      TEXT    DEFAULT '',
            grade       TEXT    DEFAULT '',
            term        TEXT    DEFAULT '',
            exam_type   TEXT    DEFAULT '',
            school_year TEXT    DEFAULT '',
            created_at  TIMESTAMPTZ DEFAULT NOW()
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_data (
            user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            subjects    TEXT    NOT NULL DEFAULT '[]',
            timetable   TEXT    NOT NULL DEFAULT '{}',
            homework    TEXT    NOT NULL DEFAULT '[]',
            lang        TEXT    NOT NULL DEFAULT 'ar',
            dark_mode   INTEGER NOT NULL DEFAULT 0,
            updated_at  TIMESTAMPTZ DEFAULT NOW()
        );
    `);

    console.log('✓ الجداول جاهزة');
}

/* تشغيل التهيئة */
initDatabase().catch(function(err) {
    console.error('✗ فشل إنشاء الجداول:', err.message);
});

/* ============================================================
   دوال التعامل مع المستخدمين
   ============================================================ */

async function createUser(username, hashedPassword) {
    var result = await pool.query(
        'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id',
        [username, hashedPassword]
    );
    var userId = result.rows[0].id;
    await pool.query('INSERT INTO user_data (user_id) VALUES ($1)', [userId]);
    return userId;
}

async function findUserByUsername(username) {
    var result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    return result.rows[0] || null;
}

async function findUserById(id) {
    var result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0] || null;
}

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

module.exports = {
    pool: pool,
    createUser: createUser,
    findUserByUsername: findUserByUsername,
    findUserById: findUserById,
    getUserData: getUserData,
    saveUserData: saveUserData,
    updateUserProfile: updateUserProfile,
    deleteUser: deleteUser
};
