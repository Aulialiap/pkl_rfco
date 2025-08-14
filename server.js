const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 5000;
const DATA_FILE = path.join(__dirname, 'data', 'location.json');
//const fetch = require('node-fetch'); // npm install node-fetch jika belum

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint: get all locations
app.get('/api/locations', (req, res) => {
    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Gagal membaca data lokasi' });
        res.json(JSON.parse(data));
    });
});

// Endpoint: get specific location by name
app.get('/api/location/:name', (req, res) => {
    const locationName = req.params.name;
    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Gagal membaca data lokasi' });
        const allLocations = JSON.parse(data);
        if (!allLocations[locationName]) {
            return res.status(404).json({ error: 'Lokasi tidak ditemukan' });
        }
        res.json(allLocations[locationName]);
    });
});

// Endpoint: save/update specific location
app.post('/api/location/:name', (req, res) => {
    const locationName = req.params.name;
    const newData = req.body;

    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Gagal membaca file' });

        const allLocations = JSON.parse(data);
        allLocations[locationName] = newData;

        fs.writeFile(DATA_FILE, JSON.stringify(allLocations, null, 2), 'utf8', (err) => {
            if (err) return res.status(500).json({ error: 'Gagal menyimpan file' });
            res.json({ success: true, message: 'Konfigurasi berhasil disimpan!' });
        });
    });
});

app.post('/api/esp-proxy', async (req, res) => {
    const { ip, endpoint, body } = req.body;

    try {
        const response = await fetch(`http://${ip}/${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body
        });

        if (!response.ok) throw new Error(`ESP response: ${response.status}`);
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error(`Proxy error to ${ip}:`, err.message);
        res.status(500).json({ error: 'ESP32 tidak merespons' });
    }
});


// Start server
app.listen(PORT, '0.0.0.0',() => {
    console.log(`RFCO server aktif di http://localhost:${PORT}`);
});
