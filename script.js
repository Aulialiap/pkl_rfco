const locationName = sessionStorage.getItem('selectedLocation');
const systemsData = {};
let locationData = null;
let esp1Connected = false;
let esp2Connected = false;
let statusPollingInterval = null; // Variabel untuk menyimpan interval polling

const POLLING_INTERVAL = 3000; // Poll status setiap 3 detik

document.addEventListener('DOMContentLoaded', function () {
    if (!locationName) {
        showNotification('Lokasi tidak ditemukan', 'error');
        setTimeout(() => goBack(), 2000);
        return;
    }
    loadLocationData();
});

// Memuat data konfigurasi awal dari server
function loadLocationData() {
    fetch(`/api/location/${encodeURIComponent(locationName)}`)
        .then(response => response.json())
        .then(data => {
            locationData = data;
            document.getElementById('location-display').textContent = `🛠️ Kontrol Sistem GPON ${locationName.toUpperCase()}`;
            document.getElementById('location-speed').textContent = `Kapasitas : ${locationData.speed}`;
            document.getElementById('esp1-ip').value = locationData.esp1;
            document.getElementById('esp2-ip').value = locationData.esp2;

            // Inisialisasi systemsData dengan status awal
            Object.entries(locationData.systems).forEach(([k, v], i) => {
                systemsData[k] = { ...v, currentPath: 0, index: i + 1 }; // currentPath 0 = Unknown
            });

            generateSystemCards();
        })
        .catch(error => {
            console.error('Gagal memuat data lokasi:', error);
            showNotification('Gagal memuat data lokasi', 'error');
        });
}

// Membuat kartu untuk setiap sistem
function generateSystemCards() {
    const container = document.getElementById('systems-container');
    container.innerHTML = '';
    Object.entries(systemsData).forEach(([key, data]) => {
        const card = createSystemCard(key, data);
        container.appendChild(card);
    });
}

// Fungsi untuk membuat elemen kartu (tidak ada perubahan signifikan)
function createSystemCard(key, data) {
    const card = document.createElement('div');
    card.className = 'system-card';
    card.id = `system-card-${key}`;
    card.innerHTML = `
        <div class="system-header">
            <div class="system-title">
                <input type="text" value="${data.name}" onchange="updateSystemData('${key}', 'name', this.value)">
            </div>
        </div>
        <div class="port-info">
             </div>
        <div class="path-info">
            <h4>Konfigurasi Label Jalur</h4>
            <div class="path-row">
                <div class="path-label">Jalur Normal :</div>
                <input type="text" value="${data.jalur_normal}" onchange="updateSystemData('${key}', 'jalur_normal', this.value)">
            </div>
            <div class="path-row">
                <div class="path-label">Jalur Backup :</div>
                <input type="text" value="${data.jalur_backup}" onchange="updateSystemData('${key}', 'jalur_backup', this.value)">
            </div>
        </div>
        <div class="current-path">
            <div class="current-path-label">Jalur Aktif Saat Ini</div>
            <div class="current-path-value" id="current-path-${key}">Menunggu Koneksi...</div>
        </div>
        <div class="switch-controls">
            <button class="switch-button switch-path-normal" onclick="switchToPath('${key}', 1)" id="switch-normal-${key}" disabled>🔄 Jalur Normal</button>
            <button class="switch-button switch-path-backup" onclick="switchToPath('${key}', 2)" id="switch-backup-${key}" disabled>⚡ Jalur Backup</button>
        </div>`;
    return card;
}


// --- FUNGSI UTAMA UNTUK KONEKSI DAN KONTROL ---

async function connectAllESP() {
    showNotification('Mencoba menghubungkan ke Node A & B...', 'info');
    stopStatusPolling(); // Hentikan polling lama jika ada

    const ip1 = document.getElementById('esp1-ip').value.trim();
    const ip2 = document.getElementById('esp2-ip').value.trim();

    // Coba ping ke masing-masing ESP
    const [res1, res2] = await Promise.allSettled([
        connectESP('esp1', ip1),
        connectESP('esp2', ip2)
    ]);

    esp1Connected = res1.status === 'fulfilled';
    esp2Connected = res2.status === 'fulfilled';
    
    updateESPStatusLights();

    if (esp1Connected || esp2Connected) {
        showNotification('Koneksi berhasil. Memulai polling status...', 'success');
        enableAllSwitchButtons();
        startStatusPolling(); // Mulai polling status real-time
    } else {
        showNotification('Gagal terhubung ke kedua Node.', 'error');
        disableAllSwitchButtons();
        resetAllPathDisplays();
    }
}

// Fungsi untuk ping koneksi ke satu ESP
async function connectESP(name, ip) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    // Cukup cek status sistem pertama untuk verifikasi koneksi
    const url = `http://${ip}/status?system=1`;

    try {
        const response = await fetch(url, { method: 'GET', mode: 'cors', signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        clearTimeout(timeoutId);
        console.error(`Error connecting to ${name} (${ip}):`, error.message);
        throw error;
    }
}

// PERBAIKAN: Fungsi polling status real-time
async function pollAllSystemsStatus() {
    if (!esp1Connected && !esp2Connected) {
        console.log("Polling dihentikan, tidak ada ESP yang terkoneksi.");
        stopStatusPolling();
        updateESPStatusLights(); // Update UI jika koneksi tiba-tiba putus
        disableAllSwitchButtons();
        resetAllPathDisplays();
        return;
    }

    const ip1 = document.getElementById('esp1-ip').value.trim();
    const ip2 = document.getElementById('esp2-ip').value.trim();
    let connectionLost = false;

    for (const key in systemsData) {
        const sys = systemsData[key];
        const fetchPromises = [];

        if (esp1Connected) {
            fetchPromises.push(fetch(`http://${ip1}/status?system=${sys.index}`).then(res => res.ok ? res.json() : Promise.reject('Node A fail')));
        }
        if (esp2Connected) {
            fetchPromises.push(fetch(`http://${ip2}/status?system=${sys.index}`).then(res => res.ok ? res.json() : Promise.reject('Node B fail')));
        }
        
        try {
            // Mengambil status dari ESP manapun yang merespons terlebih dahulu
            const result = await Promise.any(fetchPromises);
            systemsData[key].currentPath = result.currentPath;
            updateCurrentPathDisplay(key);
        } catch (error) {
            console.error(`Gagal mendapatkan status untuk sistem ${key}:`, error);
            // Jika semua promise gagal, anggap koneksi putus
            connectionLost = true;
            systemsData[key].currentPath = 0; // Set ke unknown
            updateCurrentPathDisplay(key);
        }
    }

    // Cek ulang koneksi jika ada kegagalan polling
    if (connectionLost) {
        await checkConnectionHealth();
    }
}

// PERBAIKAN: Fungsi untuk mengirim perintah switch
async function switchToPath(key, relayNum) { // relayNum adalah 1 atau 2
    if (!esp1Connected || !esp2Connected) {
        showNotification('Kedua Node (A & B) harus online untuk melakukan switch.', 'error');
        return;
    }

    const system = systemsData[key];
    const pathType = relayNum === 1 ? 'Normal' : 'Backup';
    showNotification(`Mengalihkan sistem ${system.name} ke jalur ${pathType}...`, 'info');

    const ip1 = document.getElementById('esp1-ip').value.trim();
    const ip2 = document.getElementById('esp2-ip').value.trim();
    const systemIdx = system.index;

    try {
        // Kirim perintah ke kedua ESP secara bersamaan
        const results = await Promise.all([
            sendSwitchCommand(ip1, systemIdx, relayNum),
            sendSwitchCommand(ip2, systemIdx, relayNum)
        ]);

        showNotification(`Perintah switch untuk ${system.name} berhasil dikirim.`, 'success');
        // Tunggu sejenak lalu trigger polling untuk konfirmasi status dari sensor
        setTimeout(pollAllSystemsStatus, 1000); 
    } catch (error) {
        console.error("Switching failed:", error);
        showNotification(`Gagal mengalihkan ${system.name}. Salah satu Node tidak merespon.`, 'error');
        // Cek ulang koneksi jika ada kegagalan
        await checkConnectionHealth();
    }
}

// Helper untuk mengirim command POST
async function sendSwitchCommand(ip, systemIdx, relayNum) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`http://${ip}/switch`, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `system=${systemIdx}&relay=${relayNum}`,
        signal: controller.signal
    });

    clearTimeout(timeoutId);
    if (!response.ok) {
        throw new Error(`Failed to send command to ${ip}`);
    }
    return response.json();
}


// --- FUNGSI UTILITAS DAN UI ---

function startStatusPolling() {
    if (statusPollingInterval) clearInterval(statusPollingInterval); // Hapus interval lama
    pollAllSystemsStatus(); // Panggil sekali di awal
    statusPollingInterval = setInterval(pollAllSystemsStatus, POLLING_INTERVAL);
}

function stopStatusPolling() {
    if (statusPollingInterval) clearInterval(statusPollingInterval);
    statusPollingInterval = null;
}

// Cek konektivitas secara diam-diam untuk update status light
async function checkConnectionHealth() {
    const ip1 = document.getElementById('esp1-ip').value.trim();
    const ip2 = document.getElementById('esp2-ip').value.trim();
    
    try {
        await connectESP('esp1', ip1);
        esp1Connected = true;
    } catch {
        esp1Connected = false;
    }
    
    try {
        await connectESP('esp2', ip2);
        esp2Connected = true;
    } catch {
        esp2Connected = false;
    }

    updateESPStatusLights();
    if (!esp1Connected || !esp2Connected) {
        disableAllSwitchButtons();
    }
}

function updateCurrentPathDisplay(key) {
    const el = document.getElementById(`current-path-${key}`);
    const card = document.getElementById(`system-card-${key}`);
    const path = systemsData[key].currentPath;

    // Hapus kelas status sebelumnya
    card.classList.remove('status-normal', 'status-backup', 'status-unknown');

    if (path === 1) {
        el.textContent = systemsData[key].jalur_normal || 'Jalur 1';
        card.classList.add('status-normal');
    } else if (path === 2) {
        el.textContent = systemsData[key].jalur_backup || 'Jalur 2';
        card.classList.add('status-backup');
    } else {
        el.textContent = 'Tidak Terdeteksi';
        card.classList.add('status-unknown');
    }
}

function resetAllPathDisplays() {
    Object.keys(systemsData).forEach(key => {
        systemsData[key].currentPath = 0;
        updateCurrentPathDisplay(key);
    });
}

function updateESPStatusLights() {
    document.getElementById('esp1-status-text').textContent = esp1Connected ? 'Online' : 'Offline';
    document.getElementById('esp1-status').className = `status-light ${esp1Connected ? 'connected' : 'disconnected'}`;
    document.getElementById('esp2-status-text').textContent = esp2Connected ? 'Online' : 'Offline';
    document.getElementById('esp2-status').className = `status-light ${esp2Connected ? 'connected' : 'disconnected'}`;
}

function enableAllSwitchButtons() {
    Object.keys(systemsData).forEach(k => {
        document.getElementById(`switch-normal-${k}`).disabled = false;
        document.getElementById(`switch-backup-${k}`).disabled = false;
    });
}

function disableAllSwitchButtons() {
    Object.keys(systemsData).forEach(k => {
        document.getElementById(`switch-normal-${k}`).disabled = true;
        document.getElementById(`switch-backup-${k}`).disabled = true;
    });
}

function updateSystemData(key, field, value) {
    systemsData[key][field] = value.trim();
    // Jika label jalur diubah, update tampilan jika jalur itu sedang aktif
    if(field === 'jalur_normal' || field === 'jalur_backup') {
        updateCurrentPathDisplay(key);
    }
}

function saveAllConfigurations() {
    // Fungsi ini tidak diubah, tetap menyimpan ke server API Anda
    const updated = {
        ...locationData,
        esp1: document.getElementById('esp1-ip').value.trim(),
        esp2: document.getElementById('esp2-ip').value.trim(),
        systems: {}
    };
    // Membersihkan data yang tidak perlu dikirim
    for (const key in systemsData) {
        const { index, currentPath, ...config } = systemsData[key];
        updated.systems[key] = config;
    }

    fetch(`/api/location/${encodeURIComponent(locationName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification('Konfigurasi berhasil disimpan ke server!', 'success');
        } else {
            throw new Error(data.message || 'Gagal menyimpan');
        }
    })
    .catch(err => {
        console.error(err);
        showNotification('Gagal menyimpan konfigurasi ke server.', 'error');
    });
}

function showNotification(msg, type) {
    const el = document.getElementById('notification');
    el.textContent = msg;
    el.className = `notification ${type} show`;
    setTimeout(() => el.classList.remove('show'), 4000);
}

function goBack() {
    window.location.href = 'index.html';
}