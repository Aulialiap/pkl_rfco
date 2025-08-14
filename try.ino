#include <SPI.h>
#include <Ethernet.h>

// =====================
// Konfigurasi Ethernet
// =====================
#define ETH_CS 5 // Pin CS W5500
byte mac[] = {0xDE, 0xAD, 0xBE, 0xEF, 0x01, 0x01};
IPAddress ip(10, 116, 18, 29);
IPAddress gw(10, 116, 18, 1);
IPAddress mask(255, 255, 255, 0);
EthernetServer server(80);
// =====================
// Konfigurasi Relay
// =====================
struct SystemRelay
{
    int relay1;
    int relay2;
    int status1;
    int status2;
};

SystemRelay systems[] = {
    {33, 25, 21, 22},
    {26, 27, 32, 14}};

const int numSystems = sizeof(systems) / sizeof(SystemRelay);
bool states[numSystems][2]; // Status relay
int currentPath[numSystems];
// =====================
// Setup
// =====================
void setup()
{
    Serial.begin(115200);
    Ethernet.init(ETH_CS);
    Ethernet.begin(mac, ip, gw, mask);
    // Tunggu koneksi Ethernet
    while (Ethernet.linkStatus() != LinkON)
    {
        Serial.print(".");
        delay(500);
    }
    Serial.println("\nEthernet Connected!");
    Serial.print("IP: ");
    Serial.println(Ethernet.localIP());
    // Inisialisasi pin relay
    for (int i = 0; i < numSystems; i++)
    {
        pinMode(systems[i].relay1, OUTPUT);
        pinMode(systems[i].relay2, OUTPUT);
        pinMode(systems[i].status1, INPUT_PULLUP);
        pinMode(systems[i].status2, INPUT_PULLUP);
        digitalWrite(systems[i].relay1, HIGH);
        digitalWrite(systems[i].relay2, HIGH);
        // states[i][0] = false;
        // states[i][1] = false;
        currentPath[i] = 0;
    }
    server.begin();
}
// =====================
// Loop utama
// =====================
void loop()
{
    EthernetClient client = server.available();
    if (!client)
        return;
    String req = bacaRequest(client);
    Serial.println(">> Request:");
    Serial.println(req);

    String method, path;
    parseMethodPath(req, method, path);

    if (method == "GET" && path.startsWith("/status"))
    {
        handleStatus(client, path);
    }
    else if (method == "POST" && path == "/switch")
    {
        handleSwitch(client);
    }
    else
    {
        send404(client);
    }
    client.stop();
}

// =====================
// Fungsi Pendukung
// =====================
String bacaRequest(EthernetClient &client)
{
    String req = "";
    while (client.connected())
    {
        if (client.available())
        {
            char c = client.read();
            req += c;
            if (req.endsWith("\r\n\r\n"))
                break; // header selesai
        }
    }
    return req;
}

void parseMethodPath(const String &req, String &method, String &path)
{
    int sp1 = req.indexOf(' ');
    int sp2 = req.indexOf(' ', sp1 + 1);
    method = req.substring(0, sp1);
    path = req.substring(sp1 + 1, sp2);
}

// Baca sensor optical switch
// void updateCurrentPath(int idx) {
//   if (digitalRead(systems[idx].status1) == LOW) {
//     currentPath[idx] = 1;
//   } else if (digitalRead(systems[idx].status2) == LOW) {
//     currentPath[idx] = 2;
//   } else {
//     currentPath[idx] = 0; // tidak terdeteksi
//   }
// }

// Baca sensor optical switch & update relay states
// di dalam fungsi updateCurrentPath()
void updateCurrentPath(int idx)
{
    int path1 = digitalRead(systems[idx].status1);
    int path2 = digitalRead(systems[idx].status2);

    // Perhatikan output ini di Serial Monitor!
    Serial.print("Sistem ");
    Serial.print(idx + 1);
    Serial.print(" | Status Pin 1 (Normal): ");
    Serial.print(path1 == LOW ? "LOW (AKTIF)" : "HIGH");
    Serial.print(" | Status Pin 2 (Backup): ");
    Serial.println(path2 == LOW ? "LOW (AKTIF)" : "HIGH");

    if (path1 == LOW)
    {
        currentPath[idx] = 1;
    }
    else if (path2 == LOW)
    {
        currentPath[idx] = 2;
    }
    else
    {
        currentPath[idx] = 0;
    }
}

void handleStatus(EthernetClient &client, const String &path)
{
    int qmIndex = path.indexOf("system=");
    if (qmIndex == -1)
    {
        send400(client, "parameter system dibutuhkan");
        return;
    }
    int sysID = path.substring(qmIndex + 7).toInt() - 1;
    if (sysID < 0 || sysID >= numSystems)
    {
        send400(client, "sistem tidak ditemukan");
        return;
    }
    updateCurrentPath(sysID);
    // states[sysID][0] = (currentPath[sysID] == 1);
    // states[sysID][1] = (currentPath[sysID] == 2);

    String json = "{\"relay1\":" + String(states[sysID][0] ? "true" : "false") +
                  ",\"relay2\":" + String(states[sysID][1] ? "true" : "false") +
                  ",\"currentPath\":" + String(currentPath[sysID]) + "}";
    send200(client, "application/json", json);
}

void handleSwitch(EthernetClient &client)
{
    while (client.available() == 0)
        delay(10); // tunggu body
    String body = "";
    while (client.available())
        body += (char)client.read();

    int sysIndex = body.indexOf("system=");
    int relIndex = body.indexOf("relay=");

    if (sysIndex == -1 || relIndex == -1)
    {
        send400(client, "parameter system dan relay dibutuhkan");
        return;
    }

    int idx = body.substring(sysIndex + 7).toInt() - 1;
    int relayIdx = body.substring(relIndex + 6).toInt() - 1;

    if (idx < 0 || idx >= numSystems)
    {
        send400(client, "sistem tidak ditemukan");
        return;
    }
    if (relayIdx != 0 && relayIdx != 1)
    {
        send400(client, "relay harus bernilai 1 atau 2");
        return;
    }
    // Matikan semua relay
    digitalWrite(systems[idx].relay1, HIGH);
    digitalWrite(systems[idx].relay2, HIGH);
    delay(200);

    // Aktifkan relay yang diminta
    int pin = (relayIdx == 0) ? systems[idx].relay1 : systems[idx].relay2;
    digitalWrite(pin, LOW);
    delay(3000);
    digitalWrite(pin, HIGH);

    delay(500); // Beri waktu sensor untuk stabil
    updateCurrentPath(idx);0
    int targetPath = relayIdx + 1;
    if (currentPath[idx] == targetPath)
    {
        // Jika jalur aktif saat ini = jalur yang diperintahkan, baru kirim sukses
        Serial.println(">>> SWITCH BERHASIL DIKONFIRMASI!");
        String json = "{\"success\":true, \"message\":\"Switch berhasil dikonfirmasi\", \"newPath\":" + String(currentPath[idx]) + "}";
        send200(client, "application/json", json);
    }
    else
    {
        // Jika tidak, kirim pesan gagal
        Serial.println(">>> GAGAL! Switch tidak terkonfirmasi oleh sensor.");
        String json = "{\"success\":false, \"message\":\"Gagal konfirmasi switch, jalur saat ini: " + String(currentPath[idx]) + "\"}";
        send400(client, "Gagal konfirmasi switch. Periksa perangkat fisik."); // Atau kirim 200 dengan status error
    }
    // Update status
    // states[idx][0] = (relayIdx == 0);
    // states[idx][1] = (relayIdx == 1);

    // updateCurrentPath(idx);
    // send200(client, "application/json", "{\"success\":true, \"message\":\"Switch command sent\"}");
}

// =====================
// Helper Response HTTP
// =====================
void send200(EthernetClient &client, String contentType, String body)
{
    client.println("HTTP/1.1 200 OK");
    client.println("Access-Control-Allow-Origin: *");
    client.println("Content-Type: " + contentType);
    client.println("Connection: close");
    client.println();
    client.println(body);
}

void send400(EthernetClient &client, String msg)
{
    client.println("HTTP/1.1 400 Bad Request");
    client.println("Access-Control-Allow-Origin: *");
    client.println("Content-Type: application/json");
    client.println("Connection: close");
    client.println();
    client.print("{\"error\":\"");
    client.print(msg);
    client.println("\"}");
}

void send404(EthernetClient &client)
{
    client.println("HTTP/1.1 404 Not Found");
    client.println("Access-Control-Allow-Origin: *");
    client.println("Content-Type: text/plain");
    client.println("Connection: close");
    client.println();
    client.println("Not Found");
}
