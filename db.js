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
    /* البيانات */
    getUserData: getUserData,
    saveUserData: saveUserData
};
