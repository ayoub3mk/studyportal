/* ============================================================
   api.js — الاتصال بالسيرفر
   ============================================================ */

function fetchWithAuth(url, options) {
    options = options || {};
    options.credentials = 'include';
    if (AUTH_TOKEN) {
        options.headers = options.headers || {};
        options.headers['Authorization'] = 'Bearer ' + AUTH_TOKEN;
    }
    return fetch(url, options);
}

function saveState() {
    if (!CURRENT_USER) return;
    
    if (typeof showSaveIndicator === 'function') {
        showSaveIndicator();
    }
    
    var body = {
        name: CURRENT_USER.name,
        avatar: CURRENT_USER.avatar,
        grade: CURRENT_USER.grade,
        term: CURRENT_USER.term,
        examType: CURRENT_USER.examType,
        schoolYear: CURRENT_USER.schoolYear,
        subjects: appState.subjects,
        timetable: appState.timetable,
        homework: appState.homework,
        preparation: appState.preparation,
        prepChecked: appState.prepChecked,
        extras: { 
            series: appState.series || [], 
            notes: appState.notes || [],
            tutorial: appState.tutorial || null,
            notifications: appState.notifications || null,
            exams: appState.exams || [],
            theme: appState.theme || 'orange'
        },
        lang: appState.lang,
        darkMode: appState.darkMode
    };
    
    fetchWithAuth('/api/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).then(function(r){ return r.json(); }).then(function(d){
        if (d.ok) console.log('✓ تم الحفظ');
    }).catch(function(err){ console.error('Save error:', err); });
}

function manualSave() {
    if (!CURRENT_USER) return;
    var btn = document.getElementById('btnManualSave');
    if (!btn) return;
    var orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner loading"></i>';
    saveState();
    setTimeout(function(){
        btn.innerHTML = '<i class="fa-solid fa-check"></i> تم';
        btn.classList.add('bg-emerald-500', 'text-white');
        setTimeout(function(){
            btn.innerHTML = orig;
            btn.classList.remove('bg-emerald-500', 'text-white');
            btn.disabled = false;
        }, 1500);
    }, 800);
}

function loadUserData() {
    fetchWithAuth('/api/me')
    .then(function(r) {
        if (r.status === 401) {
            backToUsers();
            return null;
        }
        return r.json();
    })
    .then(function(data) {
        if (!data || !data.user) return;
        var u = data.user;
        appState.lang = u.lang || 'ar';
        appState.darkMode = !!u.darkMode;
        appState.subjects = u.subjects || [];
        appState.timetable = u.timetable || {};
        appState.homework = u.homework || [];
        appState.preparation = u.preparation || {};
        appState.prepChecked = u.prepChecked || { date: null, checked: {} };
        
        var extras = u.extras || {};
        appState.series = extras.series || [];
        appState.notes = extras.notes || [];
        appState.tutorial = extras.tutorial || null;
        appState.notifications = extras.notifications || null;
        appState.exams = extras.exams || [];
        appState.theme = extras.theme || 'orange';
        
        try { migrateSubjectItems(); } catch (e) { console.warn('Migration error:', e); }
        CURRENT_USER = u;
        if (typeof purgeOldHomework === 'function') purgeOldHomework();
        if (typeof applyTheme === 'function') applyTheme();
        if (typeof applyThemeColor === 'function') applyThemeColor();
        if (typeof applyLanguage === 'function') applyLanguage();
        if (typeof renderApp === 'function') renderApp();
    })
    .catch(function(err) {
        console.error('Load user data error:', err);
    });
}
