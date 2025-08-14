function selectLocation(locationName) {
    sessionStorage.setItem('selectedLocation', locationName);
    window.location.href = 'controll.html';
}

let allLocations = {};
let locationToDelete = null;

document.addEventListener('DOMContentLoaded', function () {
    const container = document.querySelector('.list-section');
    const searchInput = document.getElementById('searchInput');
    const clearSearch = document.getElementById('clearSearch');

    // Event listeners
    searchInput.addEventListener('input', function (e) {
        performSearch(e.target.value);
    });

    clearSearch.addEventListener('click', function () {
        searchInput.value = '';
        performSearch('');
        searchInput.focus();
    });

    searchInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            performSearch(searchInput.value);
        }
    });

    // Add location form handler
    document.getElementById('addLocationForm').addEventListener('submit', function (e) {
        e.preventDefault();
        addNewLocation();
    });

    loadLocations();
});

function createLocationElement(lokasi, info) {
    const item = document.createElement('div');
    item.className = 'location-item';
    item.onclick = (e) => {
        if (e.target.classList.contains('delete-location-btn')) {
            e.stopPropagation();
            return;
        }
        selectLocation(lokasi);
    };
    item.setAttribute('data-location-name', lokasi.toLowerCase());

    item.innerHTML = `
                <button class="delete-location-btn" onclick="event.stopPropagation(); showDeleteConfirmModal('${lokasi.replace(/'/g, "\\'")}')">✕</button>
                <div class="location-info">
                    <div>
                        <div class="location-name">📡 UPLINK ${lokasi.toUpperCase()}</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div class="location-speed">${info.speed}</div>
                    </div>
                </div>
            `;
    return item;
}

function displayLocations(locationsToShow) {
    const container = document.querySelector('.list-section');
    const existingItems = container.querySelectorAll('.location-item');
    existingItems.forEach(item => item.remove());

    Object.keys(locationsToShow).forEach((lokasi, index) => {
        const info = locationsToShow[lokasi];
        const item = createLocationElement(lokasi, info);
        container.appendChild(item);

        item.style.opacity = '0';
        item.style.transform = 'translateY(20px)';
        setTimeout(() => {
            item.style.transition = 'all 0.5s ease';
            item.style.opacity = '1';
            item.style.transform = 'translateY(0)';
        }, index * 150);
    });
}

function performSearch(searchTerm) {
    const filteredLocations = {};
    const term = searchTerm.toLowerCase().trim();
    const clearSearch = document.getElementById('clearSearch');

    if (term === '') {
        displayLocations(allLocations);
        clearSearch.style.display = 'none';
    } else {
        Object.keys(allLocations).forEach(lokasi => {
            if (lokasi.toLowerCase().includes(term)) {
                filteredLocations[lokasi] = allLocations[lokasi];
            }
        });
        displayLocations(filteredLocations);
        clearSearch.style.display = 'block';
    }

    const headerText = document.querySelector('.list-section h3');
    const resultCount = Object.keys(filteredLocations).length;

    if (term === '') {
        headerText.textContent = '🌍 Pilih Lokasi';
    } else if (resultCount === 0) {
        headerText.textContent = `🔍 Tidak ada hasil untuk "${searchTerm}"`;
    } else {
        headerText.textContent = `🔍 ${resultCount} lokasi ditemukan untuk "${searchTerm}"`;
    }
}

function loadLocations() {
    fetch('/api/locations')
        .then(response => response.json())
        .then(data => {
            allLocations = data;
            displayLocations(allLocations);
        })
        .catch(error => {
            console.error("Gagal memuat lokasi:", error);
            showError();
        });
}

function showError() {
    const container = document.querySelector('.list-section');
    const errorDiv = document.createElement('div');
    errorDiv.style.textAlign = 'center';
    errorDiv.style.color = '#e53e3e';
    errorDiv.style.padding = '20px';
    errorDiv.innerHTML = `
                <p>⚠️ Gagal memuat data lokasi</p>
                <p style="font-size: 0.9em; margin-top: 10px;">Silakan refresh halaman atau hubungi administrator</p>
            `;
    container.appendChild(errorDiv);
}

function showAddLocationModal() {
    document.getElementById('addLocationModal').classList.add('show');
}

function hideAddLocationModal() {
    document.getElementById('addLocationModal').classList.remove('show');
    document.getElementById('addLocationForm').reset();
}

function showDeleteConfirmModal(locationName) {
    locationToDelete = locationName;
    document.getElementById('deleteLocationName').textContent = locationName;
    document.getElementById('deleteConfirmModal').classList.add('show');
}

function hideDeleteConfirmModal() {
    document.getElementById('deleteConfirmModal').classList.remove('show');
    locationToDelete = null;
}

async function addNewLocation() {
    const formData = new FormData(document.getElementById('addLocationForm'));
    const locationName = formData.get('locationName').trim();
    const speed = formData.get('locationSpeed').trim();
    const esp1 = formData.get('esp1IP').trim();
    const esp2 = formData.get('esp2IP').trim();

    if (allLocations[locationName]) {
        showNotification('Lokasi dengan nama tersebut sudah ada!', 'error');
        return;
    }

    const newLocationData = {
        speed: speed,
        esp1: esp1,
        esp2: esp2,
        systems: {
            A: {
                name: "Sistem 1",
                hostname1: "",
                hostname2: "",
                port1: "",
                port2: "",
                jalur_normal: "",
                jalur_backup: "",
                currentPath: "Unknown",
                index: 1
            },
            B: {
                name: "Sistem 2",
                hostname1: "",
                hostname2: "",
                port1: "",
                port2: "",
                jalur_normal: "",
                jalur_backup: "",
                currentPath: "Unknown",
                index: 2
            }
        }
    };

    try {
        const response = await fetch(`/api/location/${encodeURIComponent(locationName)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newLocationData)
        });

        const result = await response.json();
        if (result.success) {
            allLocations[locationName] = newLocationData;
            displayLocations(allLocations);
            hideAddLocationModal();
            showNotification('Lokasi berhasil ditambahkan!', 'success');
        } else {
            throw new Error('Gagal menambah lokasi');
        }
    } catch (error) {
        console.error('Error adding location:', error);
        showNotification('Gagal menambah lokasi', 'error');
    }
}

async function confirmDeleteLocation() {
    if (!locationToDelete) return;

    try {
        const response = await fetch(`/api/location/${encodeURIComponent(locationToDelete)}`, {
            method: 'DELETE'
        });

        const result = await response.json();
        if (result.success) {
            delete allLocations[locationToDelete];
            displayLocations(allLocations);
            hideDeleteConfirmModal();
            showNotification('Lokasi berhasil dihapus!', 'success');
        } else {
            throw new Error('Gagal menghapus lokasi');
        }
    } catch (error) {
        console.error('Error deleting location:', error);
        showNotification('Gagal menghapus lokasi', 'error');
    }
}

function showNotification(message, type) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type} show`;
    setTimeout(() => {
        notification.classList.remove('show');
    }, 4000);
}