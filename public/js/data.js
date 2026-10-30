/* ============================================================
   data.js — البيانات الافتراضية والحالة العامة
   ============================================================ */

function getDefaultSubjects() {
    return [
        { id: "subj_math", name: { ar: "رياضيات", fr: "Mathématiques", en: "Mathematics" }, examDate: "", sections: [
            { key: "1", labelKey: "sectionControl1", badgeKey: "1", items: [
                {code:"2025",checked:false,note:"",link:""},{code:"2025",checked:false,note:"",link:""},
                {code:"2023",checked:false,note:"",link:""},{code:"2022",checked:false,note:"",link:""},
                {code:"2021C",checked:false,note:"",link:""},{code:"2019C",checked:false,note:"",link:""},
                {code:"2009C",checked:false,note:"",link:""},{code:"2015C",checked:false,note:"",link:""},
                {code:"2012C",checked:false,note:"",link:""},{code:"2018P2",checked:false,note:"",link:""},
                {code:"2019P2",checked:false,note:"",link:""},{code:"2021P2",checked:false,note:"",link:""},
                {code:"2024E",checked:false,note:"",link:""}
            ]},
            { key: "2", labelKey: "sectionControl2", badgeKey: "2", items: [
                {code:"2015C",checked:false,note:"",link:""},{code:"2014C",checked:false,note:"",link:""},
                {code:"2013C",checked:false,note:"",link:""},{code:"2012C",checked:false,note:"",link:""},
                {code:"2017C",checked:false,note:"",link:""},{code:"2021C",checked:false,note:"",link:""},
                {code:"2025",checked:false,note:"",link:""},{code:"2023",checked:false,note:"",link:""},
                {code:"2021P2",checked:false,note:"",link:""},{code:"2019P2",checked:false,note:"",link:""},
                {code:"2024E",checked:false,note:"",link:""}
            ]}
        ]},
        { id: "subj_phy", name: { ar: "العلوم الفيزيائية", fr: "Physique", en: "Physics" }, examDate: "", items: [
            {code:"2011C",checked:false,note:"",link:""},{code:"2010C",checked:false,note:"",link:""},
            {code:"2012C",checked:false,note:"",link:""},{code:"2013C",checked:false,note:"",link:""},
            {code:"2014C",checked:false,note:"",link:""},{code:"2015C",checked:false,note:"",link:""},
            {code:"2017C",checked:false,note:"",link:""},{code:"2020C",checked:false,note:"",link:""},
            {code:"2021C",checked:false,note:"",link:""},{code:"2023C",checked:false,note:"",link:""},
            {code:"2025C",checked:false,note:"",link:""},{code:"2024E",checked:false,note:"",link:""}
        ]},
        { id: "subj_svt", name: { ar: "علوم الحياة والأرض", fr: "SVT", en: "Science of Life & Earth" }, examDate: "", items: [
            {code:"2020C",checked:false,note:"",link:""},{code:"2020",checked:false,note:"",link:""},
            {code:"2017C",checked:false,note:"",link:""},{code:"2017",checked:false,note:"",link:""},
            {code:"2024E",checked:false,note:"",link:""}
        ]},
        { id: "subj_fr", name: { ar: "الفرنسية", fr: "Français", en: "French" }, examDate: "", items: [
            {code:"2015",checked:false,note:"",link:""},{code:"2016",checked:false,note:"",link:""},
            {code:"2024E",checked:false,note:"",link:""}
        ]},
        { id: "subj_his", name: { ar: "التاريخ", fr: "Histoire", en: "History" }, examDate: "", items: [
            {code:"2018",checked:false,note:"",link:""},{code:"2024E",checked:false,note:"",link:""}
        ]},
        { id: "subj_ar", name: { ar: "العربية", fr: "Arabe", en: "Arabic" }, examDate: "", items: [
            {code:"2018GF",checked:false,note:"",link:""},{code:"2024E",checked:false,note:"",link:""}
        ]},
        { id: "subj_geo", name: { ar: "الجغرافيا", fr: "Géographie", en: "Geography" }, examDate: "", items: [
            {code:"2018",checked:false,note:"",link:""},{code:"2024E",checked:false,note:"",link:""}
        ]},
        { id: "subj_civ", name: { ar: "التربية المدنية", fr: "Éducation civique", en: "Civic Education" }, examDate: "", items: [
            {code:"2018",checked:false,note:"",link:""},{code:"2024E",checked:false,note:"",link:""}
        ]},
        { id: "subj_tech", name: { ar: "التكنولوجيا", fr: "Technologie", en: "Technology" }, examDate: "", items: [
            {code:"2021",checked:false,note:"",link:""},{code:"2024EC",checked:false,note:"",link:""}
        ]},
        { id: "subj_eng", name: { ar: "الإنجليزية", fr: "Anglais", en: "English" }, examDate: "", items: [
            {code:"?",checked:false,note:"",link:""},{code:"2024EC",checked:false,note:"",link:""}
        ]},
        { id: "subj_isl", name: { ar: "التربية الإسلامية", fr: "Éducation islamique", en: "Islamic Studies" }, examDate: "", items: [
            {code:"2018",checked:false,note:"",link:""}
        ]}
    ];
}

function getDefaultTimetable() {
    return {
        monday: [
            {subjectId:"subj_math", room:"ق28", start:"08:00", end:"10:00", week:"AB"},
            {subjectId:"subj_svt", room:"تب3", start:"10:00", end:"11:00", week:"AB"},
            {subjectId:"subj_fr", room:"إع5", start:"11:00", end:"12:00", week:"AB"},
            {subjectId:"subj_his", room:"ق09", start:"13:00", end:"14:00", week:"AB"},
            {subjectId:"subj_ar", room:"ق11", start:"14:00", end:"15:00", week:"AB"}
        ],
        tuesday: [
            {subjectId:"subj_eng", room:"ق12", start:"09:00", end:"10:00", week:"AB"},
            {subjectId:"subj_math", room:"ق28", start:"10:00", end:"12:00", week:"AB"},
            {subjectId:"subj_phy", room:"ق14", start:"13:00", end:"14:00", week:"AB"},
            {subjectId:"subj_fr", room:"إع5", start:"14:00", end:"16:00", week:"AB"}
        ],
        wednesday: [
            {subjectId:"subj_phy", room:"ق18", start:"08:00", end:"10:00", week:"AB"},
            {subjectId:"subj_fr", room:"إع5", start:"10:00", end:"12:00", week:"AB"},
            {subjectId:"subj_math", room:"ق18", start:"14:00", end:"16:00", week:"AB"}
        ],
        thursday: [
            {subjectId:"subj_svt", room:"ق18", start:"08:00", end:"09:00", week:"AB"},
            {subjectId:"subj_phy", room:"ع1", start:"08:00", end:"09:00", week:"AB"},
            {subjectId:"subj_tech", room:"إع1", start:"09:00", end:"11:00", week:"AB"},
            {subjectId:"subj_svt", room:"تب3", start:"11:00", end:"12:00", week:"AB"},
            {subjectId:"subj_ar", room:"ق14", start:"13:00", end:"14:00", week:"AB"},
            {subjectId:"subj_eng", room:"ق20", start:"15:00", end:"16:00", week:"AB"},
            {subjectId:"subj_isl", room:"ق18", start:"16:00", end:"17:00", week:"AB"}
        ],
        friday: [
            {subjectId:"subj_tech", room:"تق1", start:"08:00", end:"13:00", week:"AB"},
            {subjectId:"subj_phy", room:"ع1", start:"08:00", end:"13:00", week:"AB"},
            {subjectId:"subj_svt", room:"ع2", start:"08:00", end:"13:00", week:"AB"}
        ],
        saturday: [
            {subjectId:"subj_civ", room:"ق18", start:"08:00", end:"09:00", week:"AB"},
            {subjectId:"subj_isl", room:"ق10", start:"08:00", end:"09:00", week:"AB"},
            {subjectId:"subj_eng", room:"ق21", start:"09:00", end:"10:00", week:"AB"},
            {subjectId:"subj_ar", room:"ق23", start:"10:00", end:"11:00", week:"AB"},
            {subjectId:"subj_his", room:"ق11", start:"11:00", end:"12:00", week:"AB"}
        ]
    };
}

var appState = {
    lang: "ar",
    darkMode: false,
    theme: "orange",
    weekAStart: "2026-09-29",
    manualWeek: null,
    user: null,
    subjects: [],
    timetable: {},
    homework: [],
    preparation: {},
    prepChecked: { date: null, checked: {} },
    tutorial: null,
    notifications: null,
    exams: [],
    series: [],
    notes: []
};

var AUTH_TOKEN = null;
var CURRENT_ACCOUNT = null;
var CURRENT_USER = null;
var CURRENT_USERS = [];
var API_BASE = '';
var selectedUserId = null;
var editingSubjectId = null;
var addingItemSubjectId = null;
var addingItemSectionKey = null;
var linkItemSubjectId = null;
var linkItemSectionKey = null;
var linkItemIndex = null;
var editingSlot = { day: null, index: null };
var editingHomeworkId = null;
var currentTab = "checklist";
var hwFilter = "all";

var pomodoroInterval = null;
var pomodoroSeconds = 25 * 60;
var pomodoroRunning = false;
var pomodoroMode = "focus";
var countdownTicker = null;
var assistantClockTicker = null;

var DAY_KEYS = ["monday","tuesday","wednesday","thursday","friday","saturday"];
var TIME_COLUMNS = ["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00"];
var DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23ea580c'/><circle cx='50' cy='38' r='20' fill='%23ffffff'/><path d='M20 85 C20 65, 35 55, 50 55 C65 55, 80 65, 80 85 Z' fill='%23ffffff'/></svg>";
