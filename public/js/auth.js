/* ============================================================
   auth.js — المصادقة وإدارة المستخدمين
   ============================================================ */

function showAccTab(tab) {
    var l = document.getElementById('tabAccLoginBtn');
    var r = document.getElementById('tabAccRegisterBtn');
    var lf = document.getElementById('accLoginForm');
    var rf = document.getElementById('accRegisterForm');
    if (!l || !r || !lf || !rf) return;
    
    if (tab === 'login') {
        l.classList.add('bg-white','text-slate-900','shadow-sm');
        l.classList.remove('text-slate-500','dark:text-slate-300');
        r.classList.remove('bg-white','text-slate-900','shadow-sm');
        r.classList.add('text-slate-500','dark:text-slate-300');
        lf.classList.remove('hidden');
        rf.classList.add('hidden');
    } else {
        r.classList.add('bg-white','text-slate-900','shadow-sm');
        r.classList.remove('text-slate-500','dark:text-slate-300');
        l.classList.remove('bg-white','text-slate-900','shadow-sm');
        l.classList.add('text-slate-500','dark:text-slate-300');
        rf.classList.remove('hidden');
        lf.classList.add('hidden');
    }
}

function submitAccLogin(e) {
    e.preventDefault();
    var u = document.getElementById('accLoginUsername').value.trim();
    var p = document.getElementById('accLoginPassword').value;
    var err = document.getElementById('accLoginError');
    var btn = document.getElementById('accLoginBtn');
    err.classList.add('hidden');
    if (!u || !p) { err.textContent = 'املأ الحقول'; err.classList.remove('hidden'); return; }
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner loading mr-2"></i> جار الدخول...';
    fetch('/api/account/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: u, password: p })
    })
    .then(function(r) { return r.json().then(function(j) { return { ok: r.ok, data: j }; }); })
    .then(function(res) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-right-to-bracket mr-2"></i> دخول';
        if (!res.ok) {
            err.textContent = res.data.message || 'خطأ';
            err.classList.remove('hidden');
            return;
        }
        AUTH_TOKEN = res.data.token;
        CURRENT_ACCOUNT = res.data.account;
        try { localStorage.setItem('acc_token', AUTH_TOKEN); } catch (e) {}
        enterAccountPanel();
    })
    .catch(function() {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-right-to-bracket mr-2"></i> دخول';
        err.textContent = 'خطأ في الاتصال';
        err.classList.remove('hidden');
    });
}

function submitAccRegister(e) {
    e.preventDefault();
    var u = document.getElementById('accRegisterUsername').value.trim();
    var p = document.getElementById('accRegisterPassword').value;
    var p2 = document.getElementById('accRegisterPassword2').value;
    var err = document.getElementById('accRegisterError');
    var btn = document.getElementById('accRegisterBtn');
    err.classList.add('hidden');
    if (p !== p2) { err.textContent = 'كلمتا السر مختلفتان'; err.classList.remove('hidden'); return; }
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner loading mr-2"></i> جار الإنشاء...';
    fetch('/api/account/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: u, password: p })
    })
    .then(function(r) { return r.json().then(function(j) { return { ok: r.ok, data: j }; }); })
    .then(function(res) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-user-plus mr-2"></i> إنشاء الحساب';
        if (!res.ok) {
            err.textContent = res.data.message || 'خطأ';
            err.classList.remove('hidden');
            return;
        }
        AUTH_TOKEN = res.data.token;
        CURRENT_ACCOUNT = res.data.account;
        try { localStorage.setItem('acc_token', AUTH_TOKEN); } catch (e) {}
        enterAccountPanel();
    })
    .catch(function() {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-user-plus mr-2"></i> إنشاء الحساب';
        err.textContent = 'خطأ في الاتصال';
        err.classList.remove('hidden');
    });
}

function enterAccountPanel() {
    document.getElementById('accountScreen').classList.add('hidden');
    document.getElementById('usersScreen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    document.getElementById('accountNameDisplay').textContent = CURRENT_ACCOUNT.username;
    loadUsers();
}

function loadUsers() {
    fetchWithAuth('/api/users')
    .then(function(r) { return r.json(); })
    .then(function(data) {
        CURRENT_USERS = data.users || [];
        renderUsersList();
    })
    .catch(function(err) {
        console.error('Load users error:', err);
    });
}

function renderUsersList() {
    var c = document.getElementById('usersList');
    c.innerHTML = '';
    if (CURRENT_USERS.length === 0) {
        c.innerHTML = '<div class="col-span-2 text-center py-12 text-slate-500 dark:text-slate-400"><i class="fa-solid fa-users text-4xl mb-3 opacity-30"></i><p>لا يوجد مستخدمون بعد</p><p class="text-xs mt-2">انقر "إضافة مستخدم" للبدء</p></div>';
        return;
    }
    CURRENT_USERS.forEach(function(u) {
        var card = document.createElement('div');
        card.className = 'user-card bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-md border border-slate-200 dark:border-slate-700';
        card.onclick = function() { openUserPasswordModal(u); };
        var html = '';
        html += '<div class="flex items-start justify-between mb-3">';
        html += '<img class="w-14 h-14 rounded-2xl object-cover border-2 border-brand-500/30" src="' + escapeHtml(u.avatar || DEFAULT_AVATAR) + '" alt="">';
        html += '<button onclick="event.stopPropagation(); deleteUser(\'' + u.id + '\')" class="delete-user-btn w-9 h-9 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-500 dark:text-red-400 hover:bg-red-500 hover:text-white flex items-center justify-center transition-colors"><i class="fa-solid fa-trash text-xs"></i></button>';
        html += '</div>';
        html += '<h3 class="font-bold text-lg text-slate-900 dark:text-white">' + escapeHtml(u.name) + '</h3>';
        html += '<p class="text-xs text-slate-500 dark:text-slate-400">' + escapeHtml(u.grade || 'لم يُعيَّن بعد') + '</p>';
        html += '<div class="mt-3 flex items-center gap-2 text-xs text-brand-600 dark:text-brand-400 font-bold"><i class="fa-solid fa-arrow-left"></i><span>انقر للدخول</span></div>';
        card.innerHTML = html;
        c.appendChild(card);
    });
}

function deleteUser(userId) {
    if (!confirm('حذف المستخدم؟ سيتم حذف كل بياناته.')) return;
    fetchWithAuth('/api/users/' + userId, { method: 'DELETE' })
    .then(function(r) { return r.json(); })
    .then(function() { loadUsers(); })
    .catch(function(err) { console.error(err); });
}

function openUserPasswordModal(user) {
    selectedUserId = user.id;
    document.getElementById('userPasswordName').textContent = user.name;
    document.getElementById('userPasswordInput').value = '';
    document.getElementById('userPasswordError').classList.add('hidden');
    document.getElementById('userPasswordModal').classList.remove('hidden');
    setTimeout(function() { document.getElementById('userPasswordInput').focus(); }, 100);
}

function closeUserPasswordModal() {
    document.getElementById('userPasswordModal').classList.add('hidden');
    selectedUserId = null;
}

function submitUserPassword(e) {
    e.preventDefault();
    var pwd = document.getElementById('userPasswordInput').value;
    var err = document.getElementById('userPasswordError');
    var btn = document.getElementById('userPasswordBtn');
    err.classList.add('hidden');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner loading"></i>';
    fetchWithAuth('/api/users/' + selectedUserId + '/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd })
    })
    .then(function(r) { return r.json().then(function(j) { return { ok: r.ok, data: j }; }); })
    .then(function(res) {
        btn.disabled = false;
        btn.innerHTML = 'دخول';
        if (!res.ok) {
            err.textContent = res.data.message || 'خطأ';
            err.classList.remove('hidden');
            return;
        }
        closeUserPasswordModal();
        CURRENT_USER = res.data.user;
        enterUserApp();
    })
    .catch(function() {
        btn.disabled = false;
        btn.innerHTML = 'دخول';
        err.textContent = 'خطأ في الاتصال';
        err.classList.remove('hidden');
    });
}

function enterUserApp() {
    document.getElementById('usersScreen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    loadUserData();
}

function backToUsers() {
    document.getElementById('app').classList.add('hidden');
    document.getElementById('usersScreen').classList.remove('hidden');
    CURRENT_USER = null;
    if (typeof SYNC_INTERVAL !== 'undefined' && SYNC_INTERVAL) { clearInterval(SYNC_INTERVAL); SYNC_INTERVAL = null; }
    loadUsers();
}

function logoutAccount() {
    if (!confirm('تسجيل الخروج من الحساب؟')) return;
    fetch('/api/account/logout', { method:'POST', credentials:'include' })
    .then(function(){ 
        AUTH_TOKEN = null;
        CURRENT_ACCOUNT = null;
        try { localStorage.removeItem('acc_token'); } catch(e){}
        location.reload();
    })
    .catch(function(){ location.reload(); });
}

// Placeholders for add user modal (can be refined later)
function openAddUserModal() {
    document.getElementById('newUserName').value = '';
    document.getElementById('newUserPassword').value = '';
    document.getElementById('addUserError').classList.add('hidden');
    document.getElementById('addUserModal').classList.remove('hidden');
}
function closeAddUserModal() {
    document.getElementById('addUserModal').classList.add('hidden');
}
