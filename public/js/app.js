/* ============================================================
   app.js — منطق التطبيق الرئيسي (الجزء 1)
   ============================================================ */

function renderApp() {
    document.getElementById('userNameHeader').textContent = CURRENT_USER.name;
    document.getElementById('userGradeHeader').textContent = CURRENT_USER.grade || '—';
    document.getElementById('viewUserName').textContent = CURRENT_USER.name;
    document.getElementById('viewUserGrade').textContent = CURRENT_USER.grade || '—';
    document.getElementById('viewUserExamType').textContent = CURRENT_USER.examType || '—';
    document.getElementById('viewUserTerm').textContent = CURRENT_USER.term || '—';
    document.getElementById('viewUserSchoolYear').textContent = CURRENT_USER.schoolYear || '—';
    document.getElementById('viewUserAvatar').src = CURRENT_USER.avatar || DEFAULT_AVATAR;

    updateProgress();
    renderCountdown();
    renderSubjects();
    renderSmartAssistant();
    switchTab(currentTab);
    updateHwBadge();
    renderWeekToggle();
}

function updateProgress() {
    var total = 0, done = 0;
    appState.subjects.forEach(function(s) {
        if (s.sections) {
            s.sections.forEach(function(sec) {
                sec.items.forEach(function(it) { total++; if (it.checked) done++; });
            });
        } else if (s.items) {
            s.items.forEach(function(it) { total++; if (it.checked) done++; });
        }
    });
    var pct = total > 0 ? Math.round(done / total * 100) : 0;
    document.getElementById('overallPercentage').textContent = pct;
    document.getElementById('completedItemsCount').textContent = done;
    document.getElementById('totalItemsCount').textContent = total;
    var circle = document.getElementById('progressCircle');
    if (circle) {
        var circ = 2 * Math.PI * 20;
        circle.style.strokeDashoffset = circ - (pct / 100) * circ;
    }
}

function renderSubjects() {
    var c = document.getElementById('subjectsContainer');
    if (!c) return;
    c.innerHTML = '';
    var si = document.getElementById('searchInput');
    var fi = document.getElementById('filterSelect');
    var search = si ? si.value.toLowerCase().trim() : '';
    var filter = fi ? fi.value : 'all';
    var today = new Date(); today.setHours(0, 0, 0, 0);

    appState.subjects.forEach(function(subj) {
        var total = 0, done = 0;
        if (subj.sections) {
            subj.sections.forEach(function(sec) { sec.items.forEach(function(it) { total++; if (it.checked) done++; }); });
        } else if (subj.items) {
            subj.items.forEach(function(it) { total++; if (it.checked) done++; });
        }
        var subPct = total > 0 ? Math.round(done / total * 100) : 0;
        var nm = displayName(subj);

        var examBadge = '';
        if (subj.examDate) {
            var d = new Date(subj.examDate);
            var diff = Math.ceil((d - today) / 86400000);
            var cls = 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
            var txt = d.toLocaleDateString(localeTag());
            if (diff < 0) { cls = 'bg-red-100 text-red-700'; txt = 'انتهى'; }
            else if (diff === 0) { cls = 'bg-amber-100 text-amber-800'; txt = t('dayToday'); }
            else if (diff <= 3) { cls = 'bg-amber-100 text-amber-800'; txt = 'بعد ' + diff + ' ' + t('dayCount'); }
            examBadge = '<span class="text-[10px] font-bold px-2 py-0.5 rounded-md ' + cls + '"><i class="fa-solid fa-calendar-check mr-1"></i>' + escapeHtml(txt) + '</span>';
        }

        var itemsHtml = '';
        if (subj.sections) {
            subj.sections.forEach(function(sec) {
                var badgeText = sec.key === '1' ? t('sectionControl1') : t('sectionControl2');
                itemsHtml += '<div class="flex items-center justify-between gap-2 px-2 py-1.5 my-1 rounded-lg bg-orange-50 dark:bg-orange-950/30 border-l-2 border-brand-500">';
                itemsHtml += '<div class="flex items-center gap-2">';
                itemsHtml += '<span class="inline-flex items-center justify-center w-5 h-5 rounded-md bg-brand-500 text-white text-[10px] font-black">' + sec.key + '</span>';
                itemsHtml += '<span class="text-[11px] font-bold text-brand-700 dark:text-brand-300">' + badgeText + '</span>';
                itemsHtml += '</div>';
                itemsHtml += '<button onclick="openWheelOfFortune(\'' + subj.id + '\', \'' + sec.key + '\')" title="عجلة الحظ" class="flex items-center gap-1 px-2 py-1 rounded-md bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white text-[10px] font-bold shadow-sm transition-all hover:scale-105 active:scale-95">';
                itemsHtml += '<i class="fa-solid fa-dice"></i><span>عجلة</span></button></div>';
                sec.items.forEach(function(item, idx) {
                    itemsHtml += renderItemRow(subj.id, sec.key, item, idx, search, filter);
                });
                itemsHtml += '<button onclick="quickAddItem(\'' + subj.id + '\', \'' + sec.key + '\')" class="w-full mt-1 py-2 px-3 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30 text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 text-[11px] font-bold transition-colors flex items-center justify-center gap-1.5">';
                itemsHtml += '<i class="fa-solid fa-plus"></i><span>إضافة ورقة</span></button>';
            });
        } else if (subj.items) {
            itemsHtml += '<div class="flex items-center justify-between gap-2 px-2 py-1.5 my-1 rounded-lg bg-orange-50 dark:bg-orange-950/30 border-l-2 border-brand-500">';
            itemsHtml += '<div class="flex items-center gap-2">';
            itemsHtml += '<span class="inline-flex items-center justify-center w-5 h-5 rounded-md bg-brand-500 text-white text-[10px] font-black"><i class="fa-solid fa-book"></i></span>';
            itemsHtml += '<span class="text-[11px] font-bold text-brand-700 dark:text-brand-300">' + escapeHtml(nm) + '</span></div>';
            itemsHtml += '<button onclick="openWheelOfFortune(\'' + subj.id + '\', null)" title="عجلة الحظ" class="flex items-center gap-1 px-2 py-1 rounded-md bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white text-[10px] font-bold shadow-sm transition-all hover:scale-105 active:scale-95">';
            itemsHtml += '<i class="fa-solid fa-dice"></i><span>عجلة</span></button></div>';
            subj.items.forEach(function(item, idx) {
                itemsHtml += renderItemRow(subj.id, null, item, idx, search, filter);
            });
            itemsHtml += '<button onclick="quickAddItem(\'' + subj.id + '\', null)" class="w-full mt-1 py-2 px-3 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30 text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 text-[11px] font-bold transition-colors flex items-center justify-center gap-1.5">';
            itemsHtml += '<i class="fa-solid fa-plus"></i><span>إضافة ورقة</span></button>';
        }

        var card = document.createElement('div');
        card.className = 'bg-white dark:bg-slate-800 rounded-2xl shadow-md border border-slate-200 dark:border-slate-700 overflow-hidden';
        var ch = '';
        ch += '<div class="p-3 bg-slate-50 dark:bg-slate-700/40 border-b border-slate-200 dark:border-slate-700">';
        ch += '<div class="flex items-center justify-between gap-2">';
        ch += '<h3 class="font-bold text-xs text-brand-700 dark:text-brand-300 uppercase truncate">' + escapeHtml(nm) + '</h3>';
        ch += '<div class="flex items-center gap-1 flex-shrink-0">';
        ch += '<button onclick="openEditSubject(\'' + subj.id + '\')" class="w-6 h-6 rounded-md text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600 text-[10px]"><i class="fa-solid fa-pen"></i></button>';
        ch += '<button onclick="deleteSubject(\'' + subj.id + '\')" class="w-6 h-6 rounded-md text-slate-500 hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-600 text-[10px]"><i class="fa-solid fa-trash-can"></i></button>';
        ch += '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-950/80 text-brand-700 dark:text-brand-300">' + done + '/' + total + '</span>';
        ch += '</div></div>';
        if (examBadge) ch += '<div class="mt-1.5">' + examBadge + '</div>';
        ch += '<div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 mt-2 overflow-hidden"><div class="bg-brand-500 h-1.5 rounded-full transition-all" style="width:' + subPct + '%"></div></div>';
        ch += '</div>';
        ch += '<div class="p-2 space-y-1 custom-scrollbar max-h-[400px] overflow-y-auto">' + itemsHtml + '</div>';
        card.innerHTML = ch;
        c.appendChild(card);
    });
}

function renderItemRow(subjId, secKey, item, idx, search, filter) {
    var mS = !search || 
        item.code.toLowerCase().indexOf(search) !== -1 || 
        (item.note || '').toLowerCase().indexOf(search) !== -1 ||
        (item.teacher || '').toLowerCase().indexOf(search) !== -1 ||
        (item.exercises && item.exercises.label && item.exercises.label.toLowerCase().indexOf(search) !== -1);
    var mF = filter === 'all' || (filter === 'completed' && item.checked) || (filter === 'pending' && !item.checked);
    if (!mS || !mF) return '';
    var sk = secKey || '';
    var linkIcon = item.link
        ? '<a href="' + escapeHtml(item.link) + '" target="_blank" class="text-brand-600 dark:text-brand-400 text-xs px-1"><i class="fa-solid fa-link"></i></a>'
        : '<button onclick="openLinkModal(\'' + subjId + '\', \'' + sk + '\', ' + idx + ')" class="text-slate-300 dark:text-slate-600 hover:text-brand-500 text-xs px-1"><i class="fa-solid fa-link"></i></button>';
    
    var corrige = item.corrige || false;
    var teacher = item.teacher || '';
    var exercises = item.exercises || { label: '', checked: false };
    
    var h = '';
    h += '<div class="rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 group/item mb-1 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-colors">';
    h += '<div class="flex items-center gap-1.5 py-1 px-2">';
    h += '<button onclick="toggleItem(\'' + subjId + '\', \'' + sk + '\', ' + idx + ')" class="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0 ' +
        (item.checked ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 border border-slate-300 dark:border-slate-600') + '">' +
        (item.checked ? '<i class="fa-solid fa-check"></i>' : '') + '</button>';
    h += '<input type="text" value="' + escapeHtml(item.code) + '" onchange="updateItemCode(\'' + subjId + '\', \'' + sk + '\', ' + idx + ', this.value)" class="w-16 sm:w-24 text-center text-xs font-extrabold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-700/80 border border-slate-200 dark:border-slate-600 rounded-lg py-1 px-1 font-mono">';
    h += '<input type="text" value="' + escapeHtml(item.note || '') + '" placeholder="' + t('notePlaceholder') + '" onchange="updateItemNote(\'' + subjId + '\', \'' + sk + '\', ' + idx + ', this.value)" class="flex-1 min-w-0 text-[11px] text-slate-600 dark:text-slate-300 bg-transparent border-b border-slate-200 dark:border-slate-700 py-1 px-1">';
    h += linkIcon;
    h += '<button onclick="deleteItem(\'' + subjId + '\', \'' + sk + '\', ' + idx + ')" class="text-slate-300 dark:text-slate-600 hover:text-red-500 text-xs px-1 opacity-0 group-hover/item:opacity-100 transition-opacity"><i class="fa-solid fa-trash-can"></i></button>';
    h += '</div>';
    h += '<div class="flex flex-wrap items-center gap-1.5 pb-1.5 px-2">';
    h += '<button onclick="toggleItemCorrige(\'' + subjId + '\', \'' + sk + '\', ' + idx + ')" ' +
        'title="' + (corrige ? 'يوجد حل ✓' : 'لا يوجد حل') + '" ' +
        'class="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition-colors ' +
        (corrige 
            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800' 
            : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:text-emerald-600') + '">';
    h += '<i class="fa-solid ' + (corrige ? 'fa-check-circle' : 'fa-circle-dot') + '"></i><span>حل</span></button>';
    h += '<div class="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600">';
    h += '<i class="fa-solid fa-chalkboard-user text-indigo-500"></i>';
    h += '<input type="text" value="' + escapeHtml(teacher) + '" placeholder="الأستاذ..." maxlength="50" onchange="updateItemTeacher(\'' + subjId + '\', \'' + sk + '\', ' + idx + ', this.value)" class="w-20 sm:w-28 bg-transparent text-[10px] text-slate-700 dark:text-slate-200 outline-none placeholder:text-slate-400"></div>';
    
    var exItems = exercises.items || [];
    var exDone = exItems.filter(function(ex) { return ex.checked; }).length;
    var exTotal = exItems.length;
    var exBadge = exTotal > 0 ? (exDone + '/' + exTotal) : 'التمارين';
    var exColor = exTotal > 0 && exDone === exTotal 
        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
        : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/50 hover:bg-amber-100 dark:hover:bg-amber-900/50';
    
    h += '<button onclick="openExercisesModal(\'' + subjId + '\', \'' + sk + '\', ' + idx + ')" title="إدارة التمارين" class="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border transition-colors ' + exColor + '">';
    h += '<i class="fa-solid fa-pen-ruler"></i><span>' + exBadge + '</span></button>';
    h += '</div></div>';
    return h;
}
/* ============================================================
   app.js — منطق التطبيق الرئيسي (الجزء 2)
   ============================================================ */

function getItemsContainer(subjId, secKey) {
    var s = findSubjectById(subjId);
    if (!s) return null;
    if (secKey) {
        if (!s.sections) return null;
        for (var i = 0; i < s.sections.length; i++) {
            if (String(s.sections[i].key) === String(secKey)) return s.sections[i].items;
        }
        return null;
    }
    return s.items || null;
}

function toggleItem(sid, sk, i) {
    var arr = getItemsContainer(sid, sk);
    if (!arr || !arr[i]) return;
    arr[i].checked = !arr[i].checked;
    renderApp();
    saveState();
}
function updateItemCode(sid, sk, i, v) {
    var arr = getItemsContainer(sid, sk);
    if (!arr || !arr[i]) return;
    arr[i].code = v;
    saveState();
}
function updateItemNote(sid, sk, i, v) {
    var arr = getItemsContainer(sid, sk);
    if (!arr || !arr[i]) return;
    arr[i].note = v;
    saveState();
}
function deleteItem(sid, sk, i) {
    var arr = getItemsContainer(sid, sk);
    if (!arr || !arr[i]) return;
    if (!confirm('حذف الورقة؟')) return;
    arr.splice(i, 1);
    renderApp();
    saveState();
}

function toggleItemCorrige(sid, sk, i) {
    var arr = getItemsContainer(sid, sk);
    if (!arr || !arr[i]) return;
    arr[i].corrige = !arr[i].corrige;
    renderSubjects();
    saveState();
}

function updateItemTeacher(sid, sk, i, v) {
    var arr = getItemsContainer(sid, sk);
    if (!arr || !arr[i]) return;
    arr[i].teacher = (v || '').trim();
    saveState();
}

function openAddSubjectModal() {
    editingSubjectId = null;
    document.getElementById('subjectModalTitle').textContent = 'إضافة مادة';
    document.getElementById('subjectTitleAr').value = '';
    document.getElementById('subjectTitleFr').value = '';
    document.getElementById('subjectTitleEn').value = '';
    document.getElementById('subjectExamDateInput').value = '';
    document.getElementById('subjectItemsInput').value = '';
    document.getElementById('subjectModal').classList.remove('hidden');
}
function openEditSubject(id) {
    var s = findSubjectById(id);
    if (!s) return;
    editingSubjectId = id;
    document.getElementById('subjectModalTitle').textContent = 'تعديل المادة';
    document.getElementById('subjectTitleAr').value = s.name.ar || '';
    document.getElementById('subjectTitleFr').value = s.name.fr || '';
    document.getElementById('subjectTitleEn').value = s.name.en || '';
    document.getElementById('subjectExamDateInput').value = s.examDate || '';
    document.getElementById('subjectItemsInput').value = '';
    document.getElementById('subjectModal').classList.remove('hidden');
}
function closeSubjectModal() {
    document.getElementById('subjectModal').classList.add('hidden');
    if (typeof checkTutorialCompletionAfterAdd === 'function') {
        checkTutorialCompletionAfterAdd();
    }
}
function saveSubject(e) {
    e.preventDefault();
    var ar = document.getElementById('subjectTitleAr').value.trim();
    var fr = document.getElementById('subjectTitleFr').value.trim();
    var en = document.getElementById('subjectTitleEn').value.trim();
    var examDate = document.getElementById('subjectExamDateInput').value;
    var rawItems = document.getElementById('subjectItemsInput').value.trim();
    if (!ar) return;
    var name = { ar: ar, fr: fr || ar, en: en || ar };
    if (editingSubjectId) {
        var s = findSubjectById(editingSubjectId);
        if (s) {
            s.name = name;
            s.examDate = examDate;
            if (rawItems && s.items) {
                s.items = rawItems.split('\n').map(function(x){return x.trim();}).filter(Boolean).map(function(c){return {code:c,checked:false,note:'',link:''};});
            }
        }
    } else {
        var codes = rawItems ? rawItems.split('\n').map(function(x){return x.trim();}).filter(Boolean) : [];
        appState.subjects.push({
            id: 'subj_' + Date.now(),
            name: name,
            examDate: examDate,
            items: codes.map(function(c){return {code:c,checked:false,note:'',link:''};})
        });
    }
    closeSubjectModal();
    renderApp();
    saveState();
}
function deleteSubject(id) {
    if (!confirm('حذف المادة؟')) return;
    appState.subjects = appState.subjects.filter(function(x){return x.id !== id;});
    var dk = Object.keys(appState.timetable);
    dk.forEach(function(d){ appState.timetable[d] = appState.timetable[d].filter(function(s){return s.subjectId !== id;}); });
    appState.homework = appState.homework.filter(function(h){return h.subjectId !== id;});
    renderApp();
    saveState();
}

function openAddItem(sid, sk) {
    addingItemSubjectId = sid;
    addingItemSectionKey = sk || null;
    document.getElementById('itemCodeInput').value = '';
    document.getElementById('itemNoteInput').value = '';
    document.getElementById('itemModal').classList.remove('hidden');
}
function closeItemModal() {
    document.getElementById('itemModal').classList.add('hidden');
    addingItemSubjectId = null;
    addingItemSectionKey = null;
}
function saveItem(e) {
    e.preventDefault();
    var arr = getItemsContainer(addingItemSubjectId, addingItemSectionKey);
    if (!arr) return;
    var code = document.getElementById('itemCodeInput').value.trim();
    var note = document.getElementById('itemNoteInput').value.trim();
    if (!code) return;
    arr.push({code:code, checked:false, note:note, link:''});
    closeItemModal();
    renderApp();
    saveState();
}

function openLinkModal(sid, sk, i) {
    var arr = getItemsContainer(sid, sk);
    if (!arr || !arr[i]) return;
    linkItemSubjectId = sid;
    linkItemSectionKey = sk || null;
    linkItemIndex = i;
    document.getElementById('linkItemLabel').textContent = arr[i].code;
    document.getElementById('linkUrlInput').value = arr[i].link || '';
    document.getElementById('linkModal').classList.remove('hidden');
}
function closeLinkModal() {
    document.getElementById('linkModal').classList.add('hidden');
}
function saveItemLink(e) {
    e.preventDefault();
    var arr = getItemsContainer(linkItemSubjectId, linkItemSectionKey);
    if (!arr || !arr[linkItemIndex]) return;
    arr[linkItemIndex].link = document.getElementById('linkUrlInput').value.trim();
    closeLinkModal();
    renderSubjects();
    saveState();
}
function clearItemLink() {
    var arr = getItemsContainer(linkItemSubjectId, linkItemSectionKey);
    if (!arr || !arr[linkItemIndex]) return;
    arr[linkItemIndex].link = '';
    closeLinkModal();
    renderSubjects();
    saveState();
}

function renderTimetable() {
    var container = document.getElementById('timetableGrid');
    if (!container) return;
    container.innerHTML = '';
    var week = currentWeekLetter();
    var table = document.createElement('table');
    table.className = 'tt-table';
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    var corner = document.createElement('th');
    corner.className = 'tt-day-head';
    headRow.appendChild(corner);
    for (var c = 0; c < TIME_COLUMNS.length; c++) {
        var th = document.createElement('th');
        th.className = 'tt-hour-head';
        th.textContent = TIME_COLUMNS[c];
        headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);
    var tbody = document.createElement('tbody');
    DAY_KEYS.forEach(function(day) {
        var row = document.createElement('tr');
        var dayTd = document.createElement('td');
        dayTd.className = 'tt-day-cell';
        dayTd.textContent = dayLabel(day);
        row.appendChild(dayTd);
        var slots = (appState.timetable[day] || []).filter(function(s){ return s.week === 'AB' || s.week === week; });
        var covered = [];
        for (var z = 0; z < TIME_COLUMNS.length; z++) covered[z] = false;
        for (var i = 0; i < TIME_COLUMNS.length; i++) {
            if (covered[i]) continue;
            var hour = TIME_COLUMNS[i];
            var slot = null;
            for (var k = 0; k < slots.length; k++) if (slots[k].start === hour) { slot = slots[k]; break; }
            if (slot) {
                var endIdx = TIME_COLUMNS.indexOf(slot.end);
                var span = (endIdx > i) ? (endIdx - i) : 1;
                var td = document.createElement('td');
                td.className = 'tt-slot';
                td.colSpan = span;
                var block = document.createElement('div');
                block.className = 'tt-block tt-subject';
                if (slot.week === 'A') block.classList.add('week-a');
                else if (slot.week === 'B') block.classList.add('week-b');
                var subj = findSubjectById(slot.subjectId);
                var nm = subj ? displayName(subj) : '—';
                var rm = displayRoom(slot.room);
                block.innerHTML = '<div class="font-bold leading-tight">' + escapeHtml(nm) + '</div><div class="text-[9px] opacity-80">' + escapeHtml(rm) + ' · ' + slot.start + '-' + slot.end + '</div>';
                var realIdx = appState.timetable[day].indexOf(slot);
                (function(d, ii){ block.onclick = function(){ openSlotModal(d, ii); }; })(day, realIdx);
                td.appendChild(block);
                row.appendChild(td);
                for (var kk = i; kk < i + span; kk++) covered[kk] = true;
            } else {
                var eTd = document.createElement('td');
                eTd.className = 'tt-slot';
                var empty = document.createElement('div');
                empty.className = 'tt-empty';
                empty.textContent = '—';
                (function(d, h){ empty.onclick = function(){ openSlotModal(d, -1, h); }; })(day, hour);
                eTd.appendChild(empty);
                row.appendChild(eTd);
            }
        }
        tbody.appendChild(row);
    });
    table.appendChild(tbody);
    container.appendChild(table);
}

function openSlotModal(day, idx, defaultStart) {
    editingSlot = {day: day, index: idx};
    var sel = document.getElementById('slotSubjectSelect');
    sel.innerHTML = '';
    appState.subjects.forEach(function(s) {
        var o = document.createElement('option');
        o.value = s.id;
        o.textContent = displayName(s);
        sel.appendChild(o);
    });
    document.getElementById('slotModalContext').textContent = dayLabel(day) + ' — ' + (idx >= 0 ? 'تعديل' : 'إضافة');
    if (idx >= 0) {
        var slot = appState.timetable[day][idx];
        sel.value = slot.subjectId;
        document.getElementById('slotRoomInput').value = slot.room || '';
        document.getElementById('slotStartInput').value = slot.start || '08:00';
        document.getElementById('slotEndInput').value = slot.end || '09:00';
        document.getElementById('slotWeekInput').value = slot.week || 'AB';
        document.getElementById('btnDeleteSlot').style.display = '';
    } else {
        if (sel.options.length) sel.selectedIndex = 0;
        document.getElementById('slotRoomInput').value = '';
        document.getElementById('slotStartInput').value = defaultStart || '08:00';
        var m = timeToMins(defaultStart || '08:00') + 60;
        var eh = String(Math.floor(m/60)).padStart(2,'0');
        var em = String(m%60).padStart(2,'0');
        document.getElementById('slotEndInput').value = eh + ':' + em;
        document.getElementById('slotWeekInput').value = 'AB';
        document.getElementById('btnDeleteSlot').style.display = 'none';
    }
    document.getElementById('slotModal').classList.remove('hidden');
}
function closeSlotModal() {
    document.getElementById('slotModal').classList.add('hidden');
    editingSlot = {day:null, index:null};
}
function saveSlot(e) {
    e.preventDefault();
    var day = editingSlot.day;
    if (!day) return;
    var subjectId = document.getElementById('slotSubjectSelect').value;
    var room = document.getElementById('slotRoomInput').value.trim();
    var start = document.getElementById('slotStartInput').value;
    var end = document.getElementById('slotEndInput').value;
    var week = document.getElementById('slotWeekInput').value;
    if (!subjectId) return;
    if (timeToMins(end) <= timeToMins(start)) return;
    if (!Array.isArray(appState.timetable[day])) appState.timetable[day] = [];
    var slot = {subjectId:subjectId, room:room, start:start, end:end, week:week};
    if (editingSlot.index >= 0) appState.timetable[day][editingSlot.index] = slot;
    else appState.timetable[day].push(slot);
    appState.timetable[day].sort(function(a,b){return a.start.localeCompare(b.start);});
    closeSlotModal();
    renderTimetable();
    renderSmartAssistant();
    saveState();
}
function clearSlot() {
    var day = editingSlot.day;
    if (!day || editingSlot.index < 0) return;
    if (!confirm('حذف الحصة؟')) return;
    appState.timetable[day].splice(editingSlot.index, 1);
    closeSlotModal();
    renderTimetable();
    renderSmartAssistant();
    saveState();
}
function resetTimetable() {
    if (!confirm('استعادة الجدول الافتراضي؟')) return;
    appState.timetable = getDefaultTimetable();
    renderTimetable();
    renderSmartAssistant();
    saveState();
}
function setManualWeek(w) {
    appState.manualWeek = (w === 'auto') ? null : w;
    renderWeekToggle();
    renderTimetable();
    renderSmartAssistant();
    saveState();
}
function renderWeekToggle() {
    var cur = currentWeekLetter();
    var man = appState.manualWeek;
    var tA = document.getElementById('ttWeekA');
    var tB = document.getElementById('ttWeekB');
    var tAuto = document.getElementById('ttWeekAuto');
    if (tA && tB && tAuto) {
        tA.classList.toggle('active', man === 'A');
        tB.classList.toggle('active', man === 'B');
        tAuto.classList.toggle('active', man === null);
    }
}

function renderHomework() {
    var list = document.getElementById('homeworkList');
    if (!list) return;
    list.innerHTML = '';
    var sel = document.getElementById('hwSubjectSelect');
    if (sel) {
        sel.innerHTML = '';
        appState.subjects.forEach(function(s) {
            var o = document.createElement('option');
            o.value = s.id;
            o.textContent = displayName(s);
            sel.appendChild(o);
        });
    }
    var hw = appState.homework || [];
    var cAll = hw.length;
    var cDone = 0, cPend = 0;
    hw.forEach(function(h){ if (h.completed) cDone++; else cPend++; });
    document.getElementById('hwCountAll').textContent = cAll;
    document.getElementById('hwCountCompleted').textContent = cDone;
    document.getElementById('hwCountPending').textContent = cPend;
    document.querySelectorAll('.hw-filter-btn').forEach(function(b){
        var active = b.dataset.hwf === hwFilter;
        b.classList.toggle('bg-brand-500', active);
        b.classList.toggle('text-white', active);
        b.classList.toggle('border-brand-500', active);
        b.classList.toggle('text-slate-600', !active);
        b.classList.toggle('dark:text-slate-300', !active);
    });
    var items = hw.slice();
    if (hwFilter === 'pending') items = items.filter(function(h){return !h.completed;});
    if (hwFilter === 'completed') items = items.filter(function(h){return h.completed;});
    items.sort(function(a,b){
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        var rank = {urgent:0, medium:1, normal:2};
        var ra = rank[a.priority] != null ? rank[a.priority] : 2;
        var rb = rank[b.priority] != null ? rank[b.priority] : 2;
        if (ra !== rb) return ra - rb;
        return (a.due || '9999').localeCompare(b.due || '9999');
    });
    if (items.length === 0) {
        list.innerHTML = '<p class="text-center text-sm text-slate-400 py-6">لا توجد واجبات</p>';
        updateHwBadge();
        return;
    }
    items.forEach(function(hwItem){
        var subj = findSubjectById(hwItem.subjectId);
        var nm = subj ? displayName(subj) : '—';
        var pc = hwItem.priority === 'urgent' ? 'prio-urgent' : hwItem.priority === 'medium' ? 'prio-medium' : 'prio-normal';
        var pl = hwItem.priority === 'urgent' ? 'عاجل' : hwItem.priority === 'medium' ? 'متوسط' : 'عادي';
        var dt = hwItem.due ? formatDue(hwItem.due) : 'بدون موعد';
        var card = document.createElement('div');
        card.className = 'border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 bg-white dark:bg-slate-800 flex items-start gap-2 group';
        card.innerHTML = '' +
            '<button onclick="toggleHw(\'' + hwItem.id + '\')" class="mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ' +
                (hwItem.completed ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-400') + '">' +
                (hwItem.completed ? '<i class="fa-solid fa-check text-xs"></i>' : '') + '</button>' +
            '<div class="flex-1 min-w-0 ' + (hwItem.completed ? 'hw-done' : '') + '">' +
                '<div class="flex flex-wrap items-center gap-1.5 mb-1">' +
                    '<span class="text-[10px] font-bold px-1.5 py-0.5 rounded-md ' + pc + '">' + pl + '</span>' +
                    '<span class="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">' + escapeHtml(nm) + '</span>' +
                    '<span class="text-[10px] font-semibold text-slate-400"><i class="fa-regular fa-clock mr-0.5"></i>' + escapeHtml(dt) + '</span>' +
                '</div>' +
                '<h4 class="font-bold text-sm text-slate-900 dark:text-white">' + escapeHtml(hwItem.title) + '</h4>' +
                (hwItem.details ? '<p class="text-xs text-slate-500 mt-1 whitespace-pre-wrap">' + escapeHtml(hwItem.details) + '</p>' : '') +
            '</div>' +
            '<div class="flex gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">' +
                '<button onclick="openEditHw(\'' + hwItem.id + '\')" class="w-6 h-6 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 text-[10px]"><i class="fa-solid fa-pen"></i></button>' +
                '<button onclick="deleteHw(\'' + hwItem.id + '\')" class="w-6 h-6 rounded-md text-slate-500 hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-600 text-[10px]"><i class="fa-solid fa-trash-can"></i></button>' +
            '</div>';
        list.appendChild(card);
    });
    updateHwBadge();
}
function formatDue(due) {
    var today = new Date(); today.setHours(0,0,0,0);
    var d = new Date(due); d.setHours(0,0,0,0);
    var diff = Math.round((d - today) / 86400000);
    if (diff < 0) return 'متأخر · ' + due;
    if (diff === 0) return 'اليوم · ' + due;
    if (diff === 1) return 'غداً · ' + due;
    if (diff <= 3) return 'بعد ' + diff + ' يوم';
    return due;
}
function setHwFilter(f) { hwFilter = f; renderHomework(); }
function updateHwBadge() {
    var pending = (appState.homework || []).filter(function(h){return !h.completed;}).length;
    var b = document.getElementById('hwBadge');
    if (!b) return;
    if (pending > 0) { b.textContent = pending; b.classList.remove('hidden'); }
    else b.classList.add('hidden');
}
function openAddHomeworkModal() {
    editingHomeworkId = null;
    document.getElementById('homeworkModalTitle').textContent = 'واجب جديد';
    renderHomework();
    if (document.getElementById('hwSubjectSelect').options.length) document.getElementById('hwSubjectSelect').selectedIndex = 0;
    document.getElementById('hwTitleInput').value = '';
    document.getElementById('hwDetailsInput').value = '';
    document.getElementById('hwDueInput').value = '';
    document.getElementById('hwPriorityInput').value = 'normal';
    document.getElementById('homeworkModal').classList.remove('hidden');
}
function openEditHw(id) {
    var h = (appState.homework || []).find(function(x){return x.id === id;});
    if (!h) return;
    editingHomeworkId = id;
    document.getElementById('homeworkModalTitle').textContent = 'تعديل الواجب';
    renderHomework();
    document.getElementById('hwSubjectSelect').value = h.subjectId || '';
    document.getElementById('hwTitleInput').value = h.title || '';
    document.getElementById('hwDetailsInput').value = h.details || '';
    document.getElementById('hwDueInput').value = h.due || '';
    document.getElementById('hwPriorityInput').value = h.priority || 'normal';
    document.getElementById('homeworkModal').classList.remove('hidden');
}
function closeHomeworkModal() {
    document.getElementById('homeworkModal').classList.add('hidden');
    editingHomeworkId = null;
    if (typeof checkTutorialCompletionAfterAdd === 'function') {
        checkTutorialCompletionAfterAdd();
    }
}
function saveHomework(e) {
    e.preventDefault();
    var subjectId = document.getElementById('hwSubjectSelect').value;
    var title = document.getElementById('hwTitleInput').value.trim();
    var details = document.getElementById('hwDetailsInput').value.trim();
    var due = document.getElementById('hwDueInput').value;
    var priority = document.getElementById('hwPriorityInput').value;
    if (!subjectId || !title) return;
    if (editingHomeworkId) {
        var h = appState.homework.find(function(x){return x.id === editingHomeworkId;});
        if (h) { h.subjectId = subjectId; h.title = title; h.details = details; h.due = due; h.priority = priority; }
    } else {
        appState.homework.push({id:'hw_'+Date.now(), subjectId:subjectId, title:title, details:details, due:due, priority:priority, completed:false});
    }
    closeHomeworkModal();
    renderHomework();
    renderSmartAssistant();
    saveState();
}
function toggleHw(id) {
    var h = appState.homework.find(function(x){return x.id === id;});
    if (!h) return;
    h.completed = !h.completed;
    h.completedAt = h.completed ? Date.now() : null;
    renderHomework();
    renderSmartAssistant();
    saveState();
}
function deleteHw(id) {
    if (!confirm('حذف الواجب؟')) return;
    appState.homework = appState.homework.filter(function(x){return x.id !== id;});
    renderHomework();
    renderSmartAssistant();
    saveState();
}
/* ============================================================
   app.js — منطق التطبيق الرئيسي (الجزء 3 والأخير)
   ============================================================ */

function renderSmartAssistant() {
    var now = new Date();
    var hh = String(now.getHours()).padStart(2, '0');
    var mm = String(now.getMinutes()).padStart(2, '0');
    var ss = String(now.getSeconds()).padStart(2, '0');
    var hr = now.getHours();
    
    setText('saClock', hh + ':' + mm + ':' + ss);
    setText('saDate', now.toLocaleDateString(localeTag(), {weekday: 'long', day: 'numeric', month: 'long'}));
    
    var av = document.getElementById('saAvatar');
    if (av) {
        var icon = 'fa-wand-magic-sparkles';
        if (hr >= 5 && hr < 12) icon = 'fa-sun';
        else if (hr >= 12 && hr < 17) icon = 'fa-cloud-sun';
        else if (hr >= 17 && hr < 22) icon = 'fa-moon';
        else icon = 'fa-star';
        av.innerHTML = '<i class="fa-solid ' + icon + '"></i>';
    }
    
    var greet, mood;
    if (hr >= 5 && hr < 12) {
        greet = 'صباح الخير';
        mood = 'بداية يوم جديد — لنبدأ بقوة!';
    } else if (hr >= 12 && hr < 17) {
        greet = 'نهارك سعيد';
        mood = 'استمر في التقدم — أنت في منتصف الطريق';
    } else if (hr >= 17 && hr < 22) {
        greet = 'مساء الخير';
        mood = 'وقت المراجعة المسائي — ركز قليلاً';
    } else {
        greet = 'ليلة هادئة';
        mood = 'وقت الراحة — نم جيداً لتصحو نشيطاً';
    }
    
    var userName = CURRENT_USER ? CURRENT_USER.name : '';
    setText('saGreeting', greet + ' ' + userName + '!');
    setText('saMood', mood);
    
    var points = (typeof CURRENT_STATS !== 'undefined' && CURRENT_STATS.points) ? CURRENT_STATS.points : 0;
    var streak = (typeof CURRENT_STATS !== 'undefined' && CURRENT_STATS.currentStreak) ? CURRENT_STATS.currentStreak : 0;
    setText('saPoints', points);
    setText('saStreak', streak);
    
    var progress = (typeof CURRENT_STATS !== 'undefined') ? CURRENT_STATS.todayProgress : null;
    var goalText = '0/0';
    var goalChip = document.getElementById('saGoalChip');
    if (progress) {
        goalText = (progress.current_value || 0) + '/' + (progress.goal_value || 0);
        if (goalChip) {
            if (progress.goal_met) goalChip.classList.add('bg-emerald-500/30');
            else goalChip.classList.remove('bg-emerald-500/30');
        }
    }
    setText('saGoalProgress', goalText);
    
    var week = currentWeekLetter();
    var dayKey = mapDayToKey(now.getDay());
    var todaySlots = (appState.timetable[dayKey] || []).filter(function(s){ return s.week === 'AB' || s.week === week; });
    var todayLabel = dayLabel(dayKey);
    
    var todayMsg = '';
    if (todaySlots.length === 0) {
        todayMsg = todayLabel + ': لا حصص — يوم راحة.';
    } else {
        var sorted = todaySlots.slice().sort(function(a,b){ return a.start.localeCompare(b.start); });
        var nowM = hr * 60 + now.getMinutes();
        var nextSlot = null;
        for (var i = 0; i < sorted.length; i++) {
            if (timeToMins(sorted[i].start) > nowM) { nextSlot = sorted[i]; break; }
        }
        if (nextSlot) {
            var sub = findSubjectById(nextSlot.subjectId);
            var nm = sub ? displayName(sub) : '';
            var dd = timeToMins(nextSlot.start) - nowM;
            if (dd <= 30) todayMsg = 'الحصة القادمة بعد ' + dd + ' دقيقة: ' + nm;
            else if (dd <= 120) todayMsg = 'الحصة القادمة: ' + nm + ' على ' + nextSlot.start;
            else todayMsg = 'لديك ' + todaySlots.length + ' حصة اليوم، أولها ' + nm + ' على ' + nextSlot.start;
        } else {
            todayMsg = 'انتهت حصص اليوم (' + todaySlots.length + ' حصة). وقت المراجعة!';
        }
    }
    var el1 = document.getElementById('saTodayLine');
    if (el1 && el1.querySelector('span')) el1.querySelector('span').textContent = todayMsg;
    
    var tom = new Date(now.getTime() + 86400000);
    var tomKey = mapDayToKey(tom.getDay());
    var tomSlots = (appState.timetable[tomKey] || []).filter(function(s){ return s.week === 'AB' || s.week === week; });
    var tomLabel = dayLabel(tomKey);
    var tomMsg = '';
    if (tomSlots.length === 0) {
        tomMsg = tomLabel + ': لا حصص — فرصة للمراجعة.';
    } else {
        var sortedT = tomSlots.slice().sort(function(a,b){ return a.start.localeCompare(b.start); });
        var first = sortedT[0];
        var sub1 = findSubjectById(first.subjectId);
        var nm1 = sub1 ? displayName(sub1) : '';
        tomMsg = 'غداً (' + tomLabel + '): ' + tomSlots.length + ' حصة، تبدأ بـ ' + nm1 + '.';
    }
    var el2 = document.getElementById('saTomorrowLine');
    if (el2 && el2.querySelector('span')) el2.querySelector('span').textContent = tomMsg;
    
    var pendingHw = (appState.homework || []).filter(function(h){ return !h.completed; });
    var hwMsg = '';
    if (pendingHw.length > 0) {
        pendingHw.sort(function(a,b){
            var rank = {urgent:0, medium:1, normal:2};
            return (rank[a.priority] || 2) - (rank[b.priority] || 2);
        });
        var urgent = pendingHw.filter(function(h){ return h.priority === 'urgent'; }).length;
        hwMsg = 'لديك ' + pendingHw.length + ' واجب معلق' + (urgent > 0 ? ' (منها ' + urgent + ' عاجل)' : '') + '.';
    } else {
        hwMsg = 'ما شاء الله! لا واجبات معلقة.';
    }
    var el3 = document.getElementById('saHomeworkLine');
    if (el3 && el3.querySelector('span')) el3.querySelector('span').textContent = hwMsg;
    
    var tip = getDailyTip(hr, progress);
    var el4 = document.getElementById('saTipLine');
    if (el4 && el4.querySelector('span')) el4.querySelector('span').textContent = tip;
}

function getDailyTip(hr, progress) {
    var missed = (typeof CURRENT_STATS !== 'undefined' && CURRENT_STATS.missedDays) ? CURRENT_STATS.missedDays.length : 0;
    var streak = (typeof CURRENT_STATS !== 'undefined' && CURRENT_STATS.currentStreak) ? CURRENT_STATS.currentStreak : 0;
    if (missed > 0) return 'لديك ' + missed + ' يوم فائت. انقر تبويب "التقدم" لإصلاحه.';
    if (streak >= 30) return 'شهر كامل من الانتظام! أنت أسطورة 🔥';
    if (streak >= 7) return 'Streak = ' + streak + ' يوم! استمر.';
    
    if (hr >= 20 && hr < 24 && progress && !progress.goal_met) {
        return 'بقي القليل! لديك ' + (progress.goal_value - progress.current_value) + ' مهمة.';
    }
    var tips = [
        'ابدأ بأصعب مادة — عقلك في أفضل حالاته الآن.',
        'قاعدة 2 دقيقة: ابدأ المهمة لدقيقتين، ستكملها تلقائياً.',
        'النوم 7 ساعات = ذاكرة أقوى بنسبة 40%.',
        'راجع بشكل متكرر — الأفضل من الجلسة الطويلة.',
        'اشرب ماء كل 30 دقيقة أثناء الدراسة.'
    ];
    return tips[new Date().getDate() % tips.length];
}

function openSettingsModal() {
    if (!CURRENT_USER) return;
    document.getElementById('settingUsername').value = CURRENT_USER.name || '';
    document.getElementById('settingGrade').value = CURRENT_USER.grade || '';
    document.getElementById('settingTerm').value = CURRENT_USER.term || '';
    document.getElementById('settingExamType').value = CURRENT_USER.examType || 'مراقبة';
    document.getElementById('settingSchoolYear').value = CURRENT_USER.schoolYear || '';
    document.getElementById('settingWeekAStart').value = appState.weekAStart || '';
    document.getElementById('settingsAvatarPreview').src = CURRENT_USER.avatar || DEFAULT_AVATAR;
    document.getElementById('settingsModal').classList.remove('hidden');
}
function closeSettingsModal() {
    document.getElementById('settingsModal').classList.add('hidden');
}

function changeLanguage(l) {
    appState.lang = l;
    document.documentElement.setAttribute('lang', l);
    document.documentElement.setAttribute('dir', l === 'ar' ? 'rtl' : 'ltr');
    var sel = document.getElementById('langSelect');
    if (sel) sel.value = l;
    applyLanguage();
    renderApp();
    saveState();
}

function applyLanguage() {
    document.title = t('pageTitle');
    var elts = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < elts.length; i++) {
        var k = elts[i].getAttribute('data-i18n');
        var v = t(k);
        if (v) elts[i].textContent = v;
    }
}

function toggleDarkMode() {
    appState.darkMode = !appState.darkMode;
    applyTheme();
    saveState();
}

function applyTheme() {
    var icon = document.getElementById('themeIcon');
    if (appState.darkMode) {
        document.documentElement.classList.add('dark');
        if (icon) icon.className = 'fa-solid fa-sun text-amber-400 text-xs';
    } else {
        document.documentElement.classList.remove('dark');
        if (icon) icon.className = 'fa-solid fa-moon text-xs';
    }
}

function switchTab(tab) {
    if (typeof quickAddState !== 'undefined' && quickAddState.active) cancelQuickAdd();
    if (typeof exercisesModalState !== 'undefined' && exercisesModalState.subjectId != null) closeExercisesModal();
    
    currentTab = tab;
    ['checklist','timetable','homework','stats','tutoring','progress','results','preparation','series','notes','exams','calculator'].forEach(function(x) {
        var el = document.getElementById('tab-'+x);
        if (el) el.classList.toggle('hidden', x !== tab);
    });
    document.querySelectorAll('.tab-btn').forEach(function(b){
        b.classList.toggle('active', b.dataset.tab === tab);
    });
    if (tab === 'timetable') renderTimetable();
    if (tab === 'homework') renderHomework();
    if (tab === 'stats') renderStats();
    if (tab === 'checklist') renderSubjects();
}

function renderCountdown() {
    var d = document.getElementById('countdownDisplay');
    var s = document.getElementById('countdownSubject');
    if (!d) return;
    var today = new Date(); today.setHours(0,0,0,0);
    var up = [];
    appState.subjects.forEach(function(sub){
        if (!sub.examDate) return;
        var dd = new Date(sub.examDate); dd.setHours(0,0,0,0);
        var diff = Math.round((dd - today) / 86400000);
        if (diff >= 0) up.push({name:displayName(sub), date:dd, diff:diff});
    });
    if (up.length === 0) { d.textContent = t('notSet'); s.textContent = t('addExamDateHint'); return; }
    up.sort(function(a,b){return a.diff - b.diff;});
    var n = up[0];
    if (n.diff === 0) d.textContent = t('dayToday');
    else if (n.diff === 1) d.textContent = t('dayTomorrow');
    else d.textContent = n.diff + ' ' + t('dayCount');
    s.textContent = n.name + ' · ' + n.date.toLocaleDateString(localeTag());
}

window.addEventListener('DOMContentLoaded', function(){
    try {
        var saved = localStorage.getItem('acc_token');
        if (saved) {
            AUTH_TOKEN = saved;
            fetch('/api/account/me', {
                credentials: 'include',
                headers: { 'Authorization': 'Bearer ' + AUTH_TOKEN }
            }).then(function(r){ 
                if (!r.ok) throw new Error();
                return r.json();
            }).then(function(data){
                if (data && data.account) {
                    CURRENT_ACCOUNT = data.account;
                    enterAccountPanel();
                    return;
                }
                showAccountScreen();
            }).catch(function(){
                try { localStorage.removeItem('acc_token'); } catch(e){}
                AUTH_TOKEN = null;
                showAccountScreen();
            });
        } else {
            showAccountScreen();
        }
    } catch (e) {
        showAccountScreen();
    }
    
    countdownTicker = setInterval(function(){ if (CURRENT_USER) renderCountdown(); }, 60000);
    assistantClockTicker = setInterval(function(){ if (CURRENT_USER) renderSmartAssistant(); }, 1000);
});

function showAccountScreen() {
    document.getElementById('accountScreen').classList.remove('hidden');
    document.getElementById('usersScreen').classList.add('hidden');
    document.getElementById('app').classList.add('hidden');
}

// (باقي دوال المواد والجدول والواجبات سيتم إضافتها في الجزء 2)
