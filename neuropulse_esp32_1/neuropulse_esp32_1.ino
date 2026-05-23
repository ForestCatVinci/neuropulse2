/*
 * NeuroPulse Wristband Firmware v2.0
 * ESP32 + MAX30102
 *
 * Что делает:
 *   - Читает IR сигнал с MAX30102 через I2C
 *   - Детектирует пики пульса через checkForBeat()
 *   - Считает BPM и R-R интервалы
 *   - Проверяет наличие пальца (IR > 50000)
 *   - Отправляет JSON по WebSocket каждую секунду
 *   - Автоматически переподключается при обрыве WiFi/WS
 *
 * Зависимости (Arduino Library Manager):
 *   - SparkFun MAX3010x Pulse and Proximity Sensor Library  (by SparkFun)
 *   - ArduinoWebsockets                                     (by Gil Maimon)
 *   - ArduinoJson                                           (by Benoit Blanchon)
 *
 * Подключение:
 *   MAX30102 SDA → ESP32 GPIO 21
 *   MAX30102 SCL → ESP32 GPIO 22
 *   MAX30102 VIN → ESP32 3.3V
 *   MAX30102 GND → ESP32 GND
 */

#include <Wire.h>
#include <WiFi.h>
#include <ArduinoWebsockets.h>
#include <ArduinoJson.h>
#include "MAX30105.h"
#include "heartRate.h"

using namespace websockets;

// ─── НАСТРОЙКИ — заполни свои данные ───────────────────────────────────────
const char* WIFI_SSID     = "Home75";
const char* WIFI_PASSWORD = "87019991770";
const char* WS_HOST       = "neuropulse-backend.fly.dev";
const int   WS_PORT       = 443;
const char* WS_PATH       = "/ws/device";
// ────────────────────────────────────────────────────────────────────────────

MAX30105        sensor;
WebsocketsClient ws;

// --- BPM и R-R ---
const byte      RATE_SIZE = 8;
byte            rates[RATE_SIZE];
byte            rateSpot  = 0;
long            lastBeat  = 0;
float           bpm       = 0;
float           rr_ms     = 0;
int             beatAvg   = 0;

// --- Moving average фильтр IR ---
const int       FILTER_SIZE = 4;
long            irBuffer[FILTER_SIZE];
int             filterIdx   = 0;

// --- Reconnect ---
unsigned long   lastSendTime      = 0;
unsigned long   lastReconnectTime = 0;
int             reconnectDelay    = 1000;   // начинаем с 1 сек, удваиваем
bool            wsConnected       = false;

// ─── УТИЛИТЫ ────────────────────────────────────────────────────────────────

long filteredIR() {
  long sum = 0;
  for (int i = 0; i < FILTER_SIZE; i++) sum += irBuffer[i];
  return sum / FILTER_SIZE;
}

void connectWiFi() {
  Serial.print("[WiFi] Подключаюсь к ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("[WiFi] Подключён. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n[WiFi] Не удалось подключиться. Повтор через 5 сек.");
  }
}

void connectWebSocket() {
  Serial.print("[WS] Подключаюсь к wss://");
  Serial.print(WS_HOST);
  Serial.print(WS_PATH);
  Serial.println(" ...");

  // setInsecure() MUST be called before every connect() — skips cert verification.
  ws.setInsecure();

  // Pass a full wss:// URL so the library uses TLS automatically.
  // connect(host, port, path) opens plain ws:// even on port 443 — Fly.io rejects it.
  String url = String("wss://") + WS_HOST + WS_PATH;
  bool ok = ws.connect(url.c_str());
  if (!ok) {
    Serial.print("[WS] Не удалось подключиться. Следующая попытка через ");
    Serial.print(reconnectDelay / 1000);
    Serial.println(" сек.");
    wsConnected = false;
  }
}

// ─── SETUP ──────────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  Serial.println("\n=== NeuroPulse v2.0 ===");

  // Инициализация MAX30102
  if (!sensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("[SENSOR] MAX30102 не найден. Проверь подключение I2C.");
    while (true) delay(1000);
  }
  Serial.println("[SENSOR] MAX30102 инициализирован");

  sensor.setup();
  sensor.setPulseAmplitudeRed(0x0A);   // красный LED на минимум — экономия заряда
  sensor.setPulseAmplitudeGreen(0);     // зелёный не нужен

  // Инициализация IR буфера
  for (int i = 0; i < FILTER_SIZE; i++) irBuffer[i] = 0;

  // WiFi
  connectWiFi();

  // WebSocket callbacks — registered ONCE here, not on every reconnect
  ws.onMessage([](WebsocketsMessage msg) {
    // Server never sends to device, but log it just in case
    Serial.print("[WS] Получено: ");
    Serial.println(msg.data());
  });

  ws.onEvent([](WebsocketsEvent event, String data) {
    if (event == WebsocketsEvent::ConnectionOpened) {
      Serial.println("[WS] Соединение открыто ✓");
      wsConnected    = true;
      reconnectDelay = 1000;
    } else if (event == WebsocketsEvent::ConnectionClosed) {
      Serial.println("[WS] Соединение закрыто");
      wsConnected = false;
    }
    // GotPing: ArduinoWebsockets sends pong automatically — no need to call ws.pong()
  });

  // Quick connectivity test before WS connect
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[NET] Проверка DNS... ");
    IPAddress ip;
    if (WiFi.hostByName(WS_HOST, ip)) {
      Serial.print("OK → ");
      Serial.println(ip);
    } else {
      Serial.println("FAIL — DNS не разрешается!");
    }
    Serial.print("[NET] Свободная heap: ");
    Serial.print(ESP.getFreeHeap());
    Serial.println(" байт (нужно >60000 для TLS)");

    connectWebSocket();
  }
}

// ─── LOOP ───────────────────────────────────────────────────────────────────

void loop() {
  // --- 1. Переподключение WiFi ---
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Соединение потеряно, переподключаюсь...");
    connectWiFi();
    return;
  }

  // --- 2. Переподключение WebSocket с backoff ---
  if (!wsConnected) {
    unsigned long now = millis();
    if (now - lastReconnectTime > reconnectDelay) {
      lastReconnectTime = now;
      connectWebSocket();
      reconnectDelay = min(reconnectDelay * 2, 30000);  // максимум 30 сек
    }
    delay(100);
    return;
  }

  ws.poll();

  // --- 3. Чтение IR сигнала ---
  long rawIR = sensor.getIR();

  // Moving average фильтр
  irBuffer[filterIdx] = rawIR;
  filterIdx = (filterIdx + 1) % FILTER_SIZE;
  long ir = filteredIR();

  // --- 4. Finger detection ---
  bool fingerOn = (ir > 50000);

  if (!fingerOn) {
    // Сброс при снятии пальца
    bpm   = 0;
    rr_ms = 0;
    beatAvg = 0;
    rateSpot = 0;
    if (millis() - lastSendTime > 2000) {
      Serial.println("[SENSOR] Палец не приложен");
      lastSendTime = millis();
    }
    delay(50);
    return;
  }

  // --- 5. Детекция пика пульса ---
  if (checkForBeat(ir)) {
    long now   = millis();
    long delta = now - lastBeat;
    lastBeat   = now;

    // R-R интервал
    rr_ms = (float)delta;

    // BPM из текущего интервала
    bpm = 60.0f / (delta / 1000.0f);

    // Скользящее среднее BPM по 8 ударам
    if (bpm > 20 && bpm < 255) {    // отсеиваем шум
      rates[rateSpot++] = (byte)bpm;
      rateSpot %= RATE_SIZE;

      int sum = 0;
      for (byte i = 0; i < RATE_SIZE; i++) sum += rates[i];
      beatAvg = sum / RATE_SIZE;
    }

    Serial.print("[BEAT] BPM=");
    Serial.print(beatAvg);
    Serial.print("  R-R=");
    Serial.print(rr_ms, 0);
    Serial.println(" мс");
  }

  // --- 6. Отправка JSON каждую секунду ---
  if (millis() - lastSendTime >= 1000 && beatAvg > 0) {
    lastSendTime = millis();

    // SpO2 — упрощённый расчёт из соотношения Red/IR
    long red   = sensor.getRed();
    float ratio = (red > 0 && ir > 0) ? ((float)red / (float)ir) : 1.0f;
    float spo2  = 110.0f - 25.0f * ratio;
    spo2 = constrain(spo2, 85.0f, 100.0f);

    // Формируем JSON
    StaticJsonDocument<256> doc;
    doc["bpm"]    = beatAvg;
    doc["rr_ms"]  = (int)rr_ms;
    doc["spo2"]   = (int)spo2;
    doc["finger"] = fingerOn;

    String payload;
    serializeJson(doc, payload);

    bool sent = ws.send(payload);
    if (sent) {
      Serial.print("[WS] Отправлено: ");
      Serial.println(payload);
    } else {
      Serial.println("[WS] Ошибка отправки");
      wsConnected = false;
    }
  }

  delay(10);  // 100 Гц — достаточно для MAX30102
}
