function selectLocation(locationName) {
    sessionStorage.setItem('selectedLocation', locationName);
    window.location.href = 'controll.html';
}

document.addEventListener('DOMContentLoaded', function () {
    const container = document.querySelector('.list-section');
    const searchInput = document.getElementById('searchInput');
    const clearSearch = document.getElementById('clearSearch');
    let allLocations = {}; // Menyimpan semua data lokasi
    let locationElements = []; // Menyimpan semua elemen lokasi

    // Fungsi untuk memuat elemen lokasi
    function createLocationElement(lokasi, info) {
        const item = document.createElement('div');
        item.className = 'location-item';
        item.onclick = () => selectLocation(lokasi);
        item.setAttribute('data-location-name', lokasi.toLowerCase()); // Untuk pencarian
        item.innerHTML = `
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

    // Fungsi untuk menampilkan lokasi dengan animasi
    function displayLocations(locationsToShow) {
        const existingItems = container.querySelectorAll('.location-item');
        existingItems.forEach(item => item.remove());

        // Tambahkan lokasi yang akan ditampilkan
        Object.keys(locationsToShow).forEach((lokasi, index) => {
            const info = locationsToShow[lokasi];
            const item = createLocationElement(lokasi, info);
            container.appendChild(item);

            // Efek animasi masuk
            item.style.opacity = '0';
            item.style.transform = 'translateY(20px)';
            setTimeout(() => {
                item.style.transition = 'all 0.5s ease';
                item.style.opacity = '1';
                item.style.transform = 'translateY(0)';
            }, index * 150);
        });
    }

    // Fungsi pencarian
    function performSearch(searchTerm) {
        const filteredLocations = {};
        const term = searchTerm.toLowerCase().trim();

        if (term === '') {
            // Jika pencarian kosong, tampilkan semua lokasi
            displayLocations(allLocations);
            clearSearch.style.display = 'none';
        } else {
            // Filter lokasi berdasarkan nama
            Object.keys(allLocations).forEach(lokasi => {
                if (lokasi.toLowerCase().includes(term)) {
                    filteredLocations[lokasi] = allLocations[lokasi];
                }
            });

            displayLocations(filteredLocations);
            clearSearch.style.display = 'block';
        }

        // Update header dengan hasil pencarian
        const headerText = container.querySelector('h3');
        const resultCount = Object.keys(filteredLocations).length;

        if (term === '') {
            headerText.textContent = '🌍 Pilih Lokasi';
        } else if (resultCount === 0) {
            headerText.textContent = `🔍 Tidak ada hasil untuk "${searchTerm}"`;
        } else {
            headerText.textContent = `🔍 ${resultCount} lokasi ditemukan untuk "${searchTerm}"`;
        }
    }

    // Event listener untuk input pencarian
    searchInput.addEventListener('input', function (e) {
        const searchTerm = e.target.value;
        performSearch(searchTerm);
    });

    // Event listener untuk tombol clear
    clearSearch.addEventListener('click', function () {
        searchInput.value = '';
        performSearch('');
        searchInput.focus();
    });

    // Event listener untuk Enter key
    searchInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            performSearch(searchInput.value);
        }
    });

    // Load data lokasi dari API
    fetch('/api/locations')
        .then(response => response.json())
        .then(data => {
            allLocations = data; // Simpan semua data lokasi
            displayLocations(allLocations); // Tampilkan semua lokasi
        })
        .catch(error => {
            console.error("Gagal memuat lokasi:", error);

            // Tampilkan pesan error
            const errorDiv = document.createElement('div');
            errorDiv.style.textAlign = 'center';
            errorDiv.style.color = '#e53e3e';
            errorDiv.style.padding = '20px';
            errorDiv.innerHTML = `
                <p>⚠️ Gagal memuat data lokasi</p>
                <p style="font-size: 0.9em; margin-top: 10px;">Silakan refresh halaman atau hubungi administrator</p>
            `;
            container.appendChild(errorDiv);
        });
});