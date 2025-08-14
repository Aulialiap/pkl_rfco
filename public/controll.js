const locationName = sessionStorage.getItem('selectedLocation');
const systemsData = {};
let locationData = null;
let esp1Connected = false;
let esp2Connected = false;


document.addEventListener('DOMContentLoaded', function () {
    if (!locationName) {
        showNotification('Lokasi tidak ditemukan', 'error');
        setTimeout(() => goBack(), 2000);
        return;
    }
    loadLocationData();
});


function loadLocationData() {
    fetch(`/api/location/${encodeURIComponent(locationName)}`)
        .then(response => response.json())
        .then(data => {
            locationData = data;

            document.getElementById('location-display').textContent = `🛠️ Kontrol Sistem GPON ${locationName.toUpperCase()}`;
            document.getElementById('location-speed').textContent = `Kapasitas : ${locationData.speed}`;
            document.getElementById('esp1-ip').value = locationData.esp1;
            document.getElementById('esp2-ip').value = locationData.esp2;

            // Override dengan saved config di localStorage
            const savedConfig = localStorage.getItem(`rfco_config_${locationName}`);
            if (savedConfig && localStorage.getItem("force_local_config") === "true") {
                const parsed = JSON.parse(savedConfig);
                locationData.esp1 = parsed.esp1;
                locationData.esp2 = parsed.esp2;
                Object.entries(parsed.systems).forEach(([key, val]) => {
                    if (locationData.systems[key]) {
                        locationData.systems[key] = val;
                    }
                });

            }

            /*Object.entries(locationData.systems).forEach(([k, v]) => {
                systemsData[k] = { ...v, currentPath: 'Unknown' };
            });*/

            Object.entries(locationData.systems).forEach(([k, v], i) => {
                systemsData[k] = { ...v, currentPath: 'Unknown', index: i + 1 };
            });

            generateSystemCards();
        })
        .catch(error => {
            console.error('Gagal memuat data lokasi:', error);
            showNotification('Gagal memuat data lokasi', 'error');
        });
}

function generateSystemCards() {
    const container = document.getElementById('systems-container');
    container.innerHTML = '';
    Object.entries(locationData.systems).forEach(([k, v]) => {
        const card = createSystemCard(k, v);
        container.appendChild(card);
    });
}

function createSystemCard(key, data) {
    const card = document.createElement('div');
    card.className = 'system-card';
    card.innerHTML = `
        <div class="system-header">
            <div class="system-title">
                <input type="text" value="${data.name}" onchange="updateSystemName('${key}', this.value)">
            </div>
        </div>
        <div class="port-info">
            <div class="port-row">
                <div class="port-label">Hostname 1 :</div>
                <div class="port-value">
                    <input type="text" value="${data.hostname1}" onchange="updateSystemPort('${key}', 'hostname1', this.value)">
                </div>
                <div class="port-label">Port 1 :</div>
                <div class="port-value">
                    <input type="text" value="${data.port1}" onchange="updateSystemPort('${key}', 'port1', this.value)">
                </div>
            </div>
            <div class="port-row">
                <div class="port-label">Hostname 2 :</div>
                <div class="port-value">
                    <input type="text" value="${data.hostname2}" onchange="updateSystemPort('${key}', 'hostname2', this.value)">
                </div>
                <div class="port-label">Port 2 :</div>
                <div class="port-value">
                    <input type="text" value="${data.port2}" onchange="updateSystemPort('${key}', 'port2', this.value)">
                </div>
            </div>
        </div>
        <div class="path-info">
            <h4>Status Jalur</h4>
            <div class="path-row">
                <div class="path-label">Jalur Utama :</div>
                <div class="path-value">
                    <input type="text" value="${data.jalur_normal}" onchange="updateSystemPath('${key}', 'jalur_normal', this.value)">
                </div>
            </div>
            <div class="path-row">
                <div class="path-label">Jalur Backup :</div>
                <div class="path-value">
                    <input type="text" value="${data.jalur_backup}" onchange="updateSystemPath('${key}', 'jalur_backup', this.value)">
                </div>
            </div>
            <div class="save-configuration">
                <button class="save-button" onclick="saveAllConfigurations()">
                💾 Save
                </button>
            </div>
        </div>
        <div class="current-path">
            <div class="current-path-label">Jalur Aktif Saat Ini</div>
            <div class="current-path-value" id="current-path-${key}">Jalur ${data.currentPath}</div>
        </div>
        <div class="switch-controls">
            <button class="switch-button switch-path-normal" onclick="switchToPath('${key}', 'normal')" id="switch-normal-${key}" disabled>🔄 Jalur Utama</button>
            <button class="switch-button switch-path-backup" onclick="switchToPath('${key}', 'backup')" id="switch-backup-${key}" disabled>⚡ Jalur Backup</button>
        </div>
    `;
    return card;
}

async function connectAllESP() {
    showNotification('Mencoba Menghubungkan...', 'warning');
    const ip1 = document.getElementById('esp1-ip').value.trim();
    const ip2 = document.getElementById('esp2-ip').value.trim();

    const result = await Promise.allSettled([
        connectESP('esp1', ip1),
        connectESP('esp2', ip2)
    ]);

    esp1Connected = result[0].status === 'fulfilled';
    esp2Connected = result[1].status === 'fulfilled';

    updateESPStatus();

    if (esp1Connected && esp2Connected) {
        showNotification('Kedua ESP32 berhasil terkoneksi!', 'success');
        enableAllSwitchButtons();
    } else if (esp1Connected || esp2Connected) {
        showNotification('Salah satu ESP32 berhasil terkoneksi', 'warning');
        enableAllSwitchButtons();
    } else {
        showNotification('Gagal connect ke semua ESP32', 'error');
        disableAllSwitchButtons();
    }
}

async function connectESP(name, ip) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // Naikkan timeout menjadi 5 detik

    try {
        //const res = await fetch(`/api/esp-proxy?ip=${ip}&endpoint=status?system=1`, {
        for (const [key, sys] of Object.entries(systemsData)) {
            const res = await fetch(`http://${ip}/status?system=${sys.index}`, {
                method: 'GET',
                mode: 'cors',
                signal: controller.signal
            });
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            // Update esp 
            const data = await res.json();

            // Update status currentPath
            //const systemKey = Object.keys(systemsData)[0]; // sementara ambil system=1
            if (data.currentPath === 1) {
                systemsData[key].currentPath = 'normal';
            } else if (data.currentPath === 2) {
                systemsData[key].currentPath = 'backup';
            } //else if (data.currentPath === 0) {
                //systemsData[key].currentPath = 'unknown';
            //}
            updateCurrentPathDisplay(key);
        }
        clearTimeout(timeoutId);
        return true;


    } catch (error) {
        clearTimeout(timeoutId);
        console.error(`Error connecting to ESP32 ${name} (${ip}):`, error.message);
        throw error;
    }
}

function updateCurrentPathDisplayAll() {
    Object.keys(systemsData).forEach(updateCurrentPathDisplay);
}

function updateESPStatus() {
    const s1 = document.getElementById('esp1-status');
    const s2 = document.getElementById('esp2-status');
    const status1 = document.getElementById('esp1-status-text');
    const status2 = document.getElementById('esp2-status-text');

    status1.textContent = esp1Connected ? 'Online' : 'Offline';
    status2.textContent = esp2Connected ? 'Online' : 'Offline';

    s1.className = `status-light ${esp1Connected ? 'connected' : 'disconnected'}`;
    s2.className = `status-light ${esp2Connected ? 'connected' : 'disconnected'}`;

    // Matikan tombol switch jika koneksi terputus
    if (!esp1Connected || !esp2Connected) {
        disableAllSwitchButtons();
    }
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

//const lastConnectionCheck = {};
const lastConnectionCheck = {
    esp1: 0,
    esp2: 0
};
const CONNECTION_CHECK_INTERVAL = 3000; //Interval 3 detik
async function checkConnectionImmediately() {
    const now = Date.now();
    const ip1 = document.getElementById('esp1-ip').value.trim();
    const ip2 = document.getElementById('esp2-ip').value.trim();

    // Cek koneksi ESP1 jika belum dicek dalam 3 detik
    if (now - lastConnectionCheck.esp1 > CONNECTION_CHECK_INTERVAL) {
        try {
            await Promise.race([
                connectESP('esp1', ip1),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 500))
            ]);
            esp1Connected = true;
        } catch {
            esp1Connected = false;
        }
        lastConnectionCheck.esp1 = now;
    }

    // Cek koneksi ESP2 jika belum dicek dalam 3 detik
    if (now - lastConnectionCheck.esp2 > CONNECTION_CHECK_INTERVAL) {
        try {
            await Promise.race([
                connectESP('esp2', ip2),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 500))
            ]);
            esp2Connected = true;
        } catch {
            esp2Connected = false;
        }
        lastConnectionCheck.esp2 = now;
    }

    updateESPStatus();
    if (!esp1Connected || !esp2Connected) {
        disableAllSwitchButtons();
    }
}

async function switchToPath(key, type) {
    // Periksa koneksi kedua ESP
    await checkConnectionImmediately();

    if (!esp1Connected || !esp2Connected) {
        showNotification('Kedua ESP harus terkoneksi untuk melakukan switching', 'error');
        return;
    }

    const relay = type === 'normal' ? 1 : 2;
    const name = systemsData[key].name;
    showNotification(`Mengalihkan ${name} ke jalur ${type}...`, 'info');

    const ip1 = document.getElementById('esp1-ip').value.trim();
    const ip2 = document.getElementById('esp2-ip').value.trim();
    const systemIdx = Object.keys(systemsData).indexOf(key) + 1;

    try {
        // Kirim perintah ke kedua ESP secara bersamaan
        const [result1, result2] = await Promise.all([
            sendSwitchCommand(ip1, systemIdx, relay),
            sendSwitchCommand(ip2, systemIdx, relay)
        ]);

        // Hanya update status jika kedua perintah berhasil
        systemsData[key].currentPath = type;
        updateCurrentPathDisplay(key);
        showNotification(`${name} berhasil dialihkan ke jalur ${type}`, 'success');
    } catch (error) {
        showNotification(`${name} gagal dialihkan: Salah satu ESP tidak merespon`, 'error');
    }
}

async function sendSwitchCommand(ip, systemIdx, relay) {
    const body = `system=${systemIdx}&relay=${relay}`;
    const res = await fetch('/api/esp-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, endpoint: 'switch', body })
    });

    if (!res.ok) throw new Error();
    return res.json();
}


function updateCurrentPathDisplay(key) {
    const el = document.getElementById(`current-path-${key}`);
    const type = systemsData[key].currentPath;
    if (type === 'normal') {
        el.textContent = systemsData[key].jalur_normal;
    } else if (type === 'backup') {
        el.textContent = systemsData[key].jalur_backup;
    } else {
        el.textContent = 'Unknown';
    }
}

function updateESPIP(name, value) {
    locationData[name] = value.trim();
    showNotification(`IP ${name.toUpperCase()} diperbarui`, 'success');
}
function updateSystemName(k, v) {
    systemsData[k].name = v.trim();
}
function updateSystemPort(k, portKey, v) {
    systemsData[k][portKey] = v.trim();
}
function updateSystemPath(k, pathKey, v) {
    systemsData[k][pathKey] = v.trim();
    updateCurrentPathDisplay(k);
}

// ⏺ Simpan ke server!
function saveAllConfigurations() {
    const updated = {
        ...locationData,
        esp1: document.getElementById('esp1-ip').value.trim(),
        esp2: document.getElementById('esp2-ip').value.trim(),
        systems: systemsData
    };

    fetch(`/api/location/${encodeURIComponent(locationName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showNotification('Konfigurasi berhasil disimpan!', 'success');
            } else {
                throw new Error('Gagal menyimpan');
            }
        })
        .catch(err => {
            console.error(err);
            showNotification('Gagal menyimpan ke server', 'error');
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

setInterval(() => {
    if (esp1Connected || esp2Connected) {
        checkConnectionImmediately();
    }
}, CONNECTION_CHECK_INTERVAL);