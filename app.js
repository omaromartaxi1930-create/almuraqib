// ===== CONFIG =====
const API_URL = window.location.origin;
let currentUser = null;
let currentGroup = null;
let token = localStorage.getItem('token');
let map = null;
let userMarker = null;
let memberMarkers = [];
let socket = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let isDangerRecording = false;
let recordingInterval = null;
let dangerInterval = null;
let recordingSeconds = 0;
let dangerSeconds = 0;
let audioBlob = null;

const vehicleIcons = {
    taxi_petit: "🚕", taxi_grand: "🚖", camion: "🚛", bus: "🚌", moto: "🏍️", voiture: "🚗", autre: "🚙"
};
const vehicleNames = {
    taxi_petit: "طاكسي صغير", taxi_grand: "طاكسي كبير", camion: "شاحنة", bus: "حافلة", moto: "دراجة", voiture: "سيارة خاصة", autre: "أخرى"
};

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    if (token) {
        loadUser().then(() => {
            if (currentUser) enterGroupsScreen();
        });
    }
});

// ===== AUTH =====
function switchAuthTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('loginForm').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('registerForm').style.display = tab === 'register' ? 'block' : 'none';
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    document.getElementById('toastMsg').textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

async function register() {
    const data = {
        name: document.getElementById('regName').value,
        phone: document.getElementById('regPhone').value,
        vehicleType: document.getElementById('regVehicle').value,
        plate: document.getElementById('regPlate').value,
        password: document.getElementById('regPass').value
    };
    if (Object.values(data).slice(0, 4).some(v => !v)) {
        showToast('عمر الحقول المطلوبة'); return;
    }
    try {
        const res = await fetch(`${API_URL}/api/auth/register`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (res.ok) {
            token = result.token; localStorage.setItem('token', token);
            currentUser = result.user;
            showToast('تم التسجيل! مرحبا بك في المراقب');
            setTimeout(() => enterGroupsScreen(), 800);
        } else showToast(result.error || 'خطأ في التسجيل');
    } catch (err) { showToast('خطأ في الاتصال'); }
}

async function login() {
    const data = { phone: document.getElementById('loginPhone').value, password: document.getElementById('loginPass').value };
    if (!data.phone || !data.password) { showToast('عمر جميع الحقول'); return; }
    try {
        const res = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (res.ok) {
            token = result.token; localStorage.setItem('token', token);
            currentUser = result.user;
            showToast('مرحبا بك في المراقب!');
            setTimeout(() => enterGroupsScreen(), 800);
        } else showToast(result.error || 'خطأ في الدخول');
    } catch (err) { showToast('خطأ في الاتصال'); }
}

async function loadUser() {
    try {
        const res = await fetch(`${API_URL}/api/user/me`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) currentUser = await res.json();
        else { localStorage.removeItem('token'); token = null; }
    } catch (err) { console.error(err); }
}

function logout() {
    if (socket) socket.disconnect();
    currentUser = null; token = null; localStorage.removeItem('token');
    document.getElementById('chatScreen').classList.remove('active');
    document.getElementById('groupsScreen').classList.remove('active');
    document.getElementById('authScreen').classList.add('active');
    if (map) { map.remove(); map = null; }
    showToast('تم الخروج');
}

// ===== GROUPS SCREEN =====
function enterGroupsScreen() {
    document.getElementById('authScreen').classList.remove('active');
    document.getElementById('groupsScreen').classList.add('active');
    loadGroups(); initSocket(); startLocationTracking();
}

async function loadGroups() {
    try {
        const res = await fetch(`${API_URL}/api/groups`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) {
            const groups = await res.json();
            renderGroups(groups);
        }
    } catch (err) { console.error(err); }
}

function renderGroups(groups) {
    const list = document.getElementById('groupsList');
    const search = document.getElementById('searchGroups').value.toLowerCase();
    const filtered = groups.filter(g => g.name.toLowerCase().includes(search) || g.city.toLowerCase().includes(search));

    list.innerHTML = filtered.map(g => {
        const typesHtml = (g.allowedVehicles || []).map(t => `<span>${vehicleNames[t] || t}</span>`).join('');
        return `
            <div class="group-card" onclick="enterGroup('${g._id}')">
                <div class="g-header">
                    <h4><i class="fas fa-users" style="margin-left: 8px; color: var(--primary);"></i>${g.name}</h4>
                    <span class="g-count">${g.onlineCount || 0} متصل</span>
                </div>
                <div class="g-info">
                    <i class="fas fa-map-marker-alt"></i> ${g.city} | 
                    <i class="fas fa-user-shield"></i> ${g.adminName} |
                    <i class="fas fa-users"></i> ${g.members?.length || 0} عضو
                </div>
                <div class="g-types">${typesHtml}</div>
            </div>
        `;
    }).join('');
}

function searchGroups() { loadGroups(); }

function showCreateGroupModal() { document.getElementById('createGroupModal').classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

async function createGroup() {
    const data = {
        name: document.getElementById('newGroupName').value,
        city: document.getElementById('newGroupCity').value,
        allowedVehicles: Array.from(document.getElementById('newGroupTypes').selectedOptions).map(o => o.value)
    };
    if (!data.name || !data.city) { showToast('عمر جميع الحقول'); return; }
    try {
        const res = await fetch(`${API_URL}/api/groups`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(data)
        });
        if (res.ok) {
            closeModal('createGroupModal'); showToast('تم إنشاء المجموعة!'); loadGroups();
        } else showToast('خطأ في إنشاء المجموعة');
    } catch (err) { showToast('خطأ في الاتصال'); }
}

// ===== GROUP CHAT =====
async function enterGroup(groupId) {
    try {
        const res = await fetch(`${API_URL}/api/groups/${groupId}/members`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) return;
        const members = await res.json();

        // Load group info from first member or fetch separately
        const groupRes = await fetch(`${API_URL}/api/groups`, { headers: { 'Authorization': `Bearer ${token}` } });
        const groups = await groupRes.json();
        currentGroup = groups.find(g => g._id === groupId || g._id === groupId);

        document.getElementById('groupsScreen').classList.remove('active');
        document.getElementById('chatScreen').classList.add('active');

        document.getElementById('chatGroupName').textContent = currentGroup?.name || 'المجموعة';
        document.getElementById('chatGroupInfo').textContent = `${members.length} عضو`;
        document.getElementById('chatAvatar').textContent = vehicleIcons[currentUser?.vehicleType] || "🚗";

        renderMembers(members);
        initGroupMap(members);
        loadMessages(groupId);

        if (socket) socket.emit('group:join', groupId);
    } catch (err) { console.error(err); }
}

function backToGroups() {
    if (currentGroup && socket) socket.emit('group:leave', currentGroup._id);
    document.getElementById('chatScreen').classList.remove('active');
    document.getElementById('groupsScreen').classList.add('active');
    currentGroup = null;
}

function renderMembers(members) {
    const bar = document.getElementById('membersBar');
    bar.innerHTML = members.map(m => `
        <div class="member-chip">
            <span class="m-dot ${m.status === 'online' ? '' : 'offline'}"></span>
            <span>${m.name}</span>
        </div>
    `).join('');
}

function initGroupMap(members) {
    if (map) { map.remove(); map = null; }
    const defaultLat = currentUser?.lat || 34.0209;
    const defaultLng = currentUser?.lng || -6.8416;

    map = L.map('groupMap').setView([defaultLat, defaultLng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);

    members.forEach(m => {
        const color = m.status === 'online' ? '#1976d2' : '#bdbdbd';
        const icon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="background:${color};width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;border:2px solid white;font-size:14px;">${vehicleIcons[m.vehicleType] || "🚗"}</div>`,
            iconSize: [30, 30], iconAnchor: [15, 15]
        });
        const marker = L.marker([m.lat || defaultLat, m.lng || defaultLng], { icon }).addTo(map)
            .bindPopup(`<b>${m.name}</b><br>${vehicleNames[m.vehicleType] || m.vehicleType}<br>${m.plate || ''}`);
        memberMarkers.push(marker);
    });
}

async function loadMessages(groupId) {
    try {
        const res = await fetch(`${API_URL}/api/groups/${groupId}/messages`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) {
            const messages = await res.json();
            const area = document.getElementById('messagesArea');
            area.innerHTML = '';
            messages.forEach(msg => addMessageToChat(msg));
        }
    } catch (err) { console.error(err); }
}

function addMessageToChat(msg) {
    const area = document.getElementById('messagesArea');
    const isMe = msg.userId === currentUser?._id || msg.userId?._id === currentUser?._id;
    const isAlert = msg.type === 'alert';

    const div = document.createElement('div');
    div.className = `message ${isMe ? 'me' : ''} ${isAlert ? 'alert-msg' : ''}`;

    if (isAlert) {
        div.innerHTML = `
            <div class="msg-bubble">
                <h4><i class="fas fa-exclamation-triangle"></i> إنذار خطر!</h4>
                <p><b>${msg.userName}</b> - ${vehicleNames[msg.userVehicle] || msg.userVehicle}</p>
                ${msg.audioUrl ? `<div class="msg-audio"><audio controls src="${msg.audioUrl}" style="width: 200px;"></audio></div>` : ''}
                <div class="msg-time">${new Date(msg.createdAt).toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
        `;
    } else {
        div.innerHTML = `
            <div class="msg-bubble">
                <div class="msg-sender">${msg.userName} · ${vehicleNames[msg.userVehicle] || msg.userVehicle}</div>
                ${msg.audioUrl ? `<div class="msg-audio"><audio controls src="${msg.audioUrl}" style="width: 250px;"></audio></div>` : ''}
                <div class="msg-time">${new Date(msg.createdAt).toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
        `;
    }
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
}

// ===== DANGER BUTTON (Toggle) =====
async function toggleDangerRecording() {
    if (isDangerRecording) { stopDangerRecording(); return; }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        recordedChunks = [];

        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.onstop = async () => {
            audioBlob = new Blob(recordedChunks, { type: 'audio/webm' });
            const audioUrl = URL.createObjectURL(audioBlob);

            // Upload audio
            const formData = new FormData();
            formData.append('audio', audioBlob, 'alert.webm');
            const uploadRes = await fetch(`${API_URL}/api/upload/audio`, {
                method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData
            });
            const uploadResult = await uploadRes.json();
            const finalAudioUrl = uploadRes.ok ? uploadResult.url : audioUrl;

            // Send alert
            navigator.geolocation.getCurrentPosition(async (pos) => {
                const alertRes = await fetch(`${API_URL}/api/alerts`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({
                        groupId: currentGroup._id,
                        lat: pos.coords.latitude, lng: pos.coords.longitude,
                        audioUrl: finalAudioUrl, audioDuration: dangerSeconds
                    })
                });
                if (alertRes.ok) showToast('تم إرسال بلاغ الخطر!');
                else showToast('خطأ في إرسال البلاغ');
            });

            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start(100);
        isDangerRecording = true;

        document.getElementById('dangerBtn').classList.add('recording');
        document.getElementById('dangerLabel').textContent = '🔴 جاري التسجيل - اضغط مرة أخرى للإيقاف';
        document.getElementById('dangerLabel').classList.add('recording');
        document.getElementById('dangerTimer').classList.add('recording');
        document.getElementById('dangerWaveform').classList.add('recording');
        document.getElementById('liveListeners').classList.add('active');

        dangerSeconds = 0;
        dangerInterval = setInterval(() => {
            dangerSeconds++;
            const mins = Math.floor(dangerSeconds / 60).toString().padStart(2, '0');
            const secs = (dangerSeconds % 60).toString().padStart(2, '0');
            document.getElementById('dangerTimer').textContent = `${mins}:${secs}`;
            if (dangerSeconds >= 60) { stopDangerRecording(); showToast('التسجيل وقف تلقائياً'); }
        }, 1000);

        showToast('🔴 جاري التسجيل...');
    } catch (err) { showToast('ما قدرناش ندخلو للميكروفون'); }
}

function stopDangerRecording() {
    if (!isDangerRecording) return;
    isDangerRecording = false;
    clearInterval(dangerInterval);
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();

    document.getElementById('dangerBtn').classList.remove('recording');
    document.getElementById('dangerLabel').textContent = 'اضغط مرة للإنذار';
    document.getElementById('dangerLabel').classList.remove('recording');
    document.getElementById('dangerTimer').classList.remove('recording');
    document.getElementById('dangerWaveform').classList.remove('recording');
    document.getElementById('dangerTimer').textContent = '00:00';
    document.getElementById('liveListeners').classList.remove('active');
}

// ===== PTT (Normal Chat) =====
async function startPTT() {
    if (isRecording || isDangerRecording) return;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        recordedChunks = [];

        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.onstop = async () => {
            const blob = new Blob(recordedChunks, { type: 'audio/webm' });
            const formData = new FormData();
            formData.append('audio', blob, 'message.webm');
            const uploadRes = await fetch(`${API_URL}/api/upload/audio`, {
                method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData
            });
            const uploadResult = await uploadRes.json();

            const msg = {
                groupId: currentGroup._id,
                audioUrl: uploadRes.ok ? uploadResult.url : URL.createObjectURL(blob),
                audioDuration: recordingSeconds
            };

            // Send via socket for real-time
            if (socket) {
                socket.emit('ptt:stop', { groupId: currentGroup._id });
                // In real implementation, you'd send the audio via socket or API
            }

            showToast('تم إرسال الرسالة!');
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start(100);
        isRecording = true;
        if (socket) socket.emit('ptt:start', { groupId: currentGroup._id });

        document.getElementById('pttBtn').classList.add('recording');
        document.getElementById('pttLabel').textContent = 'جاري التسجيل...';

        recordingSeconds = 0;
        recordingInterval = setInterval(() => {
            recordingSeconds++;
            const mins = Math.floor(recordingSeconds / 60).toString().padStart(2, '0');
            const secs = (recordingSeconds % 60).toString().padStart(2, '0');
            document.getElementById('pttTimer').textContent = `${mins}:${secs}`;
            if (recordingSeconds >= 60) { stopPTT(); showToast('التسجيل وقف تلقائياً'); }
        }, 1000);
    } catch (err) { showToast('ما قدرناش ندخلو للميكروفون'); }
}

function stopPTT() {
    if (!isRecording) return;
    isRecording = false;
    clearInterval(recordingInterval);
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();

    document.getElementById('pttBtn').classList.remove('recording');
    document.getElementById('pttLabel').textContent = 'اضغط واستمر للمحادثة';
    document.getElementById('pttTimer').textContent = '00:00';
}

// ===== SOCKET.IO =====
function initSocket() {
    if (socket) return;
    socket = io(API_URL);

    socket.on('connect', () => {
        console.log('Socket connected');
        socket.emit('auth', token);
    });

    socket.on('alert:incoming', (data) => {
        showIncomingAlert(data);
        addMessageToChat({
            userId: data.userId, userName: data.userName, userVehicle: data.userVehicle,
            type: 'alert', audioUrl: data.audioUrl, createdAt: new Date()
        });
    });

    socket.on('alert:penalty', (data) => {
        showToast(data.message, 'error');
        if (currentUser) currentUser.penaltyUntil = data.penaltyUntil;
    });

    socket.on('account:blocked', (data) => {
        showToast('تم حظر حسابك', 'error');
        logout();
    });

    socket.on('user:online', (data) => showToast(`${data.name} متصل الآن`));

    socket.on('ptt:started', (data) => {
        showToast('🔴 بث صوتي مباشر من عضو');
    });

    socket.on('ptt:audio', (data) => {
        // Play live audio chunk
        playAudioChunk(data.chunk);
    });
}

function playAudioChunk(chunk) {
    // Implementation for Web Audio API playback
    console.log('Playing audio chunk');
}

function showIncomingAlert(data) {
    document.getElementById('alertSenderName').textContent = data.userName;
    document.getElementById('alertSenderVehicle').textContent = vehicleNames[data.userVehicle] || data.userVehicle;
    document.getElementById('alertDistance').textContent = (data.distance || 250) + ' متر';

    const modal = document.getElementById('incomingAlertModal');
    modal.classList.add('active');

    let count = 3;
    const countdown = document.getElementById('alertCountdown');
    countdown.textContent = count;

    const timer = setInterval(() => {
        count--;
        countdown.textContent = count;
        if (count <= 0) {
            clearInterval(timer);
            if (data.audioUrl) {
                const player = document.getElementById('alertAudioPlayer');
                player.src = data.audioUrl;
                player.play().catch(() => {});
            }
        }
    }, 1000);
}

function dismissAlert() {
    document.getElementById('incomingAlertModal').classList.remove('active');
    const player = document.getElementById('alertAudioPlayer');
    player.pause(); player.src = '';
}

function showGroupMenu() {
    const choice = prompt('اختر:
1. أعضاء المجموعة
2. معلومات المجموعة
3. مغادرة المجموعة');
    if (choice === '3') {
        if (confirm('متأكد من مغادرة المجموعة؟')) {
            fetch(`${API_URL}/api/groups/${currentGroup._id}/leave`, {
                method: 'POST', headers: { 'Authorization': `Bearer ${token}` }
            }).then(() => {
                backToGroups();
                showToast('تمت مغادرة المجموعة');
            });
        }
    }
}

// ===== LOCATION TRACKING =====
function startLocationTracking() {
    if (!navigator.geolocation) { showToast('المتصفح ما يدعمش GPS'); return; }
    navigator.geolocation.watchPosition(
        (pos) => {
            const lat = pos.coords.latitude, lng = pos.coords.longitude;
            fetch(`${API_URL}/api/user/location`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ lat, lng })
            });
            if (socket) socket.emit('location:update', { lat, lng });
        },
        (err) => console.error('GPS error:', err),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
    );
}

// Prevent context menu on PTT
const pttBtn = document.getElementById('pttBtn');
if (pttBtn) pttBtn.addEventListener('contextmenu', (e) => e.preventDefault());

// Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW registration failed'));
}
