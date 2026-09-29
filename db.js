/* ============================================================
   db.js — إعداد قاعدة البيانات SQLite
   يحتوي على جدولين:
   - users: المستخدمون (اسم، كلمة سر مشفرة، معلومات الملف)
   - user_data: بيانات كل مستخدم (المواد، الجدول، الواجبات)
   ============================================================ */

var Database = require('better-sqlite3');
var path = require('path');

/* مكان ملف قاعدة البيانات */
var DB_PATH = path.join(__dirname, 'study.db');

/* فتح قاعدة البيانات (تُنشأ تلقائيا إذا لم تكن موجودة) */
var db = new Database(DB_PATH);

/* تحسين الأداء والأمان */
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/* إنشاء الجداول إذا لم تكن موجودة */
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        username    TEXT    NOT NULL UNIQUE,
        password    TEXT    NOT NULL,
        avatar      TEXT    DEFAULT '',
        grade       TEXT    DEFAULT '',
        term        TEXT    DEFAULT '',
        exam_type   TEXT    DEFAULT '',
        school_year TEXT    DEFAULT '',
        created_at  TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_data (
        user_id     INTEGER PRIMARY KEY,
        subjects    TEXT    NOT NULL DEFAULT '[]',
        timetable   TEXT    NOT NULL DEFAULT '{}',
        homework    TEXT    NOT NULL DEFAULT '[]',
        lang        TEXT    NOT NULL DEFAULT 'ar',
        dark_mode   INTEGER NOT NULL DEFAULT 0,
        updated_at  TEXT    DEFAULT (datetime('now')),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
`);

/* دوال مساعدة */

/* إنشاء مستخدم جديد */
function createUser(username, hashedPassword) {
    var stmt = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
    var info = stmt.run(username, hashedPassword);
    var userId = info.lastInsertRowid;
    /* إنشاء صف بيانات فارغ للمستخدم */
    db.prepare('INSERT INTO user_data (user_id) VALUES (?)').run(userId);
    return userId;
}

/* البحث عن مستخدم باسم المستخدم */
function findUserByUsername(username) {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

/* البحث عن مستخدم بالمعرف */
function findUserById(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

/* جلب بيانات المستخدم */
function getUserData(userId) {
    return db.prepare('SELECT * FROM user_data WHERE user_id = ?').get(userId);
}

/* حفظ بيانات المستخدم */
function saveUserData(userId, data) {
    var stmt = db.prepare(`
        UPDATE user_data SET
            subjects = ?,
            timetable = ?,
            homework = ?,
            lang = ?,
            dark_mode = ?,
            updated_at = datetime('now')
        WHERE user_id = ?
    `);
    stmt.run(
        JSON.stringify(data.subjects || []),
        JSON.stringify(data.timetable || {}),
        JSON.stringify(data.homework || []),
        data.lang || 'ar',
        data.darkMode ? 1 : 0,
        userId
    );
}

/* تحديث معلومات الملف الشخصي */
function updateUserProfile(userId, profile) {
    var stmt = db.prepare(`
        UPDATE users SET
            avatar = COALESCE(?, avatar),
            grade = COALESCE(?, grade),
            term = COALESCE(?, term),
            exam_type = COALESCE(?, exam_type),
            school_year = COALESCE(?, school_year)
        WHERE id = ?
    `);
    stmt.run(
        profile.avatar != null ? profile.avatar : null,
        profile.grade != null ? profile.grade : null,
        profile.term != null ? profile.term : null,
        profile.examType != null ? profile.examType : null,
        profile.schoolYear != null ? profile.schoolYear : null,
        userId
    );
}

/* حذف مستخدم */
function deleteUser(userId) {
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
}

/* تصدير كل الدوال */
module.exports = {
    db: db,
    createUser: createUser,
    findUserByUsername: findUserByUsername,
    findUserById: findUserById,
    getUserData: getUserData,
    saveUserData: saveUserData,
    updateUserProfile: updateUserProfile,
    deleteUser: deleteUser
};