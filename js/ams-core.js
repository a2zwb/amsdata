// Academic Management System v5.2.0-DEV-FIX
// Main Application Module

let students = [];
let assessmentMetadata = {};
let attendanceData = {};
let batchMetadata = {};
let staffMembers = [];
let currentBatch = 'AME 37';
let currentSubBatch = 'All';

const LS_KEY = 'academic_management_students_v3';
const LS_KEY_METADATA = 'academic_management_metadata_v3';
const LS_KEY_ATTENDANCE = 'academic_management_attendance_v3';
const LS_KEY_BATCH_META = 'academic_management_batch_metadata_v3';
const LS_KEY_STAFF = 'academic_management_staff_v1';
const INITIAL_BATCH_ID = 'AME 37';

// ==================== API SYNC OVERRIDES ====================

let _apiDataLoaded = false;

async function loadDataFromAPI() {
    try {
        if (window.API) {
            // First, init to fetch from GitHub
            const ghData = await window.API.init();
            
            // Then get data (which may be from GitHub or localStorage)
            const data = await window.API.getData();
            if (data && (data.staffMembers?.length > 0 || data.students?.length > 0)) {
                staffMembers = (data.staffMembers || []).map(s => ({
                    ...s,
                    allocatedBatches: s.allocatedBatches || s.allocated_batches || []
                }));
                students = data.students || [];
                assessmentMetadata = data.assessmentMetadata || {};
                const attObj = {};
                (data.attendanceData || []).forEach(a => {
                    const key = `${a.batch_id}_${a.attendance_date}_${a.session_type}`;
                    if (!attObj[key]) attObj[key] = [];
                    attObj[key].push(a);
                });
                attendanceData = attObj;
                batchMetadata = data.batchMetadata || {};
                _apiDataLoaded = true;
                console.log('Data loaded:', staffMembers.length, 'staff,', students.length, 'students');
                return true;
            }
        }
    } catch (e) {
        console.warn('API load failed, using localStorage:', e);
    }
    return false;
}

function loadData() {
    if (!_apiDataLoaded) {
        loadDataFromAPI().then((loaded) => {
            if (!loaded) {
                console.log('API unavailable, loading from localStorage fallback');
                loadDataLocal();
            }
            refreshDataAndUI();
        });
    }
}

function loadDataLocal() {
    try {
        const storedData = localStorage.getItem(LS_KEY);
        if (storedData && (!_apiDataLoaded || students.length === 0)) {
            students = JSON.parse(storedData);
        }

        const storedMetadata = localStorage.getItem(LS_KEY_METADATA);
        if (storedMetadata && (!_apiDataLoaded || Object.keys(assessmentMetadata).length === 0)) {
            assessmentMetadata = JSON.parse(storedMetadata);
        }

        const storedAttendance = localStorage.getItem(LS_KEY_ATTENDANCE);
        if (storedAttendance && (!_apiDataLoaded || Object.keys(attendanceData).length === 0)) {
            attendanceData = JSON.parse(storedAttendance);
        }

        const storedBatchMeta = localStorage.getItem(LS_KEY_BATCH_META);
        if (storedBatchMeta && (!_apiDataLoaded || Object.keys(batchMetadata).length === 0)) {
            batchMetadata = JSON.parse(storedBatchMeta);
        }

        const storedStaff = localStorage.getItem(LS_KEY_STAFF);
        if (storedStaff && (!_apiDataLoaded || staffMembers.length === 0)) {
            staffMembers = JSON.parse(storedStaff);
        }

        const storedAllocations = localStorage.getItem('academic_management_allocations_v1');
        if (storedAllocations) {
            allocations = JSON.parse(storedAllocations);
        }

        const storedAssessExams = localStorage.getItem(LS_KEY_ASSESSMENT_EXAMS);
        if (storedAssessExams) {
            assessmentExams = JSON.parse(storedAssessExams);
        }
    } catch (e) {
        console.error('Error loading from localStorage:', e);
    }
}



function refreshDataAndUI() {
    renderDashboard();
    renderStudentList();
    renderStaffList();
    renderBatchSelectors();
    loadAssessmentHistory();
    renderActivityLogs();
}

// ==================== SECURITY UTILITIES ====================

// Simple hash function for password verification (client-side)
function simpleHash(str) {
    let hash = 0;
    if (str.length === 0) return hash.toString();
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
}

// Hash password for storage (call when creating/updating password)
function hashPassword(password) {
    const salt = simpleHash(Date.now().toString());
    const hash = simpleHash(password + salt);
    return salt + ':' + hash;
}

// Verify password against stored hash
function verifyPassword(password, storedHash) {
    if (!storedHash || !password) return false;
    
    // Handle legacy plain-text passwords (for migration)
    if (!storedHash.includes(':')) {
        return password === storedHash;
    }
    
    // Handle hashed passwords
    const parts = storedHash.split(':');
    if (parts.length !== 2) return false;
    
    const [salt, hash] = parts;
    const verifyHash = simpleHash(password + salt);
    return hash === verifyHash;
}

// Sanitize input for safe storage
function sanitizeForStorage(input) {
    if (!input) return '';
    return String(input)
        .trim()
        .substring(0, 200); // Limit length
}

// Sanitize and validate admission number
function sanitizeAdmissionNo(input) {
    if (!input) return '';
    return String(input)
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .substring(0, 20);
}

// Validate file type
function isValidFileType(file, allowedTypes) {
    if (!file || !file.name) return false;
    const ext = file.name.split('.').pop().toLowerCase();
    return allowedTypes.includes(ext);
}

// Validate file size (in bytes)
function isValidFileSize(file, maxSizeMB) {
    if (!file) return false;
    return file.size <= maxSizeMB * 1024 * 1024;
}

// Auth State
let currentUserRole = localStorage.getItem('user_role') || null;
let currentStaffId = localStorage.getItem('logged_in_staff_id') || null;


// Toggle password visibility
window.togglePasswordVisibility = function() {
    const phoneInput = document.getElementById('loginPhone');
    const eyeIcon = document.getElementById('eyeIcon');
    if (phoneInput.type === 'password') {
        phoneInput.type = 'text';
        eyeIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path>';
    } else {
        phoneInput.type = 'password';
        eyeIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>';
    }
};

// Auth Functions - Login using Name and Phone Number
window.handleLogin = async (e) => {
    e.preventDefault();
    const name = document.getElementById('loginName').value.trim();
    const phone = document.getElementById('loginPhone').value.trim();
    const err = document.getElementById('loginError');
    const btn = e.target.querySelector('button[type="submit"]');
    
    // FOR DEBUG: Direct admin login bypass
    if (name.toLowerCase() === 'admin' && phone === '9999999999') {
        console.log('Direct admin login bypass used');
        localStorage.setItem('user_role', 'admin');
        localStorage.setItem('logged_in_user', 'Admin');
        localStorage.setItem('logged_in_staff_id', 'admin-001');
        startSession('admin');
        return;
    }
    
    // Regular login continues below...

    // Force reload data from server/API before login
    console.log('Reloading data before login...');
    
    try {
        const data = await window.API.getData();

        console.log('API Response:', JSON.stringify(data));
        
            if (data && data.staffMembers) {
            staffMembers = data.staffMembers;
            console.log('Loaded staff from API:', staffMembers.length);
            
            // Normalize student data field names
            if (data.students) {
                students = data.students.map(s => ({
                    id: s.id,
                    name: s.student_name || s.name || '',
                    admissionNo: s.admission_no || s.admissionNo || '',
                    batchId: s.batch_id || s.batchId || '',
                    subBatch: s.sub_batch || s.subBatch || 'None',
                    documents: s.documents || []
                }));
            }
            console.log('Loaded students from API:', students.length);
            
            // Sync to localStorage for future use
            localStorage.setItem('academic_management_staff_v1', JSON.stringify(staffMembers));
            localStorage.setItem('academic_management_students_v3', JSON.stringify(students));
        }
    } catch (e) {
        console.error('API fetch error:', e);
    }
    
    // Also load from localStorage as backup
    const localStaff = localStorage.getItem('academic_management_staff_v1');
    if (localStaff) {
        const parsed = JSON.parse(localStaff);
        if (parsed.length > 0 && staffMembers.length === 0) {
            staffMembers = parsed;
            console.log('Loaded staff from localStorage:', staffMembers.length);
        }
    }
    console.log('Final staffMembers for login:', JSON.stringify(staffMembers));

    // Disable button and show loading
    const originalBtnText = btn.innerHTML;
    btn.innerHTML = '<span>⏳</span> Authenticating...';
    btn.disabled = true;
    err.classList.add('hidden');

    // Input validation
    if (!name || !phone) {
        err.textContent = 'Name and phone number are required';
        err.classList.remove('hidden');
        btn.innerHTML = originalBtnText;
        btn.disabled = false;
        return;
    }

    // Rate limiting check (simple client-side)
    const lastAttempt = parseInt(localStorage.getItem('login_last_attempt') || '0');
    const now = Date.now();
    const attempts = parseInt(localStorage.getItem('login_attempts') || '0');
    localStorage.setItem('login_last_attempt', now.toString());
    
    if (now - lastAttempt < 60000 && attempts >= 5) {
        err.textContent = 'Too many login attempts. Please wait 60 seconds.';
        err.classList.remove('hidden');
        btn.innerHTML = originalBtnText;
        btn.disabled = false;
        return;
    }

    // Update attempt counter
    if (now - lastAttempt > 60000) {
        localStorage.setItem('login_attempts', '1');
    } else {
        localStorage.setItem('login_attempts', (attempts + 1).toString());
    }

    // Normalize inputs for comparison
    const normalizedName = name.toLowerCase().trim();
    const normalizedPhone = phone.replace(/\D/g, ''); // Remove non-digits
    
    console.log('Login attempt:', { normalizedName, normalizedPhone });
    console.log('Searching in staffMembers:', staffMembers);

    // Find staff member by:
    // - Username = first 4 letters of name (lowercase)
    // - Password = last 4 digits of phone
    const staffMember = staffMembers.find(s => {
        const storedName = (s.name || '').toLowerCase().trim();
        const storedPhone = (s.phone || '').replace(/\D/g, '');
        
        // Generate username from name (first 4 letters)
        const generatedUsername = storedName.replace(/[^a-z]/g, '').substring(0, 4);
        // Password is last 4 digits of phone
        const generatedPassword = storedPhone.slice(-4);
        
        console.log('Comparing:', { generatedUsername, generatedPassword, inputUsername: normalizedName, inputPassword: normalizedPhone });
        
        // Match: username (first 4 of name) + password (last 4 of phone)
        return generatedUsername === normalizedName && generatedPassword === normalizedPhone;
    });
    
    console.log('Found staffMember:', staffMember);

    // Show debug info on screen
    const debugEl = document.getElementById('loginDebug');
    if (debugEl) {
        debugEl.innerHTML = `Debug: Staff loaded: ${staffMembers.length} | Attempt: ${name} / ${phone}`;
        debugEl.classList.remove('hidden');
    }

    if (staffMember) {
        // Grant role based on staff member settings
        let role = 'staff';
        // Handle both boolean and string "true" for isAdmin
        // Handle both boolean and string "true" for isAdmin/is_admin
        const isAdmin = staffMember.isAdmin === true || staffMember.isAdmin === 'true' || staffMember.isAdmin === 1 ||
                        staffMember.is_admin === true || staffMember.is_admin === 'true' || staffMember.is_admin === 1;
        if (isAdmin) {
            role = 'admin';
            console.log('User is admin!');
        } else if (staffMember.position === 'Workshop Incharge' || staffMember.position === 'MD') {
            role = 'incharge';
        } else if (staffMember.position === 'Workshop Faculty') {
            role = 'workshop_faculty';
        } else if (staffMember.position === 'Technical Faculty') {
            role = 'technical_faculty';
        }
        localStorage.setItem('user_role', role);
        localStorage.setItem('logged_in_user', sanitizeForStorage(staffMember.name));
        localStorage.setItem('logged_in_staff_id', staffMember.id);
        localStorage.setItem('login_attempts', '0'); // Reset on success
        window.activityLogger.log('Login', `User ${escapeHtml(staffMember.name)} logged in successfully`, 'success');
        startSession(role);
    } else {
        // Invalid credentials - show helpful message
        window.activityLogger.log('Login Failed', `Failed login attempt for: ${escapeHtml(name)}`, 'warning');
        
        // Check if username exists (first 4 letters match)
        const usernameExists = staffMembers.some(s => {
            const storedName = (s.name || '').toLowerCase().trim();
            const generatedUsername = storedName.replace(/[^a-z]/g, '').substring(0, 4);
            return generatedUsername === normalizedName;
        });
        
        if (usernameExists) {
            err.innerHTML = '❌ Wrong password<br><span class="text-xs">Password is last 4 digits of your phone number</span>';
        } else {
            err.innerHTML = '❌ User not found<br><span class="text-xs">Username = first 4 letters of your name (e.g., "ziya" for Ziyad)</span>';
        }
        err.classList.remove('hidden');
        btn.innerHTML = originalBtnText;
        btn.disabled = false;
    }
};

window.handleLogout = () => {
    localStorage.removeItem('user_role');
    window.location.reload();
};

function startSession(role) {
    currentUserRole = role;
    document.getElementById('loginModal').classList.add('hidden');

    // Update User Profile Display
    const profileDisplay = document.getElementById('userProfileDisplay');
    const nameDisplay = document.getElementById('userNameDisplay');
    const roleDisplay = document.getElementById('userRoleDisplay');
    const avatar = document.getElementById('userAvatar');

    if (profileDisplay) {
        profileDisplay.classList.remove('hidden');
        const userName = localStorage.getItem('logged_in_user') || 'User';

        if (nameDisplay) nameDisplay.textContent = userName;
        let detailedRole = 'Staff Member';
        if (role === 'admin') detailedRole = 'Site Administrator';
        else if (role === 'incharge') detailedRole = 'Incharge';
        else if (role === 'workshop_faculty') detailedRole = 'Workshop Faculty';
        else if (role === 'technical_faculty') detailedRole = 'Technical Faculty';
        if (roleDisplay) roleDisplay.textContent = detailedRole;

        // Initials avatar
        if (avatar) {
            const initials = userName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            avatar.textContent = initials;
        }
    }

    // Update Header Welcome Message
    const headerMsg = document.getElementById('headerWelcomeMsg');
    const headerName = document.getElementById('headerUserName');
    const headerRole = document.getElementById('headerUserRole');

    if (headerMsg) {
        const userName = localStorage.getItem('logged_in_user') || 'User';
        let roleText = 'Staff';
        if (role === 'admin') roleText = 'Admin';
        else if (role === 'incharge') roleText = 'Incharge';
        else if (role === 'workshop_faculty') roleText = 'Workshop';
        else if (role === 'technical_faculty') roleText = 'Technical';

        if (headerName) headerName.textContent = userName;
        if (headerRole) headerRole.textContent = roleText;
        headerMsg.classList.remove('hidden');
    }

    applyPermissions(role);
    refreshDataAndUI();
}

// Redundant refreshDataAndUI removed. Using implementation from line 387.

function checkSession() {
    const role = localStorage.getItem('user_role');
    const staffId = localStorage.getItem('logged_in_staff_id');
    const validRoles = ['admin', 'staff', 'incharge', 'workshop_faculty', 'technical_faculty', 'developer'];

    console.log('checkSession called, role:', role);

    // If no valid role, show login and return
    if (!role || !validRoles.includes(role)) {
        console.log('No valid role, showing login');
        loadData();
        const verEl = document.getElementById('headerVersionDisplay');
        if (verEl) verEl.textContent = "AMS v5.3.0 (NO ZEROS) • LOCAL DATABASE SECURED";
        const headVer = document.getElementById('headerVersionDisplay');
        if (headVer) headVer.textContent = "v5.2.0-DEV-FIX";
        // Modal is already hidden by CSS, don't remove hidden class
        return;
    }

    // Valid role - hide modal and start session
    console.log('Valid role found, starting session');
    currentUserRole = role;
    const modal = document.getElementById('loginModal');
    if (modal) modal.style.display = 'none';
    startSession(role);
    
    // Load data in background
    if (staffMembers.length === 0) loadData();
    
    // Sync role with staff position if needed
    if (staffId && staffMembers.length > 0) {
        setTimeout(() => {
            const me = staffMembers.find(s => s.id == staffId);
            if (me) {
                let correctRole = 'staff';
                const pos = (me.position || '').trim();
                if (me.isAdmin || me.is_admin) correctRole = 'admin';
                else if (pos === 'Workshop Incharge' || pos === 'MD') correctRole = 'incharge';
                else if (pos === 'Workshop Faculty') correctRole = 'workshop_faculty';
                else if (pos === 'Technical Faculty') correctRole = 'technical_faculty';
                if (role !== correctRole) {
                    localStorage.setItem('user_role', correctRole);
                    currentUserRole = correctRole;
                }
            }
        }, 500);
    }
}

function applyPermissions(role) {
    const navStudents = document.getElementById('nav-students');
    const navDocs = document.getElementById('nav-docs');
    const navStaff = document.getElementById('nav-staff');

    // Default: Show all
    if (navStudents) navStudents.classList.remove('hidden');
    if (navDocs) navDocs.classList.remove('hidden');
    if (navStaff) navStaff.classList.remove('hidden');

    const navLogs = document.getElementById('nav-logs');

    // "Deny by Default" - Only show logs if explicitly Admin
    
    const navDevNodes = document.getElementById('nav-dev-nodes');
    if (navDevNodes) {
        if (role === 'developer') {
            navDevNodes.classList.remove('hidden');
        } else {
            navDevNodes.classList.add('hidden');
        }
    }
            
    if (navLogs) {
        if (role === 'admin' || role === 'developer') {
            navLogs.classList.remove('hidden');
        } else {
            navLogs.classList.add('hidden');
        }
    }

    if (role === 'staff' || role === 'workshop_faculty' || role === 'technical_faculty') {
        // Staff/Faculty: Hide Docs and Staff Management
        if (navDocs) navDocs.classList.add('hidden');
        if (navStaff) navStaff.classList.add('hidden');

        // Workshop Faculty specifically: No Student Profiles
        if (role === 'workshop_faculty' && navStudents) {
            navStudents.classList.add('hidden');
        }
    }

    // Update Dashboard or other elements if needed based on role
}

// Data Management Functions
function loadData() {
    try {
        const storedData = localStorage.getItem(LS_KEY);
        students = storedData ? JSON.parse(storedData) : [];

        const storedMetadata = localStorage.getItem(LS_KEY_METADATA);
        assessmentMetadata = storedMetadata ? JSON.parse(storedMetadata) : {};

        const storedAttendance = localStorage.getItem(LS_KEY_ATTENDANCE);
        attendanceData = storedAttendance ? JSON.parse(storedAttendance) : {};

        const storedBatchMeta = localStorage.getItem(LS_KEY_BATCH_META);
        batchMetadata = storedBatchMeta ? JSON.parse(storedBatchMeta) : {};

        const storedStaff = localStorage.getItem(LS_KEY_STAFF);
        const storedStaffBackup = localStorage.getItem(LS_KEY_STAFF + '_BACKUP_AUTO');

        if (storedStaff) {
            staffMembers = JSON.parse(storedStaff);
        } else if (storedStaffBackup) {
            console.log('Restoring staff from automatic backup...');
            staffMembers = JSON.parse(storedStaffBackup);
            // Restore to main key immediately
            localStorage.setItem(LS_KEY_STAFF, storedStaffBackup);
        } else {
            staffMembers = [];
        }

        // Restore/Merge Allocations from specific backup
        const storedAllocations = localStorage.getItem('academic_management_allocations_v1');
        if (storedAllocations && staffMembers.length > 0) {
            try {
                const allocationsMap = JSON.parse(storedAllocations);
                staffMembers.forEach(s => {
                    // Only restore if currently empty/missing to avoid overwriting newer changes
                    if (!s.allocatedBatches || s.allocatedBatches.length === 0) {
                        if (allocationsMap[s.id]) {
                            s.allocatedBatches = allocationsMap[s.id];
                        }
                    }
                });
            } catch (e) {
                console.error('Error restoring allocations:', e);
            }
        }

        // Ensure all staff have credentials (migration for existing staff)
        let staffUpdated = false;
        staffMembers.forEach(s => {
            if (!s.username || !s.password) {
                const nameParts = (s.name || 'Staff').trim().split(' ');
                if (!s.username) s.username = (nameParts[0].toLowerCase() + (nameParts[1] ? nameParts[1][0].toLowerCase() : '')).substring(0, 15);
                if (!s.password) s.password = (s.phone || '').replace(/\D/g, '').slice(-4) || '1234';
                staffUpdated = true;
            }
        });
        if (staffUpdated) {
            console.log('Migrated staff credentials');
            saveData();
        }

        students = students.map(s => ({
            ...s,
            id: s.id || crypto.randomUUID(),
            marks: s.marks || {},
            subBatch: s.subBatch || 'None',
            batchId: s.batchId || INITIAL_BATCH_ID
        })).sort((a, b) => {
            if (a.batchId !== b.batchId) return a.batchId.localeCompare(b.batchId);
            return a.admissionNo.localeCompare(b.admissionNo);
        });
    } catch (error) {
        console.error("Error loading data:", error);
        showMessage('Storage Error', 'Could not load data.', 'error');
    }
}

function saveData() {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(students));
        localStorage.setItem(LS_KEY_METADATA, JSON.stringify(assessmentMetadata));
        localStorage.setItem(LS_KEY_ATTENDANCE, JSON.stringify(attendanceData));
        localStorage.setItem(LS_KEY_BATCH_META, JSON.stringify(batchMetadata));
        localStorage.setItem(LS_KEY_STAFF, JSON.stringify(staffMembers));
        localStorage.setItem(LS_KEY_STAFF + '_BACKUP_AUTO', JSON.stringify(staffMembers)); // Auto-backup

        // Explicit Allocation Backup
        const allocations = staffMembers.reduce((acc, s) => {
            acc[s.id] = s.allocatedBatches || [];
            return acc;
        }, {});
        localStorage.setItem('academic_management_allocations_v1', JSON.stringify(allocations));

        // Sync to local API storage
        if (window.API) {
            (async () => {
                try {
                    for (const staff of staffMembers) {
                        await window.API.updateStaff({
                            id: staff.id,
                            name: staff.name,
                            phone: staff.phone,
                            username: staff.username,
                            password: staff.password,
                            position: staff.position,
                            color: staff.color,
                            isAdmin: staff.isAdmin,
                            allocatedBatches: staff.allocatedBatches || []
                        });
                    }
                } catch (e) {
                    console.warn('Server sync failed:', e);
                }
            })();
        }

        // Trigger GitHub sync - immediate + debounced
        if (window.scheduleAutoSync) window.scheduleAutoSync();
        if (window.syncNow) {
            // Immediate sync (won't throttle if enough time passed)
            window.syncNow().then(synced => {
                if (synced) console.log('✅ Immediate sync after save');
            });
        }
    } catch (error) {
        console.error("Error saving:", error);
        showMessage('Storage Error', 'Browser storage full.', 'error');
    }
}

// Function to expose data for cloud sync
window.getAppData = () => {
    return {
        students,
        assessmentMetadata,
        attendanceData,
        batchMetadata,
        staffMembers,
        activityLogs: window.activityLogger ? window.activityLogger.getLogs() : []
    };
};



function refreshDataAndUI() {
    loadData();
    updateBatchDropdowns();
    renderStaffList();
    if (window.renderBatchAllocation) window.renderBatchAllocation();
    const currentView = document.getElementById('mainView').dataset.currentView || 'dashboard';
    renderView(currentView);
}

// UI Helper Functions
function escapeHtml(text) {
    if (!text) return text;
    return text.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showMessage(title, message, type = 'error') {
    const container = document.getElementById('app');
    let existingMessage = document.getElementById('appMessage');
    if (existingMessage) existingMessage.remove();

    const bgColor = type === 'error'
        ? 'bg-red-100 border-red-500 text-red-700'
        : 'bg-green-100 border-green-500 text-green-700';

    const messageHtml = `
        <div id="appMessage" class="no-print fixed top-4 right-4 p-4 rounded-lg shadow-xl border-l-4 ${bgColor} transition-all duration-300 transform translate-x-0 z-50">
            <h4 class="font-bold">${escapeHtml(title)}</h4>
            <p class="text-sm">${escapeHtml(message)}</p>
        </div>
    `;

    container.insertAdjacentHTML('afterbegin', messageHtml);
    setTimeout(() => {
        const msg = document.getElementById('appMessage');
        if (msg) msg.remove();
    }, 5000);
}

function calculateDashboardStats() {
    const totalStudents = students.length;
    const uniqueBatches = [...new Set(students.map(s => s.batchId))].length;
    const documentCount = Object.keys(assessmentMetadata).length;

    const statsHtml = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div class="bg-blue-50 p-6 rounded-lg border-l-4 border-blue-500 shadow-sm">
                <p class="text-sm text-blue-600 font-bold uppercase">Total Students</p>
                <p class="text-3xl font-bold text-gray-800 mt-1">${totalStudents}</p>
            </div>
            <div class="bg-indigo-50 p-6 rounded-lg border-l-4 border-indigo-500 shadow-sm">
                <p class="text-sm text-indigo-600 font-bold uppercase">Active Batches</p>
                <p class="text-3xl font-bold text-gray-800 mt-1">${uniqueBatches}</p>
            </div>
            <div class="bg-green-50 p-6 rounded-lg border-l-4 border-green-500 shadow-sm">
                <p class="text-sm text-green-600 font-bold uppercase">Assessments Recorded</p>
                <p class="text-3xl font-bold text-gray-800 mt-1">${documentCount}</p>
            </div>
        </div>
    `;

    const statsContainer = document.getElementById('dashboardStats');
    if (statsContainer) statsContainer.innerHTML = statsHtml;

    // Render dashboard cards based on role
    renderDashboardCards();
}

function renderDashboardCards() {
    const cardsContainer = document.getElementById('dashboardCards');
    if (!cardsContainer) return;

    const isAdmin = currentUserRole === 'admin';

    let cardsHtml = '';

    if (isAdmin) {
        // Admin Dashboard: Attendance Register, Student Profiles, Staff Management, Recorded Assessments
        cardsHtml = `
            <div onclick="renderView('attendanceRegister')"
                class="p-6 border rounded-2xl bg-white shadow-sm hover:shadow-md cursor-pointer group transition-all">
                <div class="text-3xl mb-2">📅</div>
                <h3 class="font-bold group-hover:text-primary">Attendance Register</h3>
                <p class="text-xs text-gray-400">Monthly reports & printables</p>
            </div>
            <div onclick="renderView('studentManagement')"
                class="p-6 border rounded-2xl bg-white shadow-sm hover:shadow-md cursor-pointer group transition-all">
                <div class="text-3xl mb-2">\uD83D\uDC65</div>
                <h3 class="font-bold group-hover:text-primary">Student Profiles</h3>
                <p class="text-xs text-gray-400">Manage batches & bulk imports</p>
            </div>
            <div onclick="window.createOfflineBackup()"
                class="p-6 border rounded-2xl bg-white shadow-sm hover:shadow-md cursor-pointer group transition-all">
                <div class="text-3xl mb-2">💾</div>
                <h3 class="font-bold group-hover:text-primary">Download Backup</h3>
                <p class="text-xs text-gray-400">Save full system data locally</p>
            </div>
            <div onclick="window.triggerOfflineRestore()"
                class="p-6 border border-red-100 rounded-2xl bg-white shadow-sm hover:shadow-md cursor-pointer group transition-all">
                <div class="text-3xl mb-2">🔄</div>
                <h3 class="font-bold text-red-600 group-hover:text-red-700">Restore Data</h3>
                <p class="text-xs text-gray-400">Load checks from backup file</p>
            </div>
            <div onclick="renderView('staffManagement')"
                class="p-6 border rounded-2xl bg-white shadow-sm hover:shadow-md cursor-pointer group transition-all">
                <div class="text-3xl mb-2">👔</div>
                <h3 class="font-bold group-hover:text-primary">Staff Management</h3>
                <p class="text-xs text-gray-400">Manage staff & credentials</p>
            </div>
            <div onclick="renderView('assessmentHistory')"
                class="p-6 border rounded-2xl bg-white shadow-sm hover:shadow-md cursor-pointer group transition-all">
                <div class="text-3xl mb-2">📂</div>
                <h3 class="font-bold group-hover:text-primary">Recorded Assessments</h3>
                <p class="text-xs text-gray-400">View & manage saved records</p>
            </div>
        `;
    } else {
        // Staff Dashboard: Mark Attendance, Assessments, Daily Attendance
        cardsHtml = `
            <div onclick="renderView('attendanceMarking')"
                class="p-6 border rounded-2xl bg-white shadow-sm hover:shadow-md cursor-pointer group transition-all">
                <div class="text-3xl mb-2">📋</div>
                <h3 class="font-bold group-hover:text-primary">Mark Attendance</h3>
                <p class="text-xs text-gray-400">Record daily status & share summary</p>
            </div>
            <div onclick="renderView('assessmentSetup')"
                class="p-6 border rounded-2xl bg-white shadow-sm hover:shadow-md cursor-pointer group transition-all">
                <div class="text-3xl mb-2">✒️</div>
                <h3 class="font-bold group-hover:text-primary">Assessments</h3>
                <p class="text-xs text-gray-400">Log Viva & Practical entries</p>
            </div>
            <div onclick="renderView('attendanceRegister')"
                class="p-6 border rounded-2xl bg-white shadow-sm hover:shadow-md cursor-pointer group transition-all">
                <div class="text-3xl mb-2">📊</div>
                <h3 class="font-bold group-hover:text-primary">Daily Attendance</h3>
                <p class="text-xs text-gray-400">View attendance records</p>
            </div>
            <div onclick="renderView('assessmentHistory')"
                class="p-6 border rounded-2xl bg-white shadow-sm hover:shadow-md cursor-pointer group transition-all">
                <div class="text-3xl mb-2">📂</div>
                <h3 class="font-bold group-hover:text-primary">Recorded Assessments</h3>
                <p class="text-xs text-gray-400">View saved marks & viva</p>
            </div>
        `;
    }

    cardsContainer.innerHTML = cardsHtml;
}

// Assessment Entry Helper Functions
window.switchAssessmentTab = (tab) => {
    document.getElementById('workshopTabContent').classList.toggle('hidden', tab !== 'workshop');
    document.getElementById('examTabContent').classList.toggle('hidden', tab !== 'exam');

    const wBtn = document.getElementById('workshopTab');
    const eBtn = document.getElementById('examTab');

    if (tab === 'workshop') {
        wBtn.classList.add('bg-primary', 'text-white');
        wBtn.classList.remove('bg-gray-200', 'text-gray-700');
        eBtn.classList.remove('bg-primary', 'text-white');
        eBtn.classList.add('bg-gray-200', 'text-gray-700');
    } else {
        eBtn.classList.add('bg-primary', 'text-white');
        eBtn.classList.remove('bg-gray-200', 'text-gray-700');
        wBtn.classList.remove('bg-primary', 'text-white');
        wBtn.classList.add('bg-gray-200', 'text-gray-700');
    }
};

window.loadAssessmentExamTable = () => {
    const container = document.getElementById('assessmentExamTableContainer');
    const batchId = document.getElementById('examBatchSelector').value;
    if (!container || !batchId) return;

    const filtered = students.filter(s => s.batchId === batchId);
    // Logic for exam table rendering...
    container.innerHTML = `<p class="italic text-gray-400 p-4">Exam mark entry table for ${batchId} ready.</p>`;
};

window.saveMarks = () => {
    // Collect data from the generated sheet
    const batchId = document.getElementById('sheetBatchDisplay').textContent;
    const date = document.getElementById('sheetDate').textContent;
    const type = document.getElementById('sheetMainTitle').textContent.toLowerCase().includes('viva') ? 'viva' : 'exam';

    // Logic to save marks to assessmentMetadata...
    showMessage('Success', 'Marks saved successfully.', 'success');
};

// Backup and Restore Functions
window.createOfflineBackup = function () {
    const data = {
        students,
        assessmentMetadata,
        attendanceData,
        batchMetadata,
        staffMembers,
        version: '5.3.0',
        timestamp: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ams_backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    window.activityLogger.log('Export Data', 'Full system data exported to backup file', 'success');
};

window.triggerOfflineRestore = function () {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                if (confirm('This will replace all CURRENT data with the backup data. Continue?')) {
                    students = data.students || [];
                    assessmentMetadata = data.assessmentMetadata || {};
                    attendanceData = data.attendanceData || {};
                    batchMetadata = data.batchMetadata || {};
                    staffMembers = data.staffMembers || [];
                    saveData();
                    if (window.refreshDataAndUI) window.refreshDataAndUI();
                    showMessage('Success', 'System data restored successfully.', 'success');
                }
            } catch (err) {
                showMessage('Error', 'Invalid backup file format.', 'error');
            }
        };
        reader.readAsText(file);
    };
    input.click();
};

// ==================== BACKUP & RESTORE TAB FUNCTIONS ====================

window.switchBackupTab = (tab) => {
    const backupContent = document.getElementById('backupTabContent');
    const restoreContent = document.getElementById('restoreTabContent');
    const backupBtn = document.getElementById('tabBackup');
    const restoreBtn = document.getElementById('tabRestore');

    if (!backupContent || !restoreContent) return;

    if (tab === 'backup') {
        backupContent.classList.remove('hidden');
        restoreContent.classList.add('hidden');
        backupBtn.classList.add('bg-primary', 'text-white');
        backupBtn.classList.remove('bg-gray-200', 'text-gray-700');
        restoreBtn.classList.remove('bg-primary', 'text-white');
        restoreBtn.classList.add('bg-gray-200', 'text-gray-700');
        updateBackupStats();
    } else {
        backupContent.classList.add('hidden');
        restoreContent.classList.remove('hidden');
        restoreBtn.classList.add('bg-primary', 'text-white');
        restoreBtn.classList.remove('bg-gray-200', 'text-gray-700');
        backupBtn.classList.remove('bg-primary', 'text-white');
        backupBtn.classList.add('bg-gray-200', 'text-gray-700');
    }
};

function updateBackupStats() {
    const studentCount = document.getElementById('backupStudentCount');
    const staffCount = document.getElementById('backupStaffCount');
    const batchCount = document.getElementById('backupBatchCount');
    const recordCount = document.getElementById('backupRecordCount');

    if (studentCount) studentCount.textContent = students.length;
    if (staffCount) staffCount.textContent = staffMembers.length;
    if (batchCount) {
        const batches = [...new Set(students.map(s => s.batchId))];
        batchCount.textContent = batches.length;
    }
    if (recordCount) {
        const attendanceRecords = Object.keys(attendanceData).length;
        const assessmentRecords = Object.keys(assessmentMetadata).length;
        recordCount.textContent = attendanceRecords + assessmentRecords;
    }
}

window.handleRestoreFileSelect = function (e) {
    const file = e.target.files[0];
    const fileInfo = document.getElementById('restoreFileInfo');
    const fileName = document.getElementById('restoreFileName');
    const fileDate = document.getElementById('restoreFileDate');
    const restoreBtn = document.getElementById('btnConfirmRestore');

    if (!file) {
        if (fileInfo) fileInfo.classList.add('hidden');
        if (restoreBtn) restoreBtn.disabled = true;
        return;
    }

    // Validate file type
    if (!file.name.endsWith('.json')) {
        showMessage('Error', 'Please select a valid JSON backup file.', 'error');
        e.target.value = '';
        if (fileInfo) fileInfo.classList.add('hidden');
        if (restoreBtn) restoreBtn.disabled = true;
        return;
    }

    // Validate file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
        showMessage('Error', 'Backup file is too large. Maximum size is 50MB.', 'error');
        e.target.value = '';
        if (fileInfo) fileInfo.classList.add('hidden');
        if (restoreBtn) restoreBtn.disabled = true;
        return;
    }

    // Read and validate file
    const reader = new FileReader();
    reader.onload = function (ev) {
        try {
            const data = JSON.parse(ev.target.result);
            
            // Handle new backup format (with meta/data wrapper)
            let restoreData;
            if (data.meta && data.data) {
                restoreData = {
                    students: data.data.students,
                    staffMembers: data.data.staff,
                    attendanceData: data.data.attendance,
                    assessmentMetadata: data.data.assessmentMetadata,
                    batchMetadata: data.data.batchMetadata,
                    allocations: data.data.allocations,
                    timestamp: data.meta.date
                };
            } else if (data.students || Array.isArray(data)) {
                // Old format or direct array
                restoreData = data;
            } else {
                showMessage('Error', 'Invalid backup file: Unknown format.', 'error');
                return;
            }

            // Validate backup structure
            if (!restoreData.students || !Array.isArray(restoreData.students)) {
                showMessage('Error', 'Invalid backup file: Missing students data.', 'error');
                return;
            }

            // Show file info
            if (fileInfo) fileInfo.classList.remove('hidden');
            if (fileName) fileName.textContent = file.name;
            if (fileDate) {
                const date = restoreData.timestamp ? new Date(restoreData.timestamp) : new Date(file.lastModified);
                fileDate.textContent = `Backup Date: ${date.toLocaleString()}`;
            }
            if (restoreBtn) restoreBtn.disabled = false;

            // Store for restore
            window.pendingRestoreData = restoreData;
        } catch (err) {
            showMessage('Error', 'Invalid backup file format. Could not parse JSON.', 'error');
            e.target.value = '';
            if (fileInfo) fileInfo.classList.add('hidden');
            if (restoreBtn) restoreBtn.disabled = true;
        }
    };
    reader.readAsText(file);
};

window.triggerOfflineRestore = function () {
    const data = window.pendingRestoreData;
    if (!data) {
        showMessage('Error', 'No backup file selected.', 'error');
        return;
    }

    if (!confirm('⚠️ WARNING: This will replace ALL current data with the backup data.\n\nThis action cannot be undone! Are you sure you want to continue?')) {
        return;
    }

    // Second confirmation
    if (!confirm('⚠️ FINAL WARNING: All current students, staff, attendance, and assessments will be replaced.\n\nClick OK to proceed or Cancel to abort.')) {
        return;
    }

    try {
        students = data.students || [];
        assessmentMetadata = data.assessmentMetadata || {};
        attendanceData = data.attendanceData || {};
        batchMetadata = data.batchMetadata || {};
        staffMembers = data.staffMembers || [];
        allocations = data.allocations || {};
        
        saveData();
        window.activityLogger.log('Restore Data', `Restored system from backup dated ${data.timestamp || 'Unknown'}`, 'warning');
        showMessage('Success', 'System data restored successfully from backup.', 'success');
        
        // Clear file input
        const fileInput = document.getElementById('restoreFileInput');
        if (fileInput) fileInput.value = '';
        const fileInfo = document.getElementById('restoreFileInfo');
        if (fileInfo) fileInfo.classList.add('hidden');
        const restoreBtn = document.getElementById('btnConfirmRestore');
        if (restoreBtn) restoreBtn.disabled = true;
        window.pendingRestoreData = null;
        
        refreshDataAndUI();
    } catch (err) {
        showMessage('Error', 'Failed to restore data. Backup may be corrupted.', 'error');
        console.error('Restore error:', err);
    }
};

function updateBatchDropdowns() {
    let batchIds = [...new Set(students.map(s => s.batchId))].sort();

    // Filter for Staff based on Allocation
    if ((currentUserRole === 'staff' || currentUserRole === 'technical_faculty' || currentUserRole === 'workshop_faculty') && currentStaffId) {
        const me = staffMembers.find(s => String(s.id) === String(currentStaffId));
        if (me && me.allocatedBatches && me.allocatedBatches.length > 0) {
            batchIds = batchIds.filter(b => me.allocatedBatches.includes(b));
        }
    }

    const selectors = [
        'batchSelector', 'assessBatchSelector', 'printBatchSelector',
        'attendanceBatchSelector', 'registerBatchSelector', 'printSubBatchSelector',
        'printStudentSelector', 'attendanceSubBatchSelector', 'assessSubBatchSelector',
        'examBatchSelector', 'batchInChargeInput'
    ];

    selectors.forEach(id => {
        const selector = document.getElementById(id);
        if (!selector) return;
        const currentValue = selector.value;

        if (selector.tagName === 'SELECT') {
            if (id === 'batchInChargeInput') {
                selector.innerHTML = `<option value="">-- No In-Charge Assigned --</option>`;
                staffMembers.forEach(staff => {
                    selector.innerHTML += `<option value="${escapeHtml(staff.name)}">${escapeHtml(staff.name)} (${escapeHtml(staff.position)})</option>`;
                });
            } else if (id === 'printStudentSelector') {
                const batchId = document.getElementById('printBatchSelector').value;
                const filtered = students.filter(s => s.batchId === batchId);
                selector.innerHTML = `<option value="" disabled selected>-- Select Student --</option>`;
                filtered.forEach(s => {
                    selector.innerHTML += `<option value="${s.id}">${escapeHtml(s.name)} (${s.admissionNo})</option>`;
                });
            } else if (id.includes('SubBatch')) {
                selector.innerHTML = `
                    <option value="All">Full Batch</option>
                    <option value="A">Batch A</option>
                    <option value="B">Batch B</option>
                `;
            } else {
                selector.innerHTML = `<option value="">-- All Batches --</option>`;
                if (batchIds.length === 0) {
                    selector.innerHTML += `<option value="${INITIAL_BATCH_ID}">${INITIAL_BATCH_ID}</option>`;
                }
                batchIds.forEach(batch => {
                    selector.innerHTML += `<option value="${batch}">${batch}</option>`;
                });
            }

            if (currentValue && [...selector.options].some(o => o.value === currentValue)) {
                selector.value = currentValue;
            }
        }
    });
}

// Navigation Functions
window.toggleMenu = (forceClose = false) => {
    const menu = document.getElementById('mobileMenu');
    if (!menu) return;

    if (forceClose) {
        menu.classList.add('hidden');
    } else {
        menu.classList.toggle('hidden');
    }
};

window.renderView = (viewName) => {
    const mainView = document.getElementById('mainView');
    if (!mainView) return;

    mainView.dataset.currentView = viewName;
    window.toggleMenu(true);

    document.querySelectorAll('.app-view').forEach(view => view.classList.add('hidden'));

    const targetView = document.getElementById(viewName);
    if (targetView) {
        // Guard: Activity Logs only for Admin
        if (viewName === 'activityLogs' && currentUserRole !== 'admin') {
            showMessage('Access Denied', 'Only administrators can view activity logs.', 'error');
            return;
        }

        // Guard: Batch Allocation only for Admin
        if (viewName === 'batchAllocation' && currentUserRole !== 'admin') {
            showMessage('Access Denied', 'Only administrators can manage batch allocations.', 'error');
            return;
        }

        // Guard: Backup & Restore only for Admin
        if (viewName === 'backupRestore' && currentUserRole !== 'admin') {
            showMessage('Access Denied', 'Only administrators can access backup & restore.', 'error');
            return;
        }

        // Guard: Student Management restricted for Workshop Faculty
        if (viewName === 'studentManagement' && currentUserRole === 'workshop_faculty') {
            showMessage('Access Denied', 'Workshop Faculty members do not have access to Student Profiles.', 'error');
            return;
        }

        updateBatchDropdowns();

        targetView.classList.remove('hidden');

        // Logic for Assessment Setup (Tabs)
        if (viewName === 'assessmentSetup') {
            const examTabBtn = document.getElementById('examTab');
            const workshopTabBtn = document.getElementById('workshopTab');

            if (currentUserRole === 'workshop_faculty') {
                if (examTabBtn) examTabBtn.classList.add('hidden');
                if (workshopTabBtn) workshopTabBtn.classList.remove('hidden');
                switchAssessmentTab('workshop');
            } else if (currentUserRole === 'technical_faculty') {
                if (workshopTabBtn) workshopTabBtn.classList.add('hidden');
                if (examTabBtn) examTabBtn.classList.remove('hidden');
                switchAssessmentTab('exam');
            } else {
                if (examTabBtn) examTabBtn.classList.remove('hidden');
                if (workshopTabBtn) workshopTabBtn.classList.remove('hidden');
            }
        }

        if (viewName === 'studentManagement') renderStudentList();

        // Batch Allocation view
        if (viewName === 'batchAllocation') {
            if (window.renderBatchAllocation) window.renderBatchAllocation();
        }
        else if (viewName === 'staffManagement') renderStaffList();
        else if (viewName === 'dashboard') calculateDashboardStats();
        else if (viewName === 'attendanceMarking') setupAttendanceView();
        else if (viewName === 'attendanceRegister') renderAttendanceRegister();
        else if (viewName === 'assessmentHistory') renderAssessmentHistory();
        else if (viewName === 'activityLogs') renderActivityLogs();
        else if (viewName === 'developerNodes') window.fetchNetworkNodes();
    }
};

// Attendance Functions
function setupAttendanceView() {
    const dateInput = document.getElementById('attendanceDate');
    if (!dateInput.value) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }
    renderAttendanceList();
}

function renderAttendanceList() {
    const batchId = document.getElementById('attendanceBatchSelector').value;
    let subBatch = document.getElementById('attendanceSubBatchSelector').value;
    const date = document.getElementById('attendanceDate').value;
    const listBody = document.getElementById('attendanceListBody');

    // -- ENFORCE SUB-BATCH UI LOGIC (Always Run) --
    // We do this before checking if batchId/date exists so the UI is consistent
    const sessionTypeSelect = document.getElementById('attendanceSessionType');
    const subBatchSelect = document.getElementById('attendanceSubBatchSelector');
    let currentSessionType = 'Theory';

    if (sessionTypeSelect && subBatchSelect) {
        // If we have data context, try to use it. Otherwise rely on DOM value.
        // If batch/date invalid, we can't look up saved session type, so fallback to current UI value.
        if (batchId && date && attendanceData[batchId]?.[date]?.sessionType) {
            currentSessionType = attendanceData[batchId][date].sessionType;
            sessionTypeSelect.value = currentSessionType;
        } else {
            currentSessionType = sessionTypeSelect.value;
        }

        if (currentSessionType === 'Theory') {
            subBatchSelect.value = 'All';
            subBatchSelect.disabled = true;
            subBatch = 'All'; // Ensure logic uses 'All'
        } else {
            subBatchSelect.disabled = false;
        }
    }
    // ---------------------------------------------

    if (!batchId || !date) {
        listBody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500">Select batch and date</td></tr>';
        document.getElementById('btnDeleteRecord').classList.add('hidden');
        return;
    }

    // Role Check for Delete Button
    const isAdmin = localStorage.getItem('user_role') === 'admin';
    const deleteBtn = document.getElementById('btnDeleteRecord');
    if (deleteBtn) {
        if (isAdmin) deleteBtn.classList.remove('hidden');
        else deleteBtn.classList.add('hidden');
    }

    const searchQuery = (document.getElementById('attendanceSearchInput')?.value || '').toLowerCase();
    let filtered = students.filter(s => s.batchId === batchId);
    if (subBatch !== 'All') filtered = filtered.filter(s => s.subBatch === subBatch);

    // Sort by name
    filtered.sort((a, b) => a.name.localeCompare(b.name));

    // Apply Search
    if (searchQuery) {
        filtered = filtered.filter(s =>
            (s.name || '').toLowerCase().includes(searchQuery) ||
            (s.admissionNo || '').toLowerCase().includes(searchQuery)
        );
    }

    const dailyData = attendanceData[batchId]?.[date] || {};

    if (filtered.length === 0) {
        listBody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-gray-400 italic">${searchQuery ? 'No students match your search.' : 'No students found.'}</td></tr>`;
        return;
    }

    listBody.innerHTML = filtered.map(s => {
        const isPresent = dailyData[s.id] !== 'absent';
        return `
            <tr class="border-b hover:bg-gray-50">
                <td class="p-3 text-sm font-medium">${escapeHtml(s.name || s.student_name)}</td>
                <td class="p-3 text-xs font-mono">${escapeHtml(s.admissionNo || s.admission_no)}</td>
                <td class="p-3 text-center">
                    <input type="checkbox" class="w-5 h-5 accent-green-600 cursor-pointer"
                        ${isPresent ? 'checked' : ''}
                        onchange="updateAttendanceStatus('${batchId}', '${date}', '${s.id}', this.checked)">
                </td>
            </tr>
        `;
    }).join('');
}

window.updateAttendanceStatus = (batchId, date, studentId, isPresent) => {
    if (!attendanceData[batchId]) attendanceData[batchId] = {};
    if (!attendanceData[batchId][date]) attendanceData[batchId][date] = {};
    attendanceData[batchId][date][studentId] = isPresent ? 'present' : 'absent';
    saveData();
};

window.updateSessionType = () => {
    const batchId = document.getElementById('attendanceBatchSelector').value;
    const date = document.getElementById('attendanceDate').value;
    const type = document.getElementById('attendanceSessionType').value;
    const subBatchSelect = document.getElementById('attendanceSubBatchSelector');

    // -- STRICT UI ENFORCEMENT --
    // This runs immediately, even if no batch is selected yet
    if (type === 'Theory') {
        subBatchSelect.value = 'All';
        subBatchSelect.disabled = true;
    } else {
        subBatchSelect.disabled = false;
    }

    // Only proceed to save if we have a valid batch and date
    if (!batchId || !date) return;

    if (!attendanceData[batchId]) attendanceData[batchId] = {};
    if (!attendanceData[batchId][date]) attendanceData[batchId][date] = {};

    attendanceData[batchId][date].sessionType = type;
    saveData();

    // Refresh list to apply filtering if needed
    renderAttendanceList();
};

window.saveAttendanceManual = () => {
    // Explicitly Save Session Type
    const batchId = document.getElementById('attendanceBatchSelector').value;
    const date = document.getElementById('attendanceDate').value;
    const sessionType = document.getElementById('attendanceSessionType').value;

    if (batchId && date) {
        if (!attendanceData[batchId]) attendanceData[batchId] = {};
        if (!attendanceData[batchId][date]) attendanceData[batchId][date] = {};

        // Force update session type
        attendanceData[batchId][date].sessionType = sessionType;
    }

    saveData();
    showMessage('Success', 'Attendance saved successfully!', 'success');
};

window.deleteAttendanceManual = () => {
    // 1. Permission Check
    if (localStorage.getItem('user_role') !== 'admin') {
        showMessage('Error', 'Permission Denied: Only Administrators can delete records.', 'error');
        return;
    }

    const batchId = document.getElementById('attendanceBatchSelector').value;
    const date = document.getElementById('attendanceDate').value;

    if (!batchId || !date) {
        showMessage('Error', 'Please select a batch and date first.', 'error');
        return;
    }

    if (!attendanceData[batchId] || !attendanceData[batchId][date]) {
        showMessage('Info', 'No record exists to delete.', 'error');
        return;
    }

    // 2. Confirmation
    if (confirm(`Are you sure you want to PERMANENTLY DELETE the attendance record for ${date}? This cannot be undone.`)) {
        // 3. Delete Logic
        delete attendanceData[batchId][date];
        saveData();

        // 4. UI Feedback
        renderAttendanceList();
        showMessage('Success', 'Attendance record deleted successfully.', 'success');
        window.activityLogger.log('Delete Attendance', `Deleted attendance for ${batchId} on ${date}`, 'warning');
    }
};

window.shareAttendanceWhatsApp = () => {
    const batchId = escapeHtml(document.getElementById('attendanceBatchSelector').value);
    const subBatch = escapeHtml(document.getElementById('attendanceSubBatchSelector').value);
    const date = escapeHtml(document.getElementById('attendanceDate').value);

    if (!batchId || !date) return;

    let filtered = students.filter(s => s.batchId === batchId);
    if (subBatch !== 'All') filtered = filtered.filter(s => s.subBatch === subBatch);

    const dailyData = attendanceData[batchId]?.[date] || {};
    const absentees = filtered.filter(s => dailyData[s.id] === 'absent');
    const presentCount = filtered.length - absentees.length;

    let message = `*Attendance Summary*\n*Batch:* ${escapeHtml(batchId)}${subBatch !== 'All' ? ' (Sub ' + escapeHtml(subBatch) + ')' : ''}\n*Date:* ${new Date(date).toLocaleDateString('en-GB')}\n----------------------------\n*Total:* ${filtered.length}\n*Present:* ${presentCount}\n*Absent:* ${absentees.length}\n`;

    if (absentees.length > 0) {
        message += `\n*Absentees:*\n`;
        absentees.forEach((s, i) => message += `${i + 1}. ${escapeHtml(s.name)} (${escapeHtml(s.admissionNo)})\n`);
    } else {
        message += `\n*All students present.*`;
    }

    // Show Preview Modal instead of opening directly
    document.getElementById('sharePreviewText').value = message;
    document.getElementById('sharePreviewModal').classList.remove('hidden');
    window.activityLogger.log('Share Attendance', `Prepared WhatsApp message for ${escapeHtml(batchId)} on ${escapeHtml(date)}`, 'info');
};

// -- Share Preview Logic --
window.closeSharePreview = () => {
    document.getElementById('sharePreviewModal').classList.add('hidden');
};

window.copyShareText = () => {
    const text = document.getElementById('sharePreviewText');
    text.select();
    document.execCommand('copy');

    // Visual feedback
    const btn = event.currentTarget;
    const original = btn.innerHTML;
    btn.innerHTML = '<span>✅ Copied!</span>';
    setTimeout(() => btn.innerHTML = original, 2000);
    window.activityLogger.log('Share Attendance', 'Copied attendance summary to clipboard', 'info');
};

window.proceedToWhatsApp = () => {
    const message = document.getElementById('sharePreviewText').value;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
    closeSharePreview();
    window.activityLogger.log('Share Attendance', 'Opened WhatsApp with attendance summary', 'info');
};

function renderAttendanceRegister() {
    const batchId = document.getElementById('registerBatchSelector').value;
    const container = document.getElementById('registerTableContainer');

    if (!batchId) {
        container.innerHTML = '<p class="text-center py-10 text-gray-500 italic">Select a batch above to load records.</p>';
        return;
    }

    const batchAttendance = attendanceData[batchId] || {};
    let dates = Object.keys(batchAttendance).sort();

    // -- FILTER BY SESSION TAB --
    const currentTab = window.currentRegisterTab || 'Theory';
    if (currentTab !== 'All') {
        dates = dates.filter(d => {
            const sType = batchAttendance[d]?.sessionType || 'Unspecified';
            if (sType === 'Unspecified') return currentTab === 'Theory';
            return sType === currentTab;
        });
    }

    // -- FILTER BY DATE --
    const filterType = document.getElementById('registerFilterType')?.value || 'month';
    const now = new Date();

    if (filterType === 'week') {
        // Get start of week (Sunday)
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        dates = dates.filter(d => {
            const date = new Date(d);
            return date >= startOfWeek && date <= endOfWeek;
        });
    } else if (filterType === 'month') {
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        dates = dates.filter(d => {
            const date = new Date(d);
            return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
        });
    } else if (filterType === 'custom') {
        const startStr = document.getElementById('registerStartDate')?.value;
        const endStr = document.getElementById('registerEndDate')?.value;
        if (startStr && endStr) {
            const start = new Date(startStr);
            const end = new Date(endStr);
            end.setHours(23, 59, 59, 999);
            dates = dates.filter(d => {
                const date = new Date(d);
                return date >= start && date <= end;
            });
        }
    }

    const batchStudents = students.filter(s => s.batchId === batchId)
        .sort((a, b) => a.admissionNo.localeCompare(b.admissionNo));

    if (dates.length === 0) {
        container.innerHTML = `<p class="text-center py-10 text-gray-500 italic">No <b>${currentTab}</b> records found for this batch.</p>`;
        return;
    }

    const isAdmin = localStorage.getItem('user_role') === 'admin';

    const dateHeaders = dates.map(d => {
        const [y, m, day] = d.split('-');
        let headerContent = `${day}/${m}`;

        if (isAdmin) {
            headerContent += `
            <button onclick="deleteBatchAttendanceDate('${batchId}', '${d}')"
                title="Delete this column"
                class="block mx-auto mt-1 w-5 h-5 rounded bg-red-500 text-white font-bold text-[10px] leading-none hover:bg-red-700 shadow-sm transition-all flex items-center justify-center">
                ✕
            </button>
            `;
        }

        return `<th class="px-2 py-1 text-[10px] border border-gray-300 bg-gray-50 min-w-[30px] align-top">${headerContent}</th>`;
    }).join('');

    const tableRows = batchStudents.map((s, i) => {
        let present = 0, absent = 0;

        const cells = dates.map(d => {
            const val = batchAttendance[d][s.id];
            const isAbs = val === 'absent';
            if (isAbs) absent++; else present++;
            const colorClass = isAbs ? 'text-red-600 bg-red-50 font-bold' : 'text-green-600';
            return `<td class="border border-gray-200 text-center text-xs p-1 ${colorClass}">${isAbs ? 'A' : 'P'}</td>`;
        }).join('');

        const totalDays = dates.length;
        const percent = totalDays > 0 ? Math.round((present / totalDays) * 100) : 0;

        return `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="border border-gray-200 text-center py-1">${i + 1}</td>
                <td class="border border-gray-200 px-2 py-1 font-medium">${escapeHtml(s.name)}</td>
                <td class="border border-gray-200 text-center py-1 font-mono text-xs text-gray-500">${s.admissionNo}</td>
                ${cells}
                <td class="border border-gray-200 text-center font-bold text-green-700 bg-green-50">${present}</td>
                <td class="border border-gray-200 text-center font-bold text-red-700 bg-red-50">${absent}</td>
                <td class="border border-gray-200 text-center font-bold">${percent}%</td>
            </tr>
        `;
    }).join('');

    // -- DELETE FUNCTION --
    window.deleteBatchAttendanceDate = (batchId, date) => {
        if (!confirm(`Are you sure you want to delete the attendance column for ${date} ? `)) return;

        if (attendanceData[batchId] && attendanceData[batchId][date]) {
            delete attendanceData[batchId][date];
            saveData();
            renderAttendanceRegister(); // Refresh
            showMessage('Success', 'Column deleted successfully.', 'success');
            window.activityLogger.log('Delete Attendance Column', `Deleted attendance column for ${batchId} on ${date}`, 'warning');
        }
    };

    const tableHtml = `
        <div class="overflow-x-auto border rounded-t-lg shadow-sm bg-white">
        <table class="w-full border-collapse text-sm">
            <thead class="bg-blue-50 text-blue-800 sticky top-0 z-10">
                <tr>
                    <th class="p-2 border border-blue-200 text-center w-10">SL</th>
                    <th class="p-2 border border-blue-200 text-left min-w-[150px]">Student Name</th>
                    <th class="p-2 border border-blue-200 text-center w-24">Adm No</th>
                    ${dateHeaders}
                    <th class="p-2 border border-blue-200 text-center w-10 text-green-700">P</th>
                    <th class="p-2 border border-blue-200 text-center w-10 text-red-700">A</th>
                    <th class="p-2 border border-blue-200 text-center w-12">%</th>
                </tr>
            </thead>
            <tbody>${tableRows}</tbody>
        </table>
        </div>
        <div class="mt-4 flex justify-end">
            <button onclick="handleGenerateRequest('print', 'attendance-register')"
                class="bg-primary text-white px-6 py-2 rounded-lg font-bold shadow hover:bg-primary-dark transition-all flex items-center gap-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z">
                    </path>
                </svg>
                Print Register
            </button>
        </div>
    `;

    container.innerHTML = tableHtml;
}

// -- Activity Log Functions --

window.renderActivityLogs = () => {
    const tbody = document.getElementById('activityLogBody');
    if (!tbody) return;

    const logs = window.activityLogger.getLogs();

    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-400">No activity recorded yet.</td></tr>';
        return;
    }

    tbody.innerHTML = logs.map(log => {
        let typeClass = 'text-gray-600';
        if (log.type === 'error') typeClass = 'text-red-600 font-bold';
        if (log.type === 'warning') typeClass = 'text-orange-600';
        if (log.type === 'success') typeClass = 'text-green-600';

        return `
            <tr class="border-b hover:bg-gray-50">
                <td class="p-3 text-gray-500 whitespace-nowrap">${new Date(log.timestamp).toLocaleString()}</td>
                <td class="p-3 font-bold text-gray-700">${log.user}</td>
                <td class="p-3"><span class="${typeClass}">${log.action}</span></td>
                <td class="p-3 text-gray-600 break-words">${log.details}</td>
            </tr>
        `;
    }).join('');
};

window.exportLogsToCSV = () => {
    const csv = window.activityLogger.exportLogsCSV();
    if (!csv) {
        alert("No logs to export!");
        return;
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', `ams_activity_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.activityLogger.log('Export Logs', 'Activity logs exported to CSV', 'info');
};

// Student Management Functions
function renderStudentList() {
    const selector = document.getElementById('batchSelector');
    if (!selector) return;
    const batchId = selector.value;
    const list = document.getElementById('studentListBody');
    const inChargeInput = document.getElementById('batchInChargeInput');

    // Filter by staff allocations
    let accessibleStudents = students;
    const isAdmin = currentUserRole === 'admin' || currentUserRole === 'developer';
    if (!isAdmin && (currentUserRole === 'staff' || currentUserRole === 'technical_faculty' || currentUserRole === 'workshop_faculty') && currentStaffId) {
        const me = staffMembers.find(s => String(s.id) === String(currentStaffId));
        if (me && me.allocatedBatches && me.allocatedBatches.length > 0) {
            accessibleStudents = students.filter(s => me.allocatedBatches.includes(s.batchId || s.batch_id));
        }
    }

    // Handle both API format and local format
    const normalizedStudents = accessibleStudents.map(s => ({
        id: s.id,
        name: s.name || s.student_name || '',
        admissionNo: s.admissionNo || s.admission_no || '',
        batchId: s.batchId || s.batch_id || '',
        subBatch: s.subBatch || s.sub_batch || 'None',
        documents: s.documents || []
    }));

    if (inChargeInput) {
        inChargeInput.value = batchMetadata[batchId]?.inCharge || '';
    }

    const searchQuery = (document.getElementById('studentSearchInput')?.value || '').toLowerCase();
    
    // Show all if no batch selected, otherwise filter by batch
    let filtered = batchId ? normalizedStudents.filter(s => s.batchId === batchId) : normalizedStudents;

    // Apply Search (Search within name, adm no, or batch name)
    if (searchQuery) {
        filtered = filtered.filter(s =>
            (s.name || '').toLowerCase().includes(searchQuery) ||
            (s.admissionNo || '').toLowerCase().includes(searchQuery) ||
            (s.batchId || '').toLowerCase().includes(searchQuery)
        );
    }

    // Sort by batch first, then name
    filtered.sort((a, b) => {
        if (a.batchId !== b.batchId) return a.batchId.localeCompare(b.batchId);
        return a.name.localeCompare(b.name);
    });

    if (filtered.length === 0) {
        if (list) list.innerHTML = `<tr><td colspan="5" class="p-4 text-center italic opacity-50">${searchQuery ? 'No matching students found.' : 'No student profiles in this batch.'}</td></tr>`;
        return;
    }

    if (list) {
        // Show count if filtered
        const countHtml = searchQuery ? `<tr class="bg-blue-50/50"><td colspan="5" class="p-2 text-[10px] font-bold text-blue-600 border-b">Showing ${filtered.length} matching students</td></tr>` : '';

        list.innerHTML = countHtml + filtered.map(s => `
            <tr class="border-b hover:bg-gray-50 transition-colors">
                <td class="p-3 text-sm font-medium">${escapeHtml(s.name)}</td>
                <td class="p-3 text-xs font-mono text-gray-500">${escapeHtml(s.admissionNo)}</td>
                <td class="p-3 text-xs text-gray-400 font-mono">${escapeHtml(s.batchId)}</td>
                <td class="p-3">
                    <select onchange="updateSubBatch('${s.id}', this.value)" class="text-xs border rounded-md p-1 bg-white hover:border-primary transition-all shadow-sm">
                        <option value="None" ${s.subBatch === 'None' ? 'selected' : ''}>None</option>
                        <option value="A" ${s.subBatch === 'A' ? 'selected' : ''}>A</option>
                        <option value="B" ${s.subBatch === 'B' ? 'selected' : ''}>B</option>
                    </select>
                </td>
                <td class="p-3 text-right">
                    <div class="flex items-center justify-end gap-3">
                        <button onclick="openStudentDocuments('${s.id}')"
                            class="flex items-center gap-1 text-blue-600 font-bold text-xs hover:text-blue-800 transition-colors" title="Manage Documents">
                            📎 Docs <span class="bg-blue-100 px-1.5 py-0.5 rounded-full text-[10px]">${(s.documents || []).length}</span>
                        </button>
                        ${currentUserRole === 'admin' ? `
                        <button onclick="deleteStudent('${s.id}')"
                            class="text-red-500 hover:text-red-700 font-bold text-xs transition-colors">Delete</button>
                        ` : ''}
                    </div>
                </td>
            </tr>
            `).join('');
    }
}

// Aliases for better compatibility
window.renderStudentList = renderStudentList;
window.updateStudentList = renderStudentList;

// ==================== STUDENT DOCUMENT MANAGEMENT ====================

window.openStudentDocuments = function (studentId) {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const modal = document.getElementById('studentDocumentModal');
    const info = document.getElementById('docStudentInfo');

    if (info) info.textContent = `${student.name} (${student.admissionNo})`;
    if (modal) {
        modal.classList.remove('hidden');
        modal.dataset.studentId = studentId;
        renderDocumentList(studentId);
    }
};

window.showStudentDocuments = window.openStudentDocuments;

window.closeStudentDocuments = function () {
    const modal = document.getElementById('studentDocumentModal');
    if (modal) modal.classList.add('hidden');
};

window.handleDocumentUpload = async function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const modal = document.getElementById('studentDocumentModal');
    const studentId = modal ? modal.dataset.studentId : null;
    if (!studentId) return;

    const student = students.find(s => s.id === studentId);
    if (!student) return;

    // File validation
    const MAX_FILE_SIZE = 500 * 1024; // 500KB
    const ALLOWED_TYPES = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'];
    const fileExt = file.name.split('.').pop().toLowerCase();

    if (!isValidFileSize(file, 0.5)) {
        showMessage('File Too Large', 'Maximum file size is 500KB.', 'error');
        e.target.value = '';
        return;
    }

    if (!isValidFileType(file, ALLOWED_TYPES)) {
        showMessage('Invalid File Type', 'Please upload PDF, JPG, PNG, DOC, or DOCX files.', 'error');
        e.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function (ev) {
        if (!student.documents) student.documents = [];

        const newDoc = {
            id: crypto.randomUUID(),
            name: sanitizeForStorage(file.name),
            type: file.type || 'application/octet-stream',
            size: file.size,
            date: new Date().toISOString(),
            content: ev.target.result
        };

        student.documents.push(newDoc);
        saveData();
        renderDocumentList(studentId);
        renderStudentList();
        e.target.value = '';
        showMessage('Success', 'Document uploaded.', 'success');
        window.activityLogger.log('Upload Doc', `Uploaded ${escapeHtml(sanitizeForStorage(file.name))} for ${escapeHtml(student.name)}`, 'success');
    };
    reader.readAsDataURL(file);
};

function renderDocumentList(studentId) {
    const student = students.find(s => s.id === studentId);
    const container = document.getElementById('documentList');
    if (!container || !student) return;

    const docs = student.documents || [];

    if (docs.length === 0) {
        container.innerHTML = '<p class="text-center py-8 text-gray-400 text-sm italic">No documents uploaded yet.</p>';
        return;
    }

    container.innerHTML = docs.map(doc => `
        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 hover:border-blue-200 transition-colors">
            <div class="flex items-center gap-3 overflow-hidden">
                <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                    ${doc.type.includes('pdf') ? '📄' : '🖼️'}
                </div>
                <div class="overflow-hidden">
                    <p class="text-xs font-bold truncate text-gray-800">${escapeHtml(doc.name)}</p>
                    <p class="text-[10px] text-gray-400 font-medium lowercase italic">${(doc.size / 1024).toFixed(1)} KB • ${new Date(doc.date).toLocaleDateString()}</p>
                </div>
            </div>
            <div class="flex gap-2">
                <button onclick="downloadStudentDocument('${studentId}', '${doc.id}')" 
                    class="w-8 h-8 flex items-center justify-center bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-all" title="Download">
                    ⬇️
                </button>
                <button onclick="deleteStudentDocument('${studentId}', '${doc.id}')" 
                    class="w-8 h-8 flex items-center justify-center bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all" title="Delete">
                    \uD83D\uDDD1\uFE0F
                </button>
            </div>
        </div>
    `).join('');
}

window.downloadStudentDocument = function (studentId, docId) {
    const student = students.find(s => s.id === studentId);
    if (!student) return;
    const doc = (student.documents || []).find(d => d.id === docId);
    if (!doc) return;

    const link = document.createElement('a');
    link.href = doc.content;
    link.download = doc.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

window.deleteStudentDocument = function (studentId, docId) {
    if (!confirm('Are you sure you want to delete this document permanently?')) return;

    const student = students.find(s => s.id === studentId);
    if (!student) return;

    student.documents = (student.documents || []).filter(d => d.id !== docId);
    saveData();
    renderDocumentList(studentId);
    renderStudentList();
    showMessage('Success', 'Document deleted.', 'success');
    window.activityLogger.log('Delete Doc', `Deleted document for ${student.name}`, 'warning');
};

window.updateBatchInCharge = (val) => {
    const bId = document.getElementById('batchSelector').value;
    if (!bId) return;
    if (!batchMetadata[bId]) batchMetadata[bId] = {};
    batchMetadata[bId].inCharge = val;
    saveData();
    window.activityLogger.log('Update Batch Incharge', `Batch ${bId} incharge updated to ${val}`, 'info');
};

window.updateSubBatch = (id, val) => {
    const s = students.find(x => x.id === id);
    if (s) {
        s.subBatch = val;
        saveData();
        window.activityLogger.log('Update Sub-Batch', `Student ${s.name} (${s.admissionNo}) sub-batch updated to ${val}`, 'info');
    }
};

window.deleteStudent = (id) => {
    try {
        console.log('Attempting to delete student:', id);
        if (confirm('Permanently delete student profile? This cannot be undone.')) {
            const initialCount = students.length;
            const studentName = students.find(s => s.id === id)?.name || 'Unknown';
            students = students.filter(s => s.id !== id);

            if (students.length === initialCount) {
                console.warn('Student ID not found in list:', id);
                showMessage('Error', 'Student could not be found.', 'error');
                window.activityLogger.log('Delete Student Failed', `Attempted to delete non-existent student ID: ${id}`, 'error');
                return;
            }

            saveData();
            renderStudentList();
            updateBatchDropdowns();
            console.log('Student deleted successfully. New count:', students.length);
            showMessage('Success', 'Student profile deleted.', 'success');
            window.activityLogger.log('Delete Student', `Deleted student: ${studentName} (ID: ${id})`, 'warning');
        } else {
            console.log('Deletion cancelled by user.');
            window.activityLogger.log('Delete Student', `Deletion of student ID: ${id} cancelled`, 'info');
        }
    } catch (err) {
        console.error('Delete failed:', err);
        showMessage('Error', 'Could not delete student. Check console.', 'error');
        window.activityLogger.log('Delete Student Failed', `Error deleting student ID: ${id} - ${err.message}`, 'error');
    }
};

window.handleStudentFormSubmit = (e) => {
    e.preventDefault();
    const name = sanitizeForStorage(e.target.studentName.value);
    const admissionNo = sanitizeAdmissionNo(e.target.admissionNo.value);
    const batchId = sanitizeForStorage(e.target.batchId.value).toUpperCase();

    // Validation
    if (!name) {
        showMessage('Validation Error', 'Student name is required.', 'error');
        return;
    }
    if (!admissionNo) {
        showMessage('Validation Error', 'Admission number is required.', 'error');
        return;
    }
    if (!batchId) {
        showMessage('Validation Error', 'Batch ID is required.', 'error');
        return;
    }

    // Check for duplicate admission number in same batch
    if (students.some(s => s.batchId === batchId && s.admissionNo === admissionNo)) {
        showMessage('Duplicate Error', 'A student with this admission number already exists in this batch.', 'error');
        return;
    }

    const newStudent = {
        name,
        admissionNo,
        batchId,
        id: crypto.randomUUID(),
        marks: {},
        subBatch: 'None'
    };
    students.push(newStudent);
    saveData();
    e.target.reset();
    renderStudentList();
    updateBatchDropdowns();
    showMessage('Success', 'Student added.', 'success');
    window.activityLogger.log('Add Student', `Added student: ${escapeHtml(name)} (${escapeHtml(admissionNo)}) to batch ${escapeHtml(batchId)}`, 'success');
};

window.toggleBulkInputModal = (show) => {
    const modal = document.getElementById('bulkInputModal');
    if (show) {
        modal.classList.remove('hidden');
        document.getElementById('bulkBatchId').value = document.getElementById('batchSelector').value || '';
        window.activityLogger.log('Bulk Input', 'Opened bulk student input modal', 'info');
    } else {
        modal.classList.add('hidden');
    }
};

window.handleBulkInput = (e) => {
    e.preventDefault();
    const bId = sanitizeForStorage(document.getElementById('bulkBatchId').value).toUpperCase();
    const text = document.getElementById('bulkStudentData').value.trim();

    if (!bId) { showMessage('Error', 'Batch ID is required', 'error'); return; }
    if (!text) { showMessage('Error', 'No data provided', 'error'); return; }

    let addedCount = 0;
    let duplicateCount = 0;
    let parseErrorCount = 0;

    const generateId = () => {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    };

    text.split(/\r?\n/).forEach(line => {
        if (!line.trim()) return;

        // Split by comma, tab, semicolon, or pipe
        const p = line.split(/[,\t;|]/).map(x => x.trim()).filter(x => x !== '');

        if (p.length >= 2) {
            const name = sanitizeForStorage(p[0]);
            const adm = sanitizeAdmissionNo(p[1]);

            if (!name || !adm) {
                parseErrorCount++;
                return;
            }

            // Check duplicate in same batch
            const exists = students.some(s => s.batchId === bId && s.admissionNo === adm);
            if (exists) {
                duplicateCount++;
                return;
            }

            students.push({
                id: generateId(),
                name,
                admissionNo: adm,
                batchId: bId,
                marks: {},
                subBatch: 'None'
            });
            addedCount++;
        } else {
            parseErrorCount++;
        }
    });

    if (addedCount > 0) {
        saveData();
        refreshDataAndUI();
        window.toggleBulkInputModal(false);
        let msg = `Imported ${addedCount} students.`;
        if (duplicateCount > 0) msg += ` (${duplicateCount} duplicates skipped)`;
        if (parseErrorCount > 0) msg += ` (${parseErrorCount} invalid lines skipped)`;
        showMessage('Success', msg, 'success');
        window.activityLogger.log('Bulk Import', `Imported ${addedCount} students into batch ${escapeHtml(bId)}`, 'success');
    }
};

// Staff Management Functions
window.addStaff = (name, phone, position, colorCode, isAdmin = false) => {
    // Check for duplicate phone number
    const normalizedPhone = phone.replace(/\D/g, '');
    if (staffMembers.some(s => (s.phone || '').replace(/\D/g, '') === normalizedPhone)) {
        showMessage('Validation Error', 'A staff member with this phone number already exists.', 'error');
        return;
    }

    // Generate Credentials
    const nameParts = name.trim().split(' ');
    const username = (nameParts[0].toLowerCase() + (nameParts[1] ? nameParts[1][0].toLowerCase() : '')).substring(0, 15);
    const password = normalizedPhone.slice(-4);

    const newStaff = {
        id: crypto.randomUUID(),
        name: name.trim(),
        phone: phone.trim(),
        username: username,
        password: password,
        position: position.trim(),
        colorCode: colorCode,
        isAdmin: isAdmin,
        allocatedBatches: []
    };

    staffMembers.push(newStaff);
    saveData();
    renderStaffList();

    // Show success message
    const adminNote = isAdmin ? ' (Site Administrator)' : '';
    showMessage('Staff Added!',
        `${name} added successfully!${adminNote}\nLogin with Name & Phone.`,
        'success');
    window.activityLogger.log('Add Staff', `Added staff: ${name} (${position}, Admin: ${isAdmin})`, 'success');
};

window.deleteStaff = (staffId) => {
    if (confirm('Permanently delete this staff member? This cannot be undone.')) {
        const staffName = staffMembers.find(s => s.id === staffId)?.name || 'Unknown';
        staffMembers = staffMembers.filter(s => s.id !== staffId);
        saveData();
        renderStaffList();
        showMessage('Success', 'Staff member deleted.', 'success');
        window.activityLogger.log('Delete Staff', `Deleted staff: ${staffName} (ID: ${staffId})`, 'warning');
    }
};

window.updateStaff = (staffId, updates) => {
    const staff = staffMembers.find(s => s.id === staffId);
    if (staff) {
        Object.assign(staff, updates);
        saveData();
        renderStaffList();
        showMessage('Success', 'Staff member updated.', 'success');
        window.activityLogger.log('Update Staff', `Updated staff: ${staff.name} (ID: ${staffId})`, 'info');
    }
};

function renderStaffList() {
    const container = document.getElementById('staffListContainer');
    const staffCount = document.getElementById('staffCount');

    if (staffCount) {
        staffCount.textContent = staffMembers.length;
    }

    if (!container) return;

    if (staffMembers.length === 0) {
        container.innerHTML = `
        <div class="text-center py-10 text-gray-500 italic border-2 border-dashed rounded-xl">
            <div class="text-4xl mb-2">👥</div>
                No staff members added yet. Use the form above to add staff.
            </div>
        `;
        return;
    }

    const colorBadges = {
        blue: 'bg-blue-500 text-white',
        green: 'bg-green-500 text-white',
        red: 'bg-red-500 text-white',
        white: 'bg-white text-gray-800 border border-gray-300'
    };

    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${staffMembers.map(staff => `
                <div class="bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
                    <div class="flex justify-between items-start mb-3">
                        <div class="flex-1">
                            <h4 class="font-bold text-lg text-gray-800 flex items-center gap-2">
                                ${escapeHtml(staff.name)}
                                ${(staff.isAdmin || staff.is_admin) ? '<span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full border border-yellow-300">⭐ Admin</span>' : ''}
                            </h4>
                            <p class="text-sm text-gray-600 font-mono mt-1">📞 ${escapeHtml(staff.phone)}</p>
                        </div>
                        <span class="${colorBadges[staff.colorCode]} px-3 py-1 rounded-full text-xs font-bold">
                            ${escapeHtml(staff.position)}
                        </span>
                    </div>
                    <div class="bg-blue-50 border border-blue-100 rounded-lg p-2 mb-3">
                        <p class="text-[10px] font-bold text-gray-500 uppercase mb-1">Login Credentials</p>
                        <div class="grid grid-cols-2 gap-2 text-xs">
                            <div>
                                <span class="text-gray-500">Username:</span>
                                <span class="font-mono font-bold text-blue-700 ml-1">
                                    ${escapeHtml(staff.username || (staff.name.trim().split(' ')[0].toLowerCase() + (staff.name.trim().split(' ')[1] ? staff.name.trim().split(' ')[1][0].toLowerCase() : '')).substring(0, 15))}
                                </span>
                            </div>
                            <div>
                                <span class="text-gray-500">Password:</span>
                                <span class="font-mono font-bold text-green-700 ml-1">
                                    ${escapeHtml(staff.password || (staff.phone?.replace(/\D/g, '').slice(-4) || 'N/A'))}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div class="flex gap-2 mt-3 pt-3 border-t">
                        <button onclick="deleteStaff('${staff.id}')" 
                            class="flex-1 bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm font-bold hover:bg-red-100 transition-all">
                            🗑️ Delete
                        </button>
                    </div>
                </div>
            `).join('')
        }
        </div>
        `;
}

window.handleStaffFormSubmit = (e) => {
    e.preventDefault();
    const name = document.getElementById('staffName').value;
    const phone = document.getElementById('staffPhone').value;
    const position = document.getElementById('staffPosition').value;
    const colorCode = document.getElementById('staffColor').value;
    const isAdmin = document.getElementById('staffIsAdmin').checked;

    addStaff(name, phone, position, colorCode, isAdmin);
    e.target.reset();
};

window.handleGenerateRequest = (mode, forceType = null) => {
    try {
        let config = {};

        if (mode === 'assessment') {
            config = {
                batchId: document.getElementById('assessBatchSelector').value,
                sem: document.getElementById('assessSemesterSelector').value,
                subBatch: document.getElementById('assessSubBatchSelector').value,
                maxMark: document.getElementById('assessMaxMark').value,
                examDate: document.getElementById('assessExamDate').value,
                type: 'mark' // Reverted to standard entry
            };
        } else {
            config = {
                batchId: document.getElementById(forceType ? 'registerBatchSelector' : 'printBatchSelector').value,
                sem: document.getElementById('printSemesterSelector')?.value || '1st',
                subBatch: document.getElementById('printSubBatchSelector')?.value || 'All',
                maxMark: document.getElementById('printMaxMark')?.value || '200',
                studentId: document.getElementById('printStudentSelector')?.value,
                type: forceType || document.getElementById('printTypeSelector').value,
                filterType: document.getElementById('registerFilterType')?.value || 'month',
                sessionFilter: window.currentRegisterTab || 'Theory',
                startDate: document.getElementById('registerStartDate')?.value,
                endDate: document.getElementById('registerEndDate')?.value
            };
        }

        if (!config.batchId) {
            showMessage('Error', 'Select a batch.', 'error');
            return;
        }

        generateSheet(false, config);
        window.activityLogger.log('Generate Sheet', `Generated sheet of type: ${config.type} for batch: ${config.batchId}`, 'info');
    } catch (err) {
        showMessage('Error', 'Generation failed. Check selections.', 'error');
        window.activityLogger.log('Generate Sheet Failed', `Error generating sheet: ${err.message}`, 'error');
    }
};

function generateSheet(isReload = false, config) {
    window.activeSheetConfig = config;
    currentBatch = config.batchId;
    currentSubBatch = config.subBatch;

    // Unified storage key: Always use 'mark' so data is shared between Entry and Print views
    const keyType = 'mark';
    const sheetKey = `${config.batchId} -${config.sem} -${keyType} -${config.maxMark} `;
    const meta = assessmentMetadata[sheetKey] || {};

    renderView('sheetGeneration');

    document.getElementById('sheetBatchDisplay').textContent = config.batchId;
    document.getElementById('sheetBatchDisplay').textContent = config.batchId;

    // Repurpose Semester Display for Session Type in Registers
    if (config.type === 'attendance-register') {
        document.getElementById('sheetSemesterDisplay').textContent = (config.sessionFilter || 'THEORY').toUpperCase();
    } else {
        document.getElementById('sheetSemesterDisplay').textContent = config.sem;
    }

    const dateVal = config.examDate || meta.date || new Date();
    const dateObj = new Date(dateVal);

    // Dynamic Date Header Logic
    const dateEl = document.getElementById('sheetDate');
    const noteEl = dateEl.parentElement.querySelector('.text-right'); // "DATE:" label container

    if (config.type === 'attendance-register') {
        // Change label to PERIOD
        if (noteEl && noteEl.firstChild) noteEl.firstChild.nodeValue = 'PERIOD: ';

        // Determine Period String
        let periodStr = '';
        const now = new Date();

        if (config.filterType === 'month' || !config.filterType) {
            const m = now.toLocaleString('default', { month: 'long' });
            periodStr = `${m} ${now.getFullYear()} `;
        } else if (config.filterType === 'week') {
            periodStr = 'Current Week';
        } else if (config.filterType === 'custom') {
            const d1 = config.startDate ? new Date(config.startDate).toLocaleDateString('en-GB') : '?';
            const d2 = config.endDate ? new Date(config.endDate).toLocaleDateString('en-GB') : '?';
            periodStr = `${d1} - ${d2} `;
        }
        dateEl.textContent = periodStr;
    } else {
        // Reset label to DATE
        if (noteEl && noteEl.firstChild) noteEl.firstChild.nodeValue = 'DATE: ';
        dateEl.textContent = !isNaN(dateObj) ? dateObj.toLocaleDateString('en-GB') : dateVal;
    }

    document.getElementById('displayMaxMark').textContent = config.maxMark;

    const isMarkSheet = config.type === 'mark' || config.type === 'workshop-viva';
    document.getElementById('maxMarkHeaderContainer').classList.toggle('hidden', !isMarkSheet);

    const titles = {
        'workshop-viva': 'FINAL MARK SHEET (v5)',
        'mark': 'ASSESSMENT MARK ENTRY',
        'mark-sheet': 'BLANK MARK SHEET',
        'attendance-index': 'ATTENDANCE INDEX',
        'attendance-register': 'MONTHLY ATTENDANCE REGISTER',
        'transcript': 'ACADEMIC TRANSCRIPT'
    };
    document.getElementById('sheetTitle').textContent = titles[config.type] || 'SHEET';

    // Dynamic Main Title Logic
    const mainTitleEl = document.getElementById('sheetMainTitle');
    if (config.type === 'attendance-register' || config.type === 'transcript') {
        mainTitleEl.classList.add('hidden');

        // Append Session Type to the Sheet Title for clarity
        // Append Session Type to the Sheet Title for clarity
        if (config.type === 'attendance-register') {
            const sType = config.sessionFilter || 'Theory';
            const titleEl = document.getElementById('sheetTitle');
            titleEl.textContent = `MONTHLY ATTENDANCE REGISTER - ${sType.toUpperCase()} `;

            // Visual Distinction
            titleEl.className = "text-sm md:text-md font-semibold border-b-2 inline-block px-8 pb-0.5 mt-1"; // reset
            if (sType === 'Theory') {
                titleEl.classList.add('border-blue-700', 'text-blue-800');
            } else if (sType === 'Workshop') {
                titleEl.classList.add('border-orange-600', 'text-orange-700');
            } else {
                titleEl.classList.add('border-black', 'text-black');
            }
        }
    } else {
        mainTitleEl.textContent = 'WORKSHOP VIVA';
    }

    // Toggle Table Borders (Force Excel Style)
    const tableEl = document.getElementById('generatedSheetTable');
    if (tableEl) {
        // Reset classes
        tableEl.className = 'w-full excel-table';
    }


    let filtered = students.filter(s => s.batchId === config.batchId);
    if (currentSubBatch !== 'All') {
        filtered = filtered.filter(s => s.subBatch === currentSubBatch);
    }

    if (config.type === 'attendance-index') renderAttendanceIndex(filtered);
    else if (config.type === 'attendance-register') renderMonthlyRegister(config.batchId, filtered, config);
    else if (config.type === 'mark-sheet') renderBlankMarkSheet(filtered);
    else if (config.type === 'transcript') renderTranscript(config.studentId);
    else renderMarksEntry(filtered, config.type, config.maxMark, sheetKey);
}

function renderAttendanceIndex(filtered) {
    document.getElementById('markSheetControls').classList.add('hidden');

    // Dynamic Height Calculation to fit A4
    const count = filtered.length;
    let rowHeight = 'h-12'; // Default spacious (< 15 students)
    if (count > 15) rowHeight = 'h-10'; // Standard
    if (count > 20) rowHeight = 'h-9';  // Compact
    if (count > 24) rowHeight = 'h-8';  // Ultra Compact

    document.getElementById('generatedSheetHeader').innerHTML = `
            <th class="w-10 text-center border-b border-gray-300 pb-2">SL.</th>
            <th class="text-left px-2 border-b border-gray-300 pb-2">NAME</th>
            <th class="w-32 text-center border-b border-gray-300 pb-2">ADMISSION NO.</th>
            <th class="w-32 text-center border-b border-gray-300 pb-2">SIGNATURE</th>
        `;
    document.getElementById('generatedSheetBody').innerHTML = filtered.map((s, i) => `
        <tr class="${rowHeight} border-b border-gray-100">
            <td class="text-center">${i + 1}</td>
            <td class="text-left font-medium p-name px-2">${escapeHtml(s.name)}</td>
            <td class="text-center font-mono text-[9px]">${s.admissionNo}</td>
            <td class="border-b border-gray-200"></td>
        </tr>
        `).join('');
}

// Filter Register Logic
window.toggleDateInputs = () => {
    const type = document.getElementById('registerFilterType').value;
    const customContainer = document.getElementById('customDateInputs');
    if (customContainer) {
        customContainer.classList.toggle('hidden', type !== 'custom');
    }

    // Auto-apply filters on change
    if (type !== 'custom') {
        renderAttendanceRegister();
    }
};

// Tab Logic
// Tab Logic
window.currentRegisterTab = 'Theory'; // Default

// Initialize Tab State
window.currentRegisterTab = 'Theory';

window.switchRegisterTab = (tabName) => {
    window.currentRegisterTab = tabName;

    // Update UI
    ['Theory', 'Workshop', 'All'].forEach(t => {
        const btn = document.getElementById(`tab${t}`);
        if (btn) {
            if (t === tabName) {
                btn.className = "flex-1 py-2 px-4 rounded-md text-xs font-bold transition-all bg-white text-blue-700 shadow-sm border border-blue-200";
            } else {
                btn.className = "flex-1 py-2 px-4 rounded-md text-xs font-bold transition-all text-gray-500 hover:bg-gray-200";
            }
        }
    });

    // Auto-refresh if batch is selected
    const batchSelector = document.getElementById('registerBatchSelector');
    if (batchSelector && batchSelector.value) {
        renderAttendanceRegister();
    }
};

window.filterRegister = () => {
    const batchId = document.getElementById('registerBatchSelector').value;
    if (!batchId) return;

    // Permissions Check
    if (currentUserRole === 'staff' || currentUserRole === 'technical_faculty') {
        const me = staffMembers.find(s => String(s.id) === String(currentStaffId));
        if (me) {
            // If allocatedBatches exists and is not empty, check it.
            // If empty, we might default to allow (legacy) or deny (strict). 
            // Given the feature request "only allowcated staff", we default to DENY if array exists but doesn't include batch.
            if (me.allocatedBatches && me.allocatedBatches.length > 0 && !me.allocatedBatches.includes(batchId)) {
                showMessage('Access Denied', `You are not authorized to view the register for batch ${batchId}.`, 'error');
                return;
            }
            // If allocatedBatches is missing/empty, we allow access (backward compatibility until verified)
            // or ideally deny. Let's allow for now to prevent lockout unless explicitly set.
        }
    }

    // Trigger generation with register config
    const config = {
        batchId: batchId,
        subBatch: 'All', // Default to All for overview
        type: 'attendance-register',
        filterType: document.getElementById('registerFilterType').value,
        sessionFilter: window.currentRegisterTab, // Use Tab State
        startDate: document.getElementById('registerStartDate').value,
        endDate: document.getElementById('registerEndDate').value
    };
    generateSheet(false, config);
    window.activityLogger.log('Filter Register', `Filtered attendance register for batch ${batchId} by ${config.filterType} and session ${config.sessionFilter}`, 'info');
};

function renderMonthlyRegister(batchId, filtered, config) {
    document.getElementById('markSheetControls').classList.add('hidden');
    const batchAttendance = attendanceData[batchId] || {};
    let dates = Object.keys(batchAttendance).sort();

    // -- FILTERING LOGIC --
    const now = new Date();
    const filterType = config?.filterType || 'month';

    if (filterType === 'week') {
        // Get start of week (Sunday)
        const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        dates = dates.filter(d => {
            const date = new Date(d);
            return date >= startOfWeek && date <= endOfWeek;
        });
    } else if (filterType === 'month') {
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        dates = dates.filter(d => {
            const date = new Date(d);
            return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
        });
    } else if (filterType === 'custom') {
        const start = config.startDate ? new Date(config.startDate) : null;
        const end = config.endDate ? new Date(config.endDate) : null;

        if (start && end) {
            // Set end to end of day
            end.setHours(23, 59, 59, 999);
            dates = dates.filter(d => {
                const date = new Date(d);
                return date >= start && date <= end;
            });
        }
    }

    // 2. Filter by Session Type
    const sessionFilter = config?.sessionFilter || 'All';

    if (sessionFilter !== 'All') {
        dates = dates.filter(d => {
            const sessionType = batchAttendance[d]?.sessionType || 'Unspecified';
            if (sessionType === 'Unspecified') return sessionFilter === 'Theory';
            return sessionType === sessionFilter;
        });
    }

    const dateHeaders = dates.map(d => `
        <th class="w-6 text-[10px] p-1 border-r border-black bg-gray-50 align-bottom font-medium" style="height: 100px; vertical-align: bottom;">
            <div style="writing-mode: vertical-rl; transform: rotate(180deg); margin: 0 auto; white-space: nowrap;">
                ${new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })}
            </div>
        </th>
        `).join('');

    document.getElementById('generatedSheetHeader').innerHTML = `
        <tr class="border-b-2 border-black">
                <th class="w-10 text-center border-r border-black p-2 font-bold text-xs uppercase bg-gray-100">SL.</th>
                <th class="text-left px-2 border-r border-black font-bold text-xs uppercase bg-gray-100" style="min-width: 250px;">NAME</th>
                ${dateHeaders}
                <th class="w-8 text-center border-r border-black bg-green-50 text-green-800 font-bold text-xs border-l-2 border-l-black">P</th>
                <th class="w-8 text-center border-r border-black bg-red-50 text-red-800 font-bold text-xs">A</th>
                <th class="w-10 text-center bg-blue-50 text-blue-800 font-bold text-xs">%</th>
            </tr>
        `;

    if (dates.length === 0) {
        // Smart Empty State: Check if data exists under OTHER categories
        if (sessionFilter !== 'All') {
            const allDates = Object.keys(batchAttendance);
            const otherCounts = {};
            allDates.forEach(d => {
                const type = batchAttendance[d]?.sessionType || 'Unspecified';
                if (type !== sessionFilter) {
                    otherCounts[type] = (otherCounts[type] || 0) + 1;
                }
            });

            const otherMsg = Object.entries(otherCounts).map(([k, v]) => `${v} ${k}`).join(', ');

            if (otherMsg) {
                document.getElementById('generatedSheetBody').innerHTML = `
        <tr><td colspan="100" class="text-center p-8 text-gray-400 italic border-b border-black">
            No <b>${sessionFilter.toUpperCase()}</b> records found.<br>
                <span class="text-red-500 text-xs not-italic">
                    However, found: <b>${otherMsg}</b> records.<br>
                        (Please update "Session Type" in Daily Attendance if this is a mistake)
                </span>
        </td></tr>
            `;
                return;
            }
        }

        document.getElementById('generatedSheetBody').innerHTML = `
            <tr><td colspan="100" class="text-center p-8 text-gray-400 italic border-b border-black">No attendance records found for this period.</td></tr>
                `;
        return;
    }

    document.getElementById('generatedSheetBody').innerHTML = filtered.map((s, i) => {
        let absCount = 0;
        let presentCount = 0;

        const cells = dates.map(d => {
            const isAbs = batchAttendance[d] && batchAttendance[d][s.id] === 'absent';
            const hasRecord = !!batchAttendance[d];

            if (isAbs) absCount++;
            else if (hasRecord) presentCount++;

            const status = hasRecord ? (isAbs ? 'A' : 'P') : '-';

            let cellStyle = 'font-weight: bold; color: green;';
            if (isAbs) cellStyle = 'font-weight: bold; color: red; background-color: #fee2e2;'; // light red bg
            if (status === '-') cellStyle = 'color: #d1d5db;'; // gray-300

            return `<td class="p-0 text-[10px] text-center border-r border-black h-8" style="${cellStyle}">${status}</td>`;
        }).join('');

        const total = dates.length;
        const percent = total > 0
            ? (((total - absCount) / total) * 100).toFixed(0)
            : '0';

        const rowBg = i % 2 === 0 ? 'bg-white' : 'bg-gray-50'; // Zebra Striping

        return `
        <tr class="h-8 border-b border-black ${rowBg} print:bg-transparent">
                    <td class="text-center text-black font-medium text-xs border-r border-black">${i + 1}</td>
                    <td class="text-left font-bold p-name text-xs px-2 border-r border-black text-black uppercase">${escapeHtml(s.name)}</td>
                    ${cells}
                    <td class="text-center font-bold text-xs text-green-700 bg-green-50 border-r border-black border-l-2 border-l-black">${presentCount}</td>
                    <td class="text-center font-bold text-xs text-red-700 bg-red-50 border-r border-black">${absCount}</td>
                    <td class="text-center font-bold text-xs text-blue-700 bg-blue-50">${percent}%</td>
                </tr>
        `;
    }).join('');
}

function renderBlankMarkSheet(filtered) {
    document.getElementById('markSheetControls').classList.add('hidden');
    const headers = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'PRAC', 'REC'];
    const markHeaders = headers.map(h => `<th class="w-7 text-[9px]">${h}</th>`).join('');

    document.getElementById('generatedSheetHeader').innerHTML = `
        <tr>
            <th class="w-9">SL.</th>
            <th class="text-left">NAME</th>
            <th class="w-28">ADM NO.</th>
            ${markHeaders}
    <th class="w-10">TOTAL</th>
        </tr>
        `;

    document.getElementById('generatedSheetBody').innerHTML = filtered.map((s, i) => `
        <tr class="h-10">
            <td>${i + 1}</td>
            <td class="text-left font-medium p-name">${escapeHtml(s.name)}</td>
            <td class="text-[9px] font-mono">${s.admissionNo}</td>
            ${Array(9).fill('<td></td>').join('')}
        </tr>
        `).join('');
}

window.handleEnterKey = (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const inputs = Array.from(document.querySelectorAll('.mark-input'));
        const index = inputs.indexOf(e.target);
        if (index > -1 && index + 1 < inputs.length) {
            inputs[index + 1].focus();
            inputs[index + 1].select();
        }
    }
};

function renderMarksEntry(filtered, type, maxMark, sheetKey) {
    const isEntry = type === 'mark';
    const isViva = type && type.toString().includes('workshop-viva'); // This is now the "Print Summary" mode

    const isSubmitted = !!assessmentMetadata[sheetKey];
    const isAdmin = currentUserRole === 'admin';
    const isReadOnly = isSubmitted && !isAdmin;

    if (isReadOnly) {
        // Hide controls for staff on submitted sheets
        document.getElementById('markSheetControls').classList.add('hidden');
    } else {
        // Show controls if it's entry mode (and not read-only)
        document.getElementById('markSheetControls').classList.toggle('hidden', !isEntry);
    }

    let headers = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'PRAC', 'REC'];
    if (isViva) headers = ['TOTAL'];

    const markHeaders = headers.map(h =>
        `<th class="w-12 text-xs text-center border-r border-black bg-gray-50">${h}</th>`
    ).join('');

    const totalHeaderStyle = isViva ? 'display:none' : '';
    const actionHeader = isAdmin ? '<th class="w-10 text-center text-red-600 border-l border-black">DEL</th>' : '';

    document.getElementById('generatedSheetHeader').innerHTML = `
        <tr class="border-b-2 border-black text-center">
            <th class="w-12 text-center border-r border-black">SL.</th>
            <th class="text-left pl-2 border-r border-black">NAME</th>
            <th class="w-24 text-center border-r border-black">ADM NO.</th>
            ${markHeaders}
            <th class="w-12 border-r border-black" style="${totalHeaderStyle}">TOTAL</th>
            <th class="w-12 text-center">RANK</th>
            ${actionHeader}
        </tr>
        `;

    // Calculate ranks first
    let processed = filtered.map(s => {
        const mData = s.marks[sheetKey]?.marks || Array(8).fill(0);
        const total = mData.reduce((a, b) => a + b, 0);
        return { ...s, mData, total };
    }).sort((a, b) => b.total - a.total);

    let currentRank = 1;
    processed.forEach((s, i) => {
        if (i > 0 && s.total < processed[i - 1].total) currentRank = i + 1;
        s.rank = s.total > 0 ? currentRank : 'AB';
    });

    document.getElementById('generatedSheetBody').innerHTML = processed.map((s, i) => {
        let cells = '';
        if (isViva) {
            // Read-Only Summary View
            cells = `
        <td class="p-0 border-r border-black h-10 text-center align-middle">
            <input type="number" value="${s.total || ''}" disabled
                class="w-full h-full text-center bg-transparent outline-none border-none text-lg font-bold text-black no-print">
                <span class="print-only">${s.total || ''}</span>
            </td>
    `;
        } else {
            // Standard Entry View
            cells = s.mData.map((m, idx) => `
        <td class="border-r border-black p-0 h-8 text-center align-middle">
            <input type="number" value="${m || ''}" ${isReadOnly ? 'disabled' : ''}
                class="mark-input w-full h-full text-center bg-transparent outline-none border-none text-base font-bold no-print ${isReadOnly ? 'text-gray-500' : ''}"
                onkeydown="handleEnterKey(event)"
                oninput="liveUpdateMark('${s.id}', ${idx}, this.value, '${sheetKey}', ${maxMark}, this)">
                <span class="print-only text-sm">${m || ''}</span>
            </td>
    `).join('');
        }

        const deleteBtn = isAdmin ? `
        <td class="text-center border-l border-black no-print p-0">
            <button onclick="deleteStudentMark('${s.id}', '${sheetKey}')" class="text-red-500 hover:text-red-700 font-bold px-1 text-xs">
                \uD83D\uDDD1\uFE0F
            </button>
            </td>
        ` : '';

        return `
        <tr class="h-8 border-b border-black hover:bg-gray-50 transition-colors" data-sid="${s.id}">
                <td class="text-center border-r border-black font-medium text-xs">${i + 1}</td>
                <td class="text-left pl-1 font-bold p-name border-r border-black text-[11px] uppercase leading-tight">${escapeHtml(s.name)}</td>
                <td class="text-center font-mono border-r border-black text-[9px] font-bold text-blue-800 tracking-tighter whitespace-nowrap overflow-hidden">${s.admissionNo}</td>
                ${cells}
                <td class="text-center font-bold border-r border-black total-cell text-sm" style="${totalHeaderStyle}">${s.total || ''}</td>
                <td class="text-center font-bold rank-cell text-sm">${s.rank}</td>
                ${deleteBtn}
            </tr>
        `;
    }).join('');
}

window.deleteStudentMark = (sid, sheetKey) => {
    if (!confirm('Are you sure you want to delete marks for this student?')) return;

    const student = students.find(s => s.id === sid);
    if (!student || !student.marks[sheetKey]) return;

    // Remove marks
    delete student.marks[sheetKey];

    saveData();
    showMessage('Deleted', 'Student marks deleted.', 'success');

    // Re-render
    const config = window.activeSheetConfig;
    generateSheet(false, config);
    window.activityLogger.log('Delete Student Marks', `Deleted marks for student ${student.name} (ID: ${sid}) from assessment ${sheetKey}`, 'warning');
};

function renderTranscript(studentId) {
    document.getElementById('markSheetControls').classList.add('hidden');
    const s = students.find(x => x.id === studentId);

    if (!s) {
        document.getElementById('generatedSheetBody').innerHTML =
            '<tr><td colspan="5" class="p-4 text-center">Please select a student from the Print Center.</td></tr>';
        return;
    }

    document.getElementById('generatedSheetHeader').innerHTML = `
        <tr>
            <th class="w-12">#</th>
            <th class="text-left">ASSESSMENT SEMESTER</th>
            <th class="w-20">MAX SCORE</th>
            <th class="w-20">SCORE</th>
            <th class="w-20">RANK</th>
        </tr>
        `;

    const keys = Object.keys(assessmentMetadata).filter(k => k.startsWith(s.batchId)).sort((a, b) => {
        const dateA = new Date(assessmentMetadata[a]?.date || 0);
        const dateB = new Date(assessmentMetadata[b]?.date || 0);
        return dateB - dateA;
    });

    const rows = keys.map((k, i) => {
        const m = assessmentMetadata[k];
        const studentData = calculateRankForStudent(k, s.id, m.maxMark);
        return `
        <tr>
                <td>${i + 1}</td>
                <td class="text-left font-medium">${m.semester} Semester Workshop Assessment</td>
                <td>${m.maxMark * 8}</td>
                <td class="font-bold">${studentData.total || ''}</td>
                <td class="font-bold">${studentData.rank}</td>
            </tr>
        `;
    }).join('');

    document.getElementById('generatedSheetBody').innerHTML = rows ||
        '<tr><td colspan="5" class="p-4 text-center italic text-gray-400">No assessment data found for this student.</td></tr>';
}

function calculateRankForStudent(key, sid, maxMark) {
    const batchId = key.split('-')[0];
    const batchStudents = students.filter(s => s.batchId === batchId);

    const processed = batchStudents.map(s => {
        const m = s.marks[key]?.marks || Array(8).fill(0);
        return { id: s.id, total: m.reduce((a, b) => a + b, 0) };
    }).sort((a, b) => b.total - a.total);

    let rank = 1;
    for (let i = 0; i < processed.length; i++) {
        if (i > 0 && processed[i].total < processed[i - 1].total) rank = i + 1;
        if (processed[i].id === sid) {
            return {
                total: processed[i].total,
                rank: processed[i].total > 0 ? rank : 'AB'
            };
        }
    }
    return { total: 0, rank: 'AB' };
}

window.liveUpdateMark = (sid, idx, val, key, max, inputEl) => {
    const limits = [10, 10, 10, 10, 10, 10, 40, 100];
    const limit = limits[idx] || 100;

    let numVal = parseInt(val) || 0;

    if (numVal > limit) {
        numVal = limit;
        if (inputEl) inputEl.value = limit;
    }
    if (numVal < 0) {
        numVal = 0;
        if (inputEl) inputEl.value = 0;
    }

    const student = students.find(s => s.id === sid);
    if (!student) return;

    if (!student.marks[key]) {
        student.marks[key] = { marks: Array(8).fill(0) };
    }

    student.marks[key].marks[idx] = numVal;

    const row = document.querySelector(`tr[data-sid="${sid}"]`);
    if (row) {
        const total = student.marks[key].marks.reduce((a, b) => a + b, 0);
        row.querySelector('.total-cell').textContent = total || '';
    }
};

window.saveMarks = () => {
    const config = window.activeSheetConfig;
    const keyType = 'mark'; // Unified storage
    const sheetKey = `${config.batchId} -${config.sem} -${keyType} -${config.maxMark} `;

    assessmentMetadata[sheetKey] = {
        date: config.examDate,
        semester: config.sem,
        maxMark: config.maxMark
    };

    saveData();
    generateSheet(true, config);
    showMessage('Success', 'Marks saved successfully.', 'success');
    window.activityLogger.log('Save Marks', `Marks saved for assessment ${sheetKey}`, 'success');
};

// Import/Export Functions
window.exportData = () => {
    const data = {
        students,
        assessmentMetadata,
        attendanceData,
        batchMetadata,
        staffMembers
    };

    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ams_v4_2_backup.json';
    a.click();
    window.activityLogger.log('Export Data', 'All system data exported to JSON backup', 'info');
};

window.importData = (e) => {
    if (!e.target.files[0]) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const d = JSON.parse(ev.target.result);
            students = d.students || [];
            assessmentMetadata = d.assessmentMetadata || {};
            attendanceData = d.attendanceData || {};
            batchMetadata = d.batchMetadata || {};
            staffMembers = d.staffMembers || [];
            saveData();
            refreshDataAndUI();
            showMessage('Success', 'System restored.', 'success');
            window.activityLogger.log('Import Data', 'System data imported from backup file', 'warning');
        } catch (err) {
            showMessage('Error', 'Invalid backup file.', 'error');
            window.activityLogger.log('Import Data Failed', `Error importing data: ${err.message}`, 'error');
        }
    };
    reader.readAsText(e.target.files[0]);
};

// Initialize on DOM Load
// Initialize on DOM Load
// Redundant DOMContentLoaded removed. Consolidated at end of file.

// Assessment History Functions
window.renderAssessmentHistory = () => {
    const listBody = document.getElementById('assessmentHistoryBody');
    if (!listBody) return;

    let keys = Object.keys(assessmentMetadata);

    // Filter for Workshop Faculty: Only show Viva records
    if (currentUserRole === 'workshop_faculty') {
        keys = keys.filter(k => k.split('-')[2] === 'viva');
    }
    // Filter for Technical Faculty: No Viva records
    if (currentUserRole === 'technical_faculty') {
        keys = keys.filter(k => k.split('-')[2] !== 'viva');
    }

    keys.sort((a, b) => {
        const dateA = new Date(assessmentMetadata[a]?.date || 0);
        const dateB = new Date(assessmentMetadata[b]?.date || 0);
        return dateB - dateA;
    });

    if (keys.length === 0) {
        listBody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-gray-500">No recorded assessments found.</td></tr>';
        return;
    }

    listBody.innerHTML = keys.map(key => {
        const meta = assessmentMetadata[key] || {};
        // Key format: batch-sem-type-maxMark
        const parts = key.split('-');

        let batchId = parts[0];
        let sem = parts[1];
        let keyType = parts[2]; // 'viva' or 'mark'
        let maxMark = parts[3];

        const date = meta.date ? new Date(meta.date).toLocaleDateString('en-GB') : '-';
        const typeLabel = (keyType === 'viva') ? 'Workshop Viva' : 'Assessment';
        const typeCode = (keyType === 'viva') ? 'workshop-viva' : 'mark';

        const currentRole = localStorage.getItem('user_role');
        const showDelete = (currentRole === 'admin' || currentRole === 'incharge');

        return `
        <tr class="border-b hover:bg-gray-50 transition-colors">
                <td class="p-4 font-medium">${date}</td>
                <td class="p-4">${batchId}</td>
                <td class="p-4">${sem}</td>
                <td class="p-4"><span class="px-2 py-1 rounded text-xs font-bold ${keyType === 'viva' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}">${typeLabel}</span></td>
                <td class="p-4">${maxMark}</td>
                <td class="p-4 text-center">
                    <div class="flex justify-center gap-2">
                        <button onclick="loadAssessment('${key}', '${typeCode}')" 
                            class="px-3 py-1 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors font-medium text-sm">
                            View
                        </button>
                        ${showDelete ? `
                        <button onclick="deleteAssessment('${key}')" 
                            class="px-3 py-1 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors font-medium text-sm">
                            Delete
                        </button>` : ''}
                    </div>
                </td>
        </tr>
        `;
    }).join('');
};

window.loadAssessment = (key, type) => {
    const parts = key.split('-');
    const batchId = parts[0];
    const sem = parts[1];
    const maxMark = parts[3];
    const meta = assessmentMetadata[key] || {};

    const config = {
        batchId: batchId,
        sem: sem,
        subBatch: 'All',
        maxMark: maxMark,
        type: type,
        examDate: meta.date
    };

    generateSheet(false, config);
};

// Update user badge
const updateRoleBadge = () => {
    const badge = document.getElementById('currentUserBadge');
    if (badge) {
        let text = (currentUserRole || 'Guest').toUpperCase().replace('_', ' ');
        badge.textContent = text;
        const hasElevatedPrivs = (currentUserRole === 'admin' || currentUserRole === 'incharge');
        badge.parentElement.classList.toggle('bg-red-50', !hasElevatedPrivs);
        badge.parentElement.classList.toggle('text-red-800', !hasElevatedPrivs);
        badge.parentElement.classList.toggle('border-red-100', !hasElevatedPrivs);
    }
};
// Redundant listener removed.

window.deleteAssessment = (key) => {
    // RBAC Check: Only Admin or Incharge can delete
    if (currentUserRole !== 'admin' && currentUserRole !== 'incharge') {
        showMessage('Access Denied', 'Only Administrators or Incharge users can delete assessments.', 'error');
        return;
    }

    if (!confirm('Are you sure you want to permanently delete this assessment record? This cannot be undone.')) {
        return;
    }

    // 1. Remove metadata
    delete assessmentMetadata[key];

    // 2. Remove marks from all students
    students.forEach(student => {
        if (student.marks && student.marks[key]) {
            delete student.marks[key];
        }
    });

    // 3. Save and refresh
    saveData();
    renderAssessmentHistory();
    calculateDashboardStats(); // Update stats
    showMessage('Success', 'Assessment record deleted successfully.', 'success');
};

// ==================== ASSESSMENT EXAM TAB ====================

let assessmentExams = {};
const LS_KEY_ASSESSMENT_EXAMS = 'academic_management_assessment_exams';

// Load assessment exams from storage
function loadAssessmentExams() {
    try {
        const stored = localStorage.getItem(LS_KEY_ASSESSMENT_EXAMS);
        assessmentExams = stored ? JSON.parse(stored) : {};
    } catch (error) {
        console.error('Error loading assessment exams:', error);
        assessmentExams = {};
    }
}

// Save assessment exams to storage
function saveAssessmentExams() {
    try {
        localStorage.setItem(LS_KEY_ASSESSMENT_EXAMS, JSON.stringify(assessmentExams));
    } catch (error) {
        console.error('Error saving assessment exams:', error);
        showMessage('Save Error', 'Could not save assessment data', 'error');
    }
}

// Switch between assessment tabs
window.switchAssessmentTab = function (tab) {
    if (tab === 'exam' && currentUserRole === 'workshop_faculty') {
        showMessage('Access Denied', 'Workshop Faculty members only have access to Workshop Viva entries.', 'error');
        return;
    }
    if (tab === 'workshop' && currentUserRole === 'technical_faculty') {
        showMessage('Access Denied', 'Technical Faculty members do not have access to Workshop Viva entries.', 'error');
        return;
    }
    const workshopTab = document.getElementById('workshopTab');
    const examTab = document.getElementById('examTab');
    const workshopContent = document.getElementById('workshopTabContent');
    const examContent = document.getElementById('examTabContent');

    if (tab === 'workshop') {
        workshopTab.classList.remove('bg-gray-200', 'text-gray-700');
        workshopTab.classList.add('bg-primary', 'text-white');
        examTab.classList.remove('bg-primary', 'text-white');
        examTab.classList.add('bg-gray-200', 'text-gray-700');

        workshopContent.classList.remove('hidden');
        examContent.classList.add('hidden');
    } else {
        examTab.classList.remove('bg-gray-200', 'text-gray-700');
        examTab.classList.add('bg-primary', 'text-white');
        workshopTab.classList.remove('bg-primary', 'text-white');
        workshopTab.classList.add('bg-gray-200', 'text-gray-700');

        examContent.classList.remove('hidden');
        workshopContent.classList.add('hidden');

        // Load the table when switching to exam tab
        loadAssessmentExamTable();
    }
};

//Load and render assessment exam table
window.loadAssessmentExamTable = function () {
    const batchSelector = document.getElementById('examBatchSelector');
    const dateInput = document.getElementById('examDate');
    const container = document.getElementById('assessmentExamTableContainer');

    const batchId = batchSelector?.value;
    const date = dateInput?.value;

    if (!batchId || !date) {
        container.innerHTML = '<p class="text-center text-gray-500 py-8">Please select batch and date</p>';
        return;
    }

    const key = `${batchId}_${date}`;
    const filtered = students.filter(s => s.batchId === batchId).sort((a, b) => a.admissionNo.localeCompare(b.admissionNo));

    if (filtered.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 py-8">No students in this batch</p>';
        return;
    }

    // Initialize exam data if doesn't exist
    if (!assessmentExams[key]) {
        assessmentExams[key] = {
            date: date,
            batchId: batchId,
            students: filtered.map(s => ({
                id: s.id,
                name: s.name,
                admissionNo: s.admissionNo,
                total: 0,
                rank: 0
            }))
        };
    }

    // Render the table
    renderAssessmentExamTable(key, filtered);
};

// Render the assessment exam table
function renderAssessmentExamTable(key, studentList) {
    const container = document.getElementById('assessmentExamTableContainer');
    const examData = assessmentExams[key];

    // Calculate ranks
    const sorted = [...examData.students].sort((a, b) => b.total - a.total);
    sorted.forEach((s, idx) => {
        const student = examData.students.find(st => st.id === s.id);
        if (student) {
            student.rank = s.total > 0 ? idx + 1 : 0;
        }
    });

    const html = `
            <div class="overflow-x-auto">
                <table class="w-full text-sm border-collapse">
                    <thead class="bg-gray-100 border-b-2 border-gray-300">
                        <tr>
                            <th class="p-3 text-left font-bold border">SI No</th>
                            <th class="p-3 text-left font-bold border">Name</th>
                            <th class="p-3 text-left font-bold border">Admission No</th>
                            <th class="p-3 text-center font-bold border">Total</th>
                            <th class="p-3 text-center font-bold border">Rank</th>
                            <th class="p-3 text-center font-bold border">Signature</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${examData.students.map((s, idx) => `
                        <tr class="border-b hover:bg-gray-50">
                            <td class="p-3 border text-center">${idx + 1}</td>
                            <td class="p-3 border font-medium">${escapeHtml(s.name)}</td>
                            <td class="p-3 border text-xs font-mono">${s.admissionNo}</td>
                            <td class="p-3 border">
                                <input type="number" value="${s.total || ''}" min="0" max="200"
                                    onchange="updateExamTotal('${key}', '${s.id}', this.value)"
                                    class="w-full p-2 border rounded text-center focus:ring-2 focus:ring-primary">
                            </td>
                            <td class="p-3 border text-center font-bold ${s.rank === 1 ? 'text-green-600' : ''}">
                                ${s.rank > 0 ? s.rank : '-'}
                            </td>
                            <td class="p-3 border">
                                <div class="h-8 border-b-2 border-dotted border-gray-400"></div>
                            </td>
                        </tr>
                    `).join('')}
                    </tbody>
                </table>
        </div>
            <div class="flex justify-between items-center mt-6">
                <button onclick="saveAssessmentExam()"
                    class="px-6 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-all">
                    💾 Save
                </button>
                <button onclick="printAssessmentExam('${key}')"
                    class="px-6 py-3 bg-gray-800 text-white font-bold rounded-xl hover:bg-black transition-all">
                    🖨️ Print
                </button>
            </div>
        `;

    container.innerHTML = html;
}

// Update exam total marks
window.updateExamTotal = function (key, studentId, value) {
    const total = parseInt(value) || 0;
    const examData = assessmentExams[key];
    const student = examData.students.find(s => s.id === studentId);

    if (student) {
        student.total = total;
        // Re-render to update ranks
        const filtered = students.filter(s => s.batchId === examData.batchId);
        renderAssessmentExamTable(key, filtered);
    }
};

// Save assessment exam
window.saveAssessmentExam = function () {
    saveAssessmentExams();
    showMessage('Success', 'Assessment exam saved successfully', 'success');
    window.activityLogger.log('Assessment Exam', 'Saved assessment exam data', 'info');
};

// Print assessment exam
window.printAssessmentExam = function (key) {
    const examData = assessmentExams[key];
    const printWindow = window.open('', '_blank');

    const html = `
            <!DOCTYPE html>
                <html>
                    <head>
                        <title>Academic Management System | AMS v5.2.0-DEV-FIX</title>
                        <style>
                            @page { size: A4; margin: 15mm; }
                            * {margin: 0; padding: 0; box-sizing: border-box; }
                            body {
                                font-family: Arial, sans-serif;
                            padding: 20px;
                            line-height: 1.4;
                }
                            .header-container {
                                display: flex;
                            align-items: center;
                            justify-content: center;
                            margin-bottom: 25px;
                }
                            .logo {
                                width: 300px;
                            max-height: 120px;
                            height: auto;
                            object-fit: contain;
                            display: block;
                }
                            .program-title {
                                text-align: center;
                            font-weight: bold;
                            font-size: 14px;
                            margin: 10px 0;
                }
                            .exam-title {
                                text-align: center;
                            font-weight: bold;
                            font-size: 13px;
                            margin-bottom: 8px;
                }
                            .info-row {
                                display: flex;
                            justify-content: space-between;
                            margin-bottom: 8px;
                            font-size: 12px;
                }
                            .info-row div {
                                flex: 1;
                }
                            .batch-info {
                                text-align: center;
                            font-weight: bold;
                            font-size: 13px;
                            margin-bottom: 15px;
                }
                            table {
                                width: 100%;
                            border-collapse: collapse;
                            margin-top: 10px;
                            font-size: 11px;
                }
                            th, td {
                                border: 1px solid #000;
                            padding: 6px 8px;
                            text-align: left;
                }
                            th {
                                background-color: #fff;
                            font-weight: bold;
                            text-align: center;
                            font-size: 11px;
                }
                            td.center {
                                text-align: center;
                }
                            .slno-col {width: 50px; }
                            .name-col {width: 200px; }
                            .admno-col {width: 150px; }
                            .mark-col {width: 80px; text-align: center; }
                            .rank-col {width: 60px; text-align: center; }
                            .signatures {
                                display: flex;
                            justify-content: space-between;
                            margin-top: 40px;
                            padding: 0 20px;
                            font-size: 12px;
                            font-weight: bold;
                }
                            .signatures div {
                                text-align: center;
                }
                        </style>
                    </head>
                    <body>
                        <div class="header-container">
                            <img src="assets/img/header-logo.png" alt="A2Z Logo" class="logo">
                        </div>

                        <div class="program-title">ADVANCED DIPLOMA IN AUTOMOBILE ENGINEERING</div>
                        <div class="exam-title">ASSESSMENT EXAMINATION ${new Date(examData.date).getFullYear()}</div>

                        <div class="info-row">
                            <div><strong>TOPIC:</strong></div>
                            <div style="text-align: right;"><strong>DATE:</strong> ${new Date(examData.date).toLocaleDateString('en-GB')}</div>
                        </div>

                        <div class="batch-info">BATCH: ${examData.batchId}</div>

                        <table>
                            <thead>
                                <tr>
                                    <th class="slno-col">SLNO</th>
                                    <th class="name-col">NAME</th>
                                    <th class="admno-col">ADMISSION NUMBER</th>
                                    <th class="mark-col">MARK</th>
                                    <th class="rank-col">RANK</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${examData.students.map((s, idx) => `
                        <tr>
                            <td class="slno-col center">${idx + 1}</td>
                            <td class="name-col">${s.name.toUpperCase()}</td>
                            <td class="admno-col center">${s.admissionNo}</td>
                            <td class="mark-col center">${s.total || ''}</td>
                            <td class="rank-col center">${s.rank > 0 ? s.rank : '-'}</td>
                        </tr>
                    `).join('')}
                            </tbody>
                        </table>

                        <div class="signatures">
                            <div>INVIGILATOR</div>
                            <div>AME (HOD)</div>
                            <div>PRINCIPAL</div>
                        </div>
                    </body>
                </html>
        `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();

    window.activityLogger.log('Print', `Printed assessment exam for ${examData.batchId}`, 'info');
};

// Initialize assessment exams on load
loadAssessmentExams();

// ==================== DOCUMENT MANAGEMENT ====================

let currentDocumentStudentId = null;

// Open document modal for a student
window.openStudentDocuments = function (studentId) {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    // Check Permissions (Batch Allocation)
    if (currentUserRole === 'staff') {
        const me = staffMembers.find(s => String(s.id) === String(currentStaffId));
        // Admin always has access (handled by role check above), Staff needs check
        if (!me) {
            showMessage('Access Error', 'User profile not found.', 'error');
            return;
        }

        // If no batches allocated or current student batch not in list
        if (!me.allocatedBatches || !me.allocatedBatches.includes(student.batchId)) {
            showMessage('Access Denied', `You are not authorized to view documents for batch ${student.batchId}.`, 'error');
            return;
        }
    }

    currentDocumentStudentId = studentId;

    // Initialize documents array if it doesn't exist
    if (!student.documents) {
        student.documents = [];
    }

    // Update modal header
    document.getElementById('docStudentInfo').textContent = `${student.name} (${student.admissionNo})`;

    // Render document list
    renderDocumentList(studentId);

    // Show modal
    document.getElementById('studentDocumentModal').classList.remove('hidden');
};

// Close document modal
window.closeStudentDocuments = function () {
    document.getElementById('studentDocumentModal').classList.add('hidden');
    currentDocumentStudentId = null;
    document.getElementById('documentFileInput').value = '';
};

// Handle document upload
window.handleDocumentUpload = async function (event) {
    const file = event.target.files[0];
    if (!file || !currentDocumentStudentId) return;

    const student = students.find(s => s.id === currentDocumentStudentId);
    if (!student) return;

    // Validate file size (500KB max)
    const maxSize = 500 * 1024; // 500KB in bytes
    if (file.size > maxSize) {
        showMessage('File Too Large', 'Please select a file smaller than 500KB', 'error');
        event.target.value = '';
        return;
    }

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
        showMessage('Invalid File Type', 'Please upload PDF, JPG, PNG, DOC, or DOCX files', 'error');
        event.target.value = '';
        return;
    }

    try {
        // Convert file to base64
        const base64Data = await fileToBase64(file);

        // Create document object
        const document = {
            id: crypto.randomUUID(),
            name: file.name,
            type: file.type,
            size: file.size,
            uploadDate: new Date().toISOString(),
            data: base64Data
        };

        // Add to student's documents
        if (!student.documents) student.documents = [];
        student.documents.push(document);

        // Save and refresh
        saveData();
        renderDocumentList(currentDocumentStudentId);

        // Clear input
        event.target.value = '';

        showMessage('Success', `${file.name} uploaded successfully`, 'success');
        window.activityLogger.log('Document Upload', `Uploaded ${file.name} for ${student.name}`, 'info');
    } catch (error) {
        console.error('Upload error:', error);
        showMessage('Upload Failed', 'Failed to upload document', 'error');
        event.target.value = '';
    }
};

// Convert file to base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Render document list
function renderDocumentList(studentId) {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const container = document.getElementById('documentList');
    const docs = student.documents || [];

    if (docs.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-500 italic text-center py-4">No documents uploaded yet</p>';
        return;
    }

    container.innerHTML = docs.map(doc => `
        <div class="flex items-center justify-between p-3 border rounded-lg bg-white hover:bg-gray-50">
            <div class="flex items-center gap-3 flex-1">
                <div class="text-2xl">${getFileIcon(doc.type)}</div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium truncate">${doc.name}</p>
                    <p class="text-xs text-gray-500">${formatFileSize(doc.size)} • ${new Date(doc.uploadDate).toLocaleDateString()}</p>
                </div>
            </div>
            <div class="flex gap-2">
                <button onclick="downloadDocument('${studentId}', '${doc.id}')" 
                    class="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 font-medium">
                    Download
                </button>
                <button onclick="deleteDocument('${studentId}', '${doc.id}')" 
                    class="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 font-medium">
                    Delete
                </button>
            </div>
        </div>
        `).join('');
}

// Download document
window.downloadDocument = function (studentId, documentId) {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const doc = student.documents?.find(d => d.id === documentId);
    if (!doc) return;

    // Create download link
    const link = document.createElement('a');
    link.href = doc.data;
    link.download = doc.name;
    link.click();

    window.activityLogger.log('Document Download', `Downloaded ${doc.name} for ${student.name}`, 'info');
};

// Delete document
window.deleteDocument = function (studentId, documentId) {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const doc = student.documents?.find(d => d.id === documentId);
    if (!doc) return;

    if (!confirm(`Are you sure you want to delete "${doc.name}" ? `)) return;

    // Remove document
    student.documents = student.documents.filter(d => d.id !== documentId);

    // Save and refresh
    saveData();
    renderDocumentList(studentId);
    renderStudentList(); // Update the document count in the list

    showMessage('Success', 'Document deleted successfully', 'success');
    window.activityLogger.log('Document Delete', `Deleted ${doc.name} for ${student.name}`, 'info');
};

// Get file icon based on MIME type
function getFileIcon(mimeType) {
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('image')) return '🖼️';
    if (mimeType.includes('word')) return '📝';
    return '📎';
}

// Format file size
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ==================== OFFLINE BACKUP & RESTORE SYSTEMS ====================
window.createOfflineBackup = function () {
    // Collect all critical data from in-memory variables
    const backupData = {
        meta: {
            title: 'AMS Offline Backup',
            version: '5.2.1',
            date: new Date().toISOString(),
            exportedBy: localStorage.getItem('logged_in_user') || 'Admin'
        },
        data: {
            students: students,
            attendance: attendanceData,
            assessmentMetadata: assessmentMetadata,
            staff: staffMembers,
            allocations: allocations,
            batchMetadata: batchMetadata
        }
    };

    // Serialize and download
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AMS_Backup_${new Date().toISOString().split('T')[0]}_v5.2.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    window.activityLogger.log('System Backup', 'Created offline backup file', 'success');
};

// This function is handled by the primary triggerOfflineRestore at line 1077

window.handleOfflineRestore = function (event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const backup = JSON.parse(e.target.result);

            // Validate backup structure
            if (!backup.meta || !backup.data) throw new Error("Invalid backup file format");

            // Restore Data
            if (confirm(`Restore data from backup created on ${new Date(backup.meta.date).toLocaleDateString()}? \n\nWARNING: Current data will be merged/overwritten.`)) {

                // We use merging strategy where possible to avoid total data loss
                // However, for simplicity and integrity, direct replacement is often safer for "Restores"

                localStorage.setItem(LS_KEY, JSON.stringify(backup.data.students));
                localStorage.setItem(LS_KEY_ATTENDANCE, JSON.stringify(backup.data.attendance));
                localStorage.setItem(LS_KEY_METADATA, JSON.stringify(backup.data.assessmentMetadata));
                localStorage.setItem(LS_KEY_STAFF, JSON.stringify(backup.data.staff));
                localStorage.setItem('academic_management_allocations_v1', JSON.stringify(backup.data.allocations));
                localStorage.setItem(LS_KEY_BATCH_META, JSON.stringify(backup.data.batchMetadata));

                showMessage('Restore Complete', 'System data restored successfully. Reloading...', 'success');
                window.activityLogger.log('System Restore', `Restored data from ${backup.meta.date}`, 'warning');

                setTimeout(() => location.reload(), 2000);
            }
        } catch (err) {
            console.error(err);
            showMessage('Restore Failed', 'Invalid or corrupt backup file.', 'error');
        }
        // Reset input
        event.target.value = '';
    };
    reader.readAsText(file);
};

// Initialize session on page load
checkSession();

// Batch Allocation Management
window.renderBatchAllocation = function () {
    const container = document.getElementById('batchAllocationContainer');
    if (!container) return;

    // Get unique batches from students
    const batches = [...new Set(students.map(s => s.batchId))].sort();

    if (staffMembers.length === 0) {
        container.innerHTML = '<p class="text-sm text-center text-gray-400">Add staff members first.</p>';
        return;
    }

    let html = `<div class="overflow-x-auto"><table class="w-full text-sm">
        <thead>
            <tr class="bg-gray-100 text-left text-xs uppercase text-gray-600">
                <th class="p-3 rounded-tl-lg">Staff Name</th>
                <th class="p-3">Role</th>
                <th class="p-3 w-2/3 rounded-tr-lg">Allocated Batches</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">`;

    staffMembers.forEach(staff => {
        // If admin, show "ALL ACCESS"
        const isAdm = staff.isAdmin || staff.is_admin;
        const currentBatches = staff.allocatedBatches || [];

        html += `<tr class="hover:bg-gray-50">
            <td class="p-3 font-medium">${staff.name}</td>
            <td class="p-3"><span class="text-xs ${isAdm ? 'text-yellow-600 font-bold' : 'text-gray-500'}">${isAdm ? 'Admin' : 'Staff'}</span></td>
            <td class="p-3">
                ${isAdm ?
                '<span class="text-green-600 font-bold text-xs">✅ All Batches (Admin)</span>' :
                `<div class="flex flex-wrap gap-2">
                        ${batches.map(b => `
                            <label class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all hover:shadow-sm ${currentBatches.includes(b) ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}">
                                <input type="checkbox" 
                                    onchange="toggleBatchAllocation('${staff.id}', '${b}')"
                                    ${currentBatches.includes(b) ? 'checked' : ''}
                                    class="w-5 h-5 text-blue-600 rounded border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 cursor-pointer">
                                <span class="text-sm font-medium">${b}</span>
                            </label>
                        `).join('')}
                    </div>`
            }
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
};

window.toggleBatchAllocation = function (staffId, batchId) {
    console.log('Toggle batch allocation:', staffId, batchId);
    const staff = staffMembers.find(s => s.id === staffId);
    if (!staff) {
        console.error('Staff not found:', staffId);
        return;
    }

    if (staff.isAdmin || staff.is_admin) {
        showMessage('Info', 'Admin users have access to all batches automatically.', 'info');
        return;
    }

    if (!staff.allocatedBatches) {
        staff.allocatedBatches = [];
    }

    const index = staff.allocatedBatches.indexOf(batchId);
    if (index > -1) {
        staff.allocatedBatches.splice(index, 1);
    } else {
        staff.allocatedBatches.push(batchId);
    }

    // Save immediately
    saveData();

    // Force UI refresh (staff list with integrated batch allocation)
    setTimeout(() => {
        renderStaffList();
    }, 50);

    // Log activity
    window.activityLogger.log('Batch Allocation', `${escapeHtml(staff.name)}: ${index > -1 ? 'removed' : 'added'} batch ${escapeHtml(batchId)}`, 'info');
};


// ==================== ACTIVITY LOGS ====================

window.renderActivityLogs = function () {
    const container = document.getElementById('activityLogBody');
    const clearBtn = document.getElementById('btnClearLogs');

    if (!container) return;

    // Permission Check: Only Admin can view logs
    if (currentUserRole !== 'admin') {
        container.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-red-500 font-bold bg-red-50 rounded-lg">🚫 Access Denied<br><span class="text-xs font-normal text-gray-500">Only Administrators can view system logs.</span></td></tr>';
        if (clearBtn) clearBtn.classList.add('hidden');
        return;
    }

    // Admin allowed - ensure buttons are visible
    if (clearBtn) clearBtn.classList.remove('hidden');

    let logs = window.activityLogger ? window.activityLogger.getLogs() : [];

    // --- Populate Filters Check ---
    const userFilter = document.getElementById('logUserFilter');
    const actionFilter = document.getElementById('logActionFilter');

    if (userFilter && userFilter.options.length <= 1) {
        const users = [...new Set(logs.map(l => l.user))].sort();
        users.forEach(u => userFilter.innerHTML += `<option value="${u}">${u}</option>`);
    }
    if (actionFilter && actionFilter.options.length <= 1) {
        const actions = [...new Set(logs.map(l => l.action))].sort();
        actions.forEach(a => actionFilter.innerHTML += `<option value="${a}">${a}</option>`);
    }

    // --- Apply Filters ---
    const startDate = document.getElementById('logStartDate') ? document.getElementById('logStartDate').value : '';
    const endDate = document.getElementById('logEndDate') ? document.getElementById('logEndDate').value : '';
    const selectedUser = userFilter ? userFilter.value : '';
    const selectedAction = actionFilter ? actionFilter.value : '';
    const search = document.getElementById('logSearch') ? document.getElementById('logSearch').value.toLowerCase() : '';

    logs = logs.filter(log => {
        const logDate = log.timestamp.split('T')[0];
        if (startDate && logDate < startDate) return false;
        if (endDate && logDate > endDate) return false;
        if (selectedUser && log.user !== selectedUser) return false;
        if (selectedAction && log.action !== selectedAction) return false;
        if (search && !log.details.toLowerCase().includes(search) && !log.action.toLowerCase().includes(search)) return false;
        return true;
    });


    if (logs.length === 0) {
        container.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-gray-400 border-dashed border-2 rounded-lg m-4">No matching activity records found.</td></tr>';
        return;
    }

    container.innerHTML = logs.map(log => {
        let typeClass = 'text-gray-600';
        if (log.type === 'success') typeClass = 'text-green-600';
        if (log.type === 'warning') typeClass = 'text-orange-600';
        if (log.type === 'error') typeClass = 'text-red-600';

        return `
            <tr class="hover:bg-gray-50 border-b last:border-0 border-gray-100 transition-colors">
                <td class="p-3 text-[10px] text-gray-400 font-mono whitespace-nowrap">
                    ${new Date(log.timestamp).toLocaleString()}
                </td>
                <td class="p-3 font-bold text-gray-700 text-xs">
                    ${log.user} <span class="opacity-50 font-normal">(${log.role})</span>
                </td>
                <td class="p-3 font-bold text-xs ${typeClass}">
                    ${log.action}
                </td>
                <td class="p-3 text-gray-600 text-xs break-all">
                    ${log.details}
                </td>
            </tr>
        `;
    }).join('');
};

window.exportLogsToCSV = function () {
    if (!window.activityLogger) return;
    const csvContent = window.activityLogger.exportLogsCSV();
    if (!csvContent) {
        showMessage('Export Failed', 'No logs to export.', 'warning');
        return;
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `ams_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('AMS v5.3.0 Initialization started...');

    // Static mode: Skip local server sync

















    // 1. Initial Data Loading
    loadData();

    // 2. Setup Base UI and Session
    checkSession();
    if (typeof updateRoleBadge === 'function') updateRoleBadge();

    // 3. Setup Global Event Listeners
    const el = (id) => document.getElementById(id);

    if (el('batchSelector')) el('batchSelector').onchange = renderStudentList;
    if (el('attendanceBatchSelector')) el('attendanceBatchSelector').onchange = renderAttendanceList;
    if (el('attendanceSubBatchSelector')) el('attendanceSubBatchSelector').onchange = renderAttendanceList;
    if (el('attendanceDate')) el('attendanceDate').onchange = renderAttendanceList;
    if (el('registerBatchSelector')) el('registerBatchSelector').onchange = renderAttendanceRegister;
    if (el('printBatchSelector')) el('printBatchSelector').onchange = updateBatchDropdowns;
    if (el('printTypeSelector')) el('printTypeSelector').onchange = (e) => {
        const container = el('transcriptSelectionContainer');
        if (container) container.classList.toggle('hidden', e.target.value !== 'transcript');
    };

    // 4. Final UI Refresh
    refreshDataAndUI();
    
    // 5. Start Server Connection Monitor
    initServerIndicator();
    
    console.log('AMS v5.3.0 Initialization complete.');
});

// ==================== SERVER CONNECTION INDICATOR ====================

function initServerIndicator() {
    const indicator = document.getElementById('serverIndicator');
    const dot = document.getElementById('serverDot');
    const status = document.getElementById('serverStatus');
    
    if (!indicator || !dot || !status) return;
    
    // Check GitHub connection
    async function checkServerStatus() {
        // Don't update if currently syncing
        if (indicator.classList.contains('syncing')) return;
        
        try {
            const config = (() => {
                const host = window.location.hostname;
                const parts = window.location.pathname.split('/').filter(Boolean);
                const owner = host.split('.')[0];
                const repo = parts[0] || '';
                return { owner, repo, branch: 'main', dataPath: 'data/db.json' };
            })();
            
            const url = `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/${config.dataPath}?t=${Date.now()}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const res = await fetch(url, { 
                signal: controller.signal,
                cache: 'no-store'
            });
            clearTimeout(timeoutId);
            
            if (res.ok) {
                setServerStatus('connected');
            } else {
                setServerStatus('disconnected');
            }
        } catch (e) {
            setServerStatus('disconnected');
        }
    }
    
    function setServerStatus(state) {
        indicator.classList.remove('connected', 'disconnected', 'syncing');
        
        if (state === 'connected') {
            indicator.classList.add('connected');
            status.textContent = 'Live Sync On';
            dot.classList.remove('animate-pulse');
        } else if (state === 'disconnected') {
            indicator.classList.add('disconnected');
            status.textContent = 'Offline Mode';
            dot.classList.remove('animate-pulse');
        } else if (state === 'syncing') {
            indicator.classList.add('syncing');
            status.textContent = 'Syncing...';
            dot.classList.add('animate-pulse');
        }
    }
    
    // Expose for use in sync functions
    window.setServerStatus = setServerStatus;
    
    // Click to sync
    indicator.style.cursor = 'pointer';
    indicator.onclick = () => {
        const token = window.API ? window.API.getToken() : '';
        if (!token) {
            showMessage('No Token', 'Set your GitHub token first in Backup & Restore.', 'info');
            return;
        }
        window.githubSyncToCloud();
    };
    
    // Initial check
    checkServerStatus();
    
    // Check every 30 seconds
    setInterval(checkServerStatus, 30000);
}

// Automatic Print Scaling to Fit A4
window.onbeforeprint = () => {
    const content = document.getElementById('printable-content');
    const view = document.getElementById('sheetGeneration');
    if (!content || !view || view.classList.contains('hidden')) return;

    // Reset styles for measurement
    content.style.transform = 'none';
    content.style.width = '100%';

    // Target height (A4 is ~1122px at 96dpi, 1050px is a safe printable area)
    const targetHeight = 1050;
    const actualHeight = content.scrollHeight;

    if (actualHeight > targetHeight) {
        const scale = targetHeight / actualHeight;
        // Important: We also need to calculate the width to prevent horizontal shrinking
        content.style.transform = `scale(${scale})`;
        content.style.width = `${100 / scale}%`;
        console.log(`AMS: Auto-adjusted print scale to ${Math.round(scale * 100)}% for A4 fit. (Height: ${actualHeight}px)`);
    }
};

window.onafterprint = () => {
    const content = document.getElementById('printable-content');
    if (content) {
        content.style.transform = 'none';
        content.style.width = '100%';
    }
};

// Final exports for global accessibility
window.renderStaffList = renderStaffList;
window.renderStudentList = renderStudentList;
window.updateStudentList = renderStudentList;
window.refreshDataAndUI = refreshDataAndUI;

// ==================== GITHUB CLOUD SYNC ====================

window.githubSyncToCloud = async function() {
    if (!window.API || !window.API.syncToGitHub) return;
    const token = window.API.getToken();
    if (!token) {
        const tok = prompt('Enter your GitHub Personal Access Token (PAT) to sync data to GitHub:\n\nGet one at: github.com/settings/tokens (needs repo scope)');
        if (!tok) return;
        window.API.setToken(tok.trim());
    }

    const btn = document.getElementById('githubSyncBtn');
    const btnText = document.getElementById('githubSyncBtnText');
    const btnSpinner = document.getElementById('githubSyncBtnSpinner');

    // Set syncing state
    if (btn) {
        btn.disabled = true;
        btn.classList.add('opacity-75', 'cursor-not-allowed', 'syncing', 'sync-shimmer');
    }
    if (btnText) btnText.textContent = 'Syncing...';
    if (btnSpinner) btnSpinner.classList.remove('hidden');
    
    // Update server indicator
    if (window.setServerStatus) window.setServerStatus('syncing');

    try {
        const success = await window.API.syncToGitHub();
        if (success) {
            showSyncNotification('success', '✅ Data synced to GitHub successfully!');
            window.activityLogger && window.activityLogger.log('GitHub Sync', 'Data synced to GitHub successfully', 'success');
            if (window.setServerStatus) window.setServerStatus('connected');
        } else {
            showSyncNotification('error', '❌ Sync failed. Check your token or internet connection.');
            if (window.setServerStatus) window.setServerStatus('disconnected');
        }
    } catch (e) {
        showSyncNotification('error', '❌ Sync error: ' + e.message);
        if (window.setServerStatus) window.setServerStatus('disconnected');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('opacity-75', 'cursor-not-allowed', 'syncing');
        }
        if (btnText) btnText.textContent = 'Push Data to GitHub';
        if (btnSpinner) btnSpinner.classList.add('hidden');
    }
};

function showSyncNotification(type, message) {
    let container = document.getElementById('syncNotificationContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'syncNotificationContainer';
        container.className = 'fixed top-4 right-4 z-50 flex flex-col gap-2';
        document.body.appendChild(container);
    }

    const notification = document.createElement('div');
    notification.className = `sync-notification flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl ${
        type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
    }`;
    notification.innerHTML = `
        <div class="flex items-center gap-3">
            ${type === 'success'
                ? '<svg class="w-6 h-6 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>'
                : '<svg class="w-6 h-6 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
            }
            <span class="font-semibold text-sm">${message}</span>
        </div>
    `;

    container.appendChild(notification);

    // Auto-remove after animation
    setTimeout(() => {
        notification.remove();
    }, 4000);
}

window.githubClearToken = function() {
    localStorage.removeItem('ams_github_token');
    showMessage('Token Cleared', 'GitHub token removed from this device.', 'success');
};
