/*
 * NeuroPulse Wristband Firmware v3.0
 * ESP32 + MAX30102
 *
 * Library changes vs v2:
 *   - Replaced ArduinoWebsockets (Gil Maimon) → WebSockets (Markus Sattler / Links2004)
 *     Reason: Links2004 has rock-solid TLS (beginSSL) on ESP32; Gil Maimon's connect()
 *     vs connectSSL() ambiguity caused silent failures.
 *
 * Install in Arduino Library Manager:
 *   - SparkFun MAX3010x Pulse and Proximity Sensor Library  (by SparkFun)
 *   - WebSockets                                            (by Markus Sattler)  ← NEW
 *   - ArduinoJson                                           (by Benoit Blanchon)
 *
 * Pinout (unchanged):
 *   MAX30102 SDA → ESP32 GPIO 21
 *   MAX30102 SCL → ESP32 GPIO 22
 *   MAX30102 VIN → ESP32 3.3V
 *   MAX30102 GND → ESP32 GND
 */

#include <Wire.h>
#include <WiFi.h>
#include <WebSocketsClient.h>   // by Markus Sattler (Links2004)
#include <ArduinoJson.h>
#include "MAX30105.h"
#include "heartRate.h"

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const char* WIFI_SSID = "Home75";
const char* WIFI_PASS = "87019991770";
const char* WS_HOST   = "neuropulse-backend.fly.dev";
const int   WS_PORT   = 443;
const char* WS_PATH   = "/ws/device";
// ─────────────────────────────────────────────────────────────────────────────

MAX30105        sensor;
WebSocketsClient ws;

// ── BPM / RR tracking ───────────────────────────────────────────────────────
const byte RATE_SIZE = 8;
byte       rates[RATE_SIZE];
byte       rateSpot  = 0;
long       lastBeat  = 0;
float      rr_ms     = 0;
int        beatAvg   = 0;

// ── IR moving-average filter ────────────────────────────────────────────────
const int FILTER_SIZE = 4;
long      irBuffer[FILTER_SIZE];
int       filterIdx   = 0;

// ── State ────────────────────────────────────────────────────────────────────
unsigned long lastSendTime = 0;
bool          wsConnected  = false;

// ─────────────────────────────────────────────────────────────────────────────

long filteredIR() {
  long sum = 0;
  for (int i = 0; i < FILTER_SIZE; i++) sum += irBuffer[i];
  return sum / FILTER_SIZE;
}

// WebSocket event handler — called by ws.loop()
void onWsEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("[WS] Disconnected — auto-reconnecting...");
      wsConnected = false;
      break;

    case WStype_CONNECTED:
      Serial.printf("[WS] Connected to wss://%s%s ✓\n", WS_HOST, WS_PATH);
      wsConnected = true;
      break;

    case WStype_TEXT:
      // Server never sends to device, but log just in case
      Serial.printf("[WS] Server says: %s\n", payload);
      break;

    case WStype_ERROR:
      Serial.println("[WS] Error");
      break;

    case WStype_PING:
      Serial.println("[WS] Ping received (pong sent automatically)");
      break;

    default:
      break;
  }
}

// ─── SETUP ───────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== NeuroPulse v3.0 ===");

  // ── MAX30102 ──
  if (!sensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("[SENSOR] MAX30102 not found — check SDA/SCL wiring!");
    while (true) delay(1000);
  }
  Serial.println("[SENSOR] MAX30102 OK");
  sensor.setup();
  sensor.setPulseAmplitudeRed(0x0A);  // red LED low — saves power
  sensor.setPulseAmplitudeGreen(0);   // green not needed

  for (int i = 0; i < FILTER_SIZE; i++) irBuffer[i] = 0;

  // ── WiFi ──
  Serial.printf("[WiFi] Connecting to %s\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\n[WiFi] Connected — IP: %s\n", WiFi.localIP().toString().c_str());
  Serial.printf("[NET]  Free heap: %u bytes\n", ESP.getFreeHeap());

  // ── WebSocket over TLS ──
  // beginSSL() = explicit wss:// — no ambiguity, no setInsecure() tricks needed
  ws.beginSSL(WS_HOST, WS_PORT, WS_PATH);
  ws.onEvent(onWsEvent);
  ws.setReconnectInterval(3000);   // auto-reconnect every 3 s on drop
  ws.enableHeartbeat(15000, 3000, 2);  // ping every 15s, pong timeout 3s, 2 retries
  Serial.printf("[WS]   Connecting to wss://%s%s ...\n", WS_HOST, WS_PATH);
}

// ─── LOOP ────────────────────────────────────────────────────────────────────
void loop() {
  ws.loop();  // handles connect / reconnect / ping-pong — must be called every iteration

  // ── Read IR ──
  long rawIR = sensor.getIR();
  irBuffer[filterIdx] = rawIR;
  filterIdx = (filterIdx + 1) % FILTER_SIZE;
  long ir = filteredIR();

  bool fingerOn = (ir > 50000);

  if (!fingerOn) {
    // Reset on finger-off
    if (beatAvg != 0) Serial.println("[SENSOR] No finger");
    beatAvg  = 0;
    rateSpot = 0;
    rr_ms    = 0;
    delay(50);
    return;
  }

  // ── Beat detection ──
  if (checkForBeat(ir)) {
    long now   = millis();
    long delta = now - lastBeat;
    lastBeat   = now;
    rr_ms      = (float)delta;

    float bpm = 60000.0f / (float)delta;
    if (bpm > 20 && bpm < 255) {
      rates[rateSpot++] = (byte)bpm;
      rateSpot %= RATE_SIZE;
      int sum = 0;
      for (byte i = 0; i < RATE_SIZE; i++) sum += rates[i];
      beatAvg = sum / RATE_SIZE;
      Serial.printf("[BEAT] BPM=%d  RR=%.0f ms\n", beatAvg, rr_ms);
    }
  }

  // ── Send JSON every second (only when connected and have valid data) ──
  if (wsConnected && beatAvg > 0 && (millis() - lastSendTime >= 1000)) {
    lastSendTime = millis();

    // Simple SpO2 estimate from Red/IR ratio
    long  red   = sensor.getRed();
    float ratio = (red > 0 && ir > 0) ? ((float)red / (float)ir) : 1.0f;
    float spo2  = constrain(110.0f - 25.0f * ratio, 85.0f, 100.0f);

    StaticJsonDocument<128> doc;
    doc["bpm"]    = beatAvg;
    doc["rr_ms"]  = (int)rr_ms;
    doc["spo2"]   = (int)spo2;
    doc["finger"] = true;

    String json;
    serializeJson(doc, json);

    ws.sendTXT(json);
    Serial.printf("[WS]   Sent: %s\n", json.c_str());
  }

  delay(10);  // ~100 Hz loop — plenty for MAX30102
}
