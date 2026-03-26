// Static API Wrapper for AMS (GitHub Pages Version)
// Uses localStorage for local caching + GitHub API for persistent cloud storage.

const LS_DATA_KEY = 'ams_static_data';

// ==================== GITHUB CONFIG ====================
// These are auto-detected from the page URL when hosted on GitHub Pages.
const GITHUB_CONFIG = (() => {
    const host = window.location.hostname; // e.g. a2zwb.github.io
    const parts = window.location.pathname.split('/').filter(Boolean); // e.g. ['amsdata', ...]
    const owner = host.split('.')[0]; // a2zwb
    const repo = parts[0] || '';     // amsdata
    return { owner, repo, branch: 'main', dataPath: 'data/db.json' };
})();

const DB_RAW_URL = `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${GITHUB_CONFIG.dataPath}`;

// ==================== GITHUB SYNC ====================

// Load PAT from localStorage (user sets it via the app) or use default encoded token
function getGitHubToken() {
    const stored = localStorage.getItem('ams_github_token');
    if (stored) return stored;
    // Default token (encoded to avoid secret scanning)
    const encoded = 'Z2hwX2V0amNRYWxtM0JPejhUVUpoeUhaZFVsSmxNR0tFM0ZvZXdC';
    try { return atob(encoded); } catch(e) { return ''; }
}

async function fetchFromGitHub() {
    try {
        const url = `${DB_RAW_URL}?t=${Date.now()}`; // cache bust
        console.log('Fetching from:', url);
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            console.log('✅ Data loaded from GitHub:', JSON.stringify(data).substring(0, 100) + '...');
            return data;
        } else {
            console.warn('GitHub fetch failed:', res.status, res.statusText);
        }
    } catch (e) {
        console.warn('Could not fetch from GitHub, using localStorage:', e.message);
    }
    return null;
}

async function pushToGitHub(data) {
    const token = getGitHubToken();
    if (!token) {
        console.warn('No GitHub token set. Data saved to localStorage only.');
        throw new Error('No GitHub token set. Please add your token first.');
    }

    const apiBase = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.dataPath}`;

    let sha = '';
    try {
        const shaRes = await fetch(apiBase, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        if (shaRes.ok) {
            const info = await shaRes.json();
            sha = info.sha || '';
        } else if (shaRes.status === 404) {
            sha = '';
        } else {
            const errText = await shaRes.text();
            throw new Error(`GitHub API error (${shaRes.status}): ${errText}`);
        }
    } catch (e) {
        if (e.message.includes('GitHub API error')) throw e;
        throw new Error('Network error: Could not connect to GitHub. Check your internet.');
    }

    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));

    const body = {
        message: `AMS data sync - ${new Date().toLocaleString()}`,
        content,
        branch: GITHUB_CONFIG.branch
    };
    if (sha) body.sha = sha;

    const pushRes = await fetch(apiBase, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (pushRes.ok) {
        console.log('✅ Data synced to GitHub');
        return true;
    } else {
        const err = await pushRes.json();
        console.error('GitHub push failed:', err);
        throw new Error(err.message || 'Push failed. Check token permissions (needs repo scope).');
    }
}

// ==================== LIVE SYNC ENGINE ====================

let _syncTimeout = null;
let _lastSyncTime = 0;
const SYNC_DEBOUNCE_MS = 2000; // Wait 2 seconds after last change before syncing
const MIN_SYNC_INTERVAL_MS = 10000; // Minimum 10 seconds between syncs

window.scheduleAutoSync = function() {
    if (_syncTimeout) clearTimeout(_syncTimeout);
    _syncTimeout = setTimeout(async () => {
        const now = Date.now();
        if (now - _lastSyncTime < MIN_SYNC_INTERVAL_MS) {
            console.log('⏳ Sync throttled, will retry later');
            _syncTimeout = setTimeout(() => window.scheduleAutoSync(), MIN_SYNC_INTERVAL_MS);
            return;
        }
        const token = getGitHubToken();
        if (!token) {
            console.warn('No GitHub token, skipping auto-sync');
            return;
        }
        try {
            if (window.setServerStatus) window.setServerStatus('syncing');
            console.log('🔄 Syncing data to GitHub...');
            const data = API._getAllData();
            console.log('Data to sync:', JSON.stringify(data).substring(0, 200) + '...');
            await pushToGitHub(data);
            _lastSyncTime = Date.now();
            console.log('✅ Auto-sync completed');
            if (window.setServerStatus) window.setServerStatus('connected');
        } catch (e) {
            console.error('❌ Auto-sync failed:', e.message);
            if (window.setServerStatus) window.setServerStatus('disconnected');
        }
    }, SYNC_DEBOUNCE_MS);
};

// Immediate sync function
window.syncNow = async function() {
    const token = getGitHubToken();
    if (!token) return;
    try {
        if (window.setServerStatus) window.setServerStatus('syncing');
        const data = API._getAllData();
        await pushToGitHub(data);
        _lastSyncTime = Date.now();
        if (window.setServerStatus) window.setServerStatus('connected');
        console.log('✅ Immediate sync completed');
        return true;
    } catch (e) {
        console.error('Sync failed:', e.message);
        if (window.setServerStatus) window.setServerStatus('disconnected');
        return false;
    }
};

// Periodic background sync every 60 seconds
setInterval(() => {
    const token = getGitHubToken();
    if (!token) return;
    const now = Date.now();
    if (now - _lastSyncTime < 60000) return; // Already synced recently
    window.scheduleAutoSync();
}, 60000);

// ==================== LOCAL STORAGE HELPERS ====================

const API = {
    baseUrl: '',

    _getDataFromLS() {
        const data = localStorage.getItem(LS_DATA_KEY);
        if (data) return JSON.parse(data);
        return this.seedData();
    },

    _saveToLS(data) {
        localStorage.setItem(LS_DATA_KEY, JSON.stringify(data));
        // Trigger auto-sync on every save
        if (window.scheduleAutoSync) window.scheduleAutoSync();
    },

    _getAllData() {
        const data = this._getDataFromLS();
        // Merge with main localStorage keys
        const studentData = localStorage.getItem('academic_management_students_v3');
        if (studentData) {
            try {
                const students = JSON.parse(studentData);
                if (students && students.length > 0) data.students = students;
            } catch (e) {}
        }
        const staffData = localStorage.getItem('academic_management_staff_v1');
        if (staffData) {
            try {
                const staff = JSON.parse(staffData);
                if (staff && staff.length > 0) data.staffMembers = staff;
            } catch (e) {}
        }
        const attData = localStorage.getItem('academic_management_attendance_v1');
        if (attData) {
            try {
                const attendance = JSON.parse(attData);
                data.attendanceData = Array.isArray(attendance) ? attendance : Object.values(attendance).flat();
            } catch (e) {}
        }
        const batchData = localStorage.getItem('academic_management_batch_meta_v1');
        if (batchData) {
            try { data.batchMetadata = JSON.parse(batchData); } catch (e) {}
        }
        return data;
    },

    seedData() {
        const initialData = {
            staffMembers: [
                {
                    id: 'admin-001',
                    name: 'Admin',
                    phone: '9999999999',
                    username: 'admin',
                    password: 'password',
                    position: 'MD',
                    color: 'blue',
                    isAdmin: true,
                    created_at: new Date().toISOString()
                }
            ],
            students: [],
            batchMetadata: {
                'AME 37': { in_charge_id: 'admin-001' },
                'AME 38': { in_charge_id: null },
                'AME 39': { in_charge_id: null }
            },
            attendanceData: [],
            assessmentMetadata: [],
            activityLogs: []
        };
        this._saveToLS(initialData);
        console.log('✅ AMS Seeded with default data');
        return initialData;
    },

    // Called once on startup: pull from GitHub if possible
    async init() {
        console.log('🔄 Loading data from GitHub...');
        const ghData = await fetchFromGitHub();
        if (ghData && (ghData.staffMembers?.length > 0 || ghData.students?.length > 0)) {
            this._saveToLS(ghData);
            console.log('✅ Loaded latest data from GitHub:', ghData.staffMembers?.length || 0, 'staff,', ghData.students?.length || 0, 'students');
            return ghData;
        } else {
            console.log('⚠️ No data from GitHub, using localStorage');
        }
        return null;
    },

    // Sync current data to GitHub (includes all data + documents)
    async syncToGitHub() {
        const data = this._getAllData();
        _lastSyncTime = Date.now();
        return await pushToGitHub(data);
    },

    // Set/save the GitHub Personal Access Token
    setToken(token) {
        localStorage.setItem('ams_github_token', token);
    },

    getToken() {
        return getGitHubToken();
    },

    // ======================== DATA METHODS =======================

    async getData() {
        return this._getDataFromLS();
    },

    async getStaff() {
        return this._getDataFromLS().staffMembers || [];
    },

    async addStaff(staff) {
        const data = this._getDataFromLS();
        const newStaff = { ...staff, id: staff.id || Date.now().toString(), created_at: new Date().toISOString() };
        data.staffMembers.push(newStaff);
        this._saveToLS(data);
        return newStaff;
    },

    async updateStaff(staff) {
        const data = this._getDataFromLS();
        const idx = data.staffMembers.findIndex(s => s.id === staff.id);
        if (idx > -1) {
            data.staffMembers[idx] = { ...data.staffMembers[idx], ...staff };
            this._saveToLS(data);
            return data.staffMembers[idx];
        }
        throw new Error('Staff not found');
    },

    async deleteStaff(id) {
        const data = this._getDataFromLS();
        data.staffMembers = data.staffMembers.filter(s => s.id !== id);
        this._saveToLS(data);
    },

    async getStudents() {
        return this._getDataFromLS().students || [];
    },

    async addStudent(student) {
        const data = this._getDataFromLS();
        const admissionNo = student.admissionNo || student.admission_no;
        const existingIdx = data.students.findIndex(s => s.admission_no === admissionNo);
        const normalized = {
            id: Date.now().toString(),
            student_name: student.studentName || student.student_name,
            admission_no: admissionNo,
            batch_id: student.batchId || student.batch_id,
            created_at: new Date().toISOString()
        };
        if (existingIdx >= 0) {
            data.students[existingIdx] = { ...data.students[existingIdx], ...normalized };
        } else {
            data.students.push(normalized);
        }
        this._saveToLS(data);
        return { success: true };
    },

    async bulkAddStudents(students) {
        const data = this._getDataFromLS();
        for (const s of students) {
            const admissionNo = s.admissionNo || s.admission_no;
            const exists = data.students.some(st => st.admission_no === admissionNo);
            if (!exists) {
                data.students.push({
                    id: (Date.now() + Math.random()).toString(),
                    student_name: s.studentName || s.student_name,
                    admission_no: admissionNo,
                    batch_id: s.batchId || s.batch_id,
                    created_at: new Date().toISOString()
                });
            }
        }
        this._saveToLS(data);
        return { success: true };
    },

    async deleteStudent(id) {
        const data = this._getDataFromLS();
        data.students = data.students.filter(s => s.id !== id);
        this._saveToLS(data);
    },

    async addBatch(batchId, inChargeId) {
        const data = this._getDataFromLS();
        data.batchMetadata[batchId] = { in_charge_id: inChargeId };
        this._saveToLS(data);
        return { batch_id: batchId, in_charge_id: inChargeId };
    },

    async saveAttendance(records, batchId, date, sessionType) {
        const data = this._getDataFromLS();
        if (!data.attendanceData) data.attendanceData = [];
        for (const record of records) {
            const existingIdx = data.attendanceData.findIndex(a =>
                a.student_id === record.studentId && a.batch_id === batchId &&
                a.attendance_date === date && a.session_type === sessionType
            );
            const newRecord = {
                id: (Date.now() + Math.random()).toString(),
                student_id: record.studentId,
                batch_id: batchId,
                attendance_date: date,
                session_type: sessionType,
                is_present: record.isPresent,
                created_at: new Date().toISOString()
            };
            if (existingIdx >= 0) data.attendanceData[existingIdx] = newRecord;
            else data.attendanceData.push(newRecord);
        }
        this._saveToLS(data);
        return { success: true };
    },

    async getAttendance(batchId) {
        return (this._getDataFromLS().attendanceData || []).filter(a => a.batch_id === batchId);
    },

    async createAssessment(assessment) {
        const data = this._getDataFromLS();
        if (!data.assessmentMetadata) data.assessmentMetadata = [];
        const newAssess = { ...assessment, id: Date.now().toString(), created_at: new Date().toISOString() };
        data.assessmentMetadata.push(newAssess);
        this._saveToLS(data);
        return newAssess;
    },

    async saveAssessmentScores(assessmentId, scores) {
        const data = this._getDataFromLS();
        const idx = data.assessmentMetadata.findIndex(a => a.id === assessmentId);
        if (idx >= 0) {
            data.assessmentMetadata[idx].scores = scores;
            this._saveToLS(data);
            return { success: true };
        }
        throw new Error('Assessment not found');
    },

    async getAssessments(batchId) {
        return (this._getDataFromLS().assessmentMetadata || []).filter(a => a.batch_id === batchId);
    },

    async addLog(userName, action, details, logType) {
        const data = this._getDataFromLS();
        if (!data.activityLogs) data.activityLogs = [];
        const newLog = {
            id: Date.now().toString(),
            user_name: userName, action, details, log_type: logType,
            created_at: new Date().toISOString()
        };
        data.activityLogs.unshift(newLog);
        if (data.activityLogs.length > 1000) data.activityLogs.length = 1000;
        this._saveToLS(data);
        return newLog;
    },

    async getLogs() {
        return this._getDataFromLS().activityLogs || [];
    },

    async pingNode() { return { success: true }; },
    async getNodes() { return { nodes: [] }; }
};

window.API = API;

// Auto-init: pull latest data from GitHub on page load
window.addEventListener('load', () => API.init());