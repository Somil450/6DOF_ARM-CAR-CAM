
#include <WiFi.h>
#include <WebServer.h>
#include <WiFiUdp.h>

// ============================================================
// WAREBOT CAR ESP32
// ============================================================

const char* WIFI_SSID = "Somil's A35";
const char* WIFI_PASSWORD = "somil@12";

IPAddress ARM_IP(10, 116, 205, 193);

const uint16_t ARM_COMMAND_PORT = 5005;
const uint16_t CAR_FEEDBACK_PORT = 5006;

// L298N motor pins
#define IN1 25
#define IN2 26
#define IN3 27
#define IN4 14

// Ultrasonic sensor pins
#define TRIG_PIN 32
#define ECHO_PIN 33

const float STOP_DISTANCE_CM = 25.0f;
const float REVERSE_DISTANCE_CM = 20.0f;

WebServer server(80);
WiFiUDP armFeedbackUdp;
WiFiUDP armCommandUdp;

enum CarState {
  STATE_IDLE,
  STATE_FORWARD,
  STATE_PICKUP_WAIT,
  STATE_REVERSE
};

CarState carState = STATE_IDLE;

float currentDistance = -1.0f;
float reverseStartDistance = -1.0f;
float reverseTargetDistance = -1.0f;

bool pickupSent = false;
bool pythonAllowsMovement = false;

unsigned long lastDistanceRead = 0;
const unsigned long DISTANCE_INTERVAL_MS = 150;


// ============================================================
// MOTOR CONTROL
// These directions match the forward pin pattern you confirmed.
// ============================================================

void stopCar() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);
}

void moveForward() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, HIGH);

  digitalWrite(IN3, HIGH);
  digitalWrite(IN4, LOW);
}

void moveBackward() {
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);

  digitalWrite(IN3, LOW);
  digitalWrite(IN4, HIGH);
}


// ============================================================
// ULTRASONIC SENSOR
// ============================================================

float readDistance() {
  float samples[3];
  int valid = 0;

  for (int i = 0; i < 3; i++) {
    digitalWrite(TRIG_PIN, LOW);
    delayMicroseconds(3);

    digitalWrite(TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);

    unsigned long duration =
        pulseIn(ECHO_PIN, HIGH, 25000);

    if (duration > 0) {
      float d = duration * 0.0343f / 2.0f;

      if (d >= 2.0f && d <= 400.0f) {
        samples[valid++] = d;
      }
    }

    if (i < 2) {
      delay(3);
    }
  }

  if (valid == 0) {
    return -1.0f;
  }

  // Sort readings and use the median.
  for (int i = 0; i < valid - 1; i++) {
    for (int j = i + 1; j < valid; j++) {
      if (samples[j] < samples[i]) {
        float temp = samples[i];
        samples[i] = samples[j];
        samples[j] = temp;
      }
    }
  }

  return samples[valid / 2];
}


// ============================================================
// ARM COMMUNICATION
// ============================================================

bool sendToArm(const char* message) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[ARM] Wi-Fi disconnected");
    return false;
  }

  if (!armCommandUdp.beginPacket(ARM_IP, ARM_COMMAND_PORT)) {
    Serial.println("[ARM] Could not start UDP packet");
    return false;
  }

  armCommandUdp.print(message);
  bool ok = armCommandUdp.endPacket() == 1;

  Serial.print("[CAR -> ARM] ");
  Serial.print(message);
  Serial.println(ok ? " SENT" : " FAILED");

  return ok;
}


// ============================================================
// STATE RESET
// ============================================================

void resetCycle() {
  stopCar();

  carState = STATE_IDLE;
  pickupSent = false;
  pythonAllowsMovement = false;

  reverseStartDistance = -1.0f;
  reverseTargetDistance = -1.0f;

  Serial.println("[STATE] READY");
}


// ============================================================
// START PICKUP
// ============================================================

void startPickup() {
  if (carState != STATE_FORWARD || pickupSent) {
    return;
  }

  stopCar();

  carState = STATE_PICKUP_WAIT;
  pythonAllowsMovement = false;
  pickupSent = true;

  Serial.println("[PICKUP] Threshold reached; car stopped");

  if (!sendToArm("PICKUP")) {
    Serial.println(
      "[WARNING] Could not send PICKUP to arm"
    );
  }
}


// ============================================================
// ARM FEEDBACK
// ============================================================

void startReverse() {
  if (carState != STATE_PICKUP_WAIT) {
    return;
  }

  stopCar();

  float d = readDistance();

  if (d < 0.0f) {
    Serial.println(
      "[REVERSE] Invalid distance; remaining stopped"
    );
    return;
  }

  currentDistance = d;
  reverseStartDistance = d;
  reverseTargetDistance = d + REVERSE_DISTANCE_CM;

  carState = STATE_REVERSE;

  Serial.println("[REVERSE] Starting reverse movement");
  moveBackward();
}

void checkArmFeedback() {
  int packetSize = armFeedbackUdp.parsePacket();

  if (packetSize <= 0) {
    return;
  }

  char buffer[128];

  int len = armFeedbackUdp.read(
    buffer,
    sizeof(buffer) - 1
  );

  if (len <= 0) {
    return;
  }

  buffer[len] = '\0';

  String message(buffer);
  message.trim();
  message.toUpperCase();

  Serial.print("[ARM -> CAR] ");
  Serial.println(message);

  if (
    message == "PICKUP_COMPLETE_DONE" ||
    message == "PICKUP_FINISHED"
  ) {
    if (carState == STATE_PICKUP_WAIT) {
      startReverse();
    }
  }

  if (message == "PICKUP_STARTED") {
    if (carState == STATE_FORWARD) {
      stopCar();
      carState = STATE_PICKUP_WAIT;
      pythonAllowsMovement = false;
      pickupSent = true;
    }
  }
}


// ============================================================
// DISTANCE AND MOVEMENT LOGIC
// ============================================================

void updateCarLogic() {
  unsigned long now = millis();

  if (now - lastDistanceRead < DISTANCE_INTERVAL_MS) {
    return;
  }

  lastDistanceRead = now;
  currentDistance = readDistance();

  if (currentDistance < 0.0f) {
    stopCar();
    return;
  }

  // Stop and initiate pickup at 25 cm.
  if (carState == STATE_FORWARD) {
    if (currentDistance <= STOP_DISTANCE_CM) {
      startPickup();
    } else if (pythonAllowsMovement) {
      moveForward();
    } else {
      stopCar();
    }

    return;
  }

  // Reverse until the measured distance increases by 20 cm.
  if (carState == STATE_REVERSE) {
    if (
      reverseTargetDistance > 0.0f &&
      currentDistance >= reverseTargetDistance
    ) {
      stopCar();

      Serial.println("[CYCLE] Reverse complete");
      Serial.println("[CYCLE] Ready for next bottle");

      // Unlock the next cycle.
      carState = STATE_IDLE;
      pickupSent = false;
      pythonAllowsMovement = false;
      reverseStartDistance = -1.0f;
      reverseTargetDistance = -1.0f;
    } else {
      moveBackward();
    }

    return;
  }

  // Never drive during pickup or while idle.
  stopCar();
}


// ============================================================
// HTTP COMMAND HANDLER
// ============================================================

void handleCommand() {
  if (!server.hasArg("cmd")) {
    server.send(400, "text/plain", "Missing cmd");
    return;
  }

  String cmd = server.arg("cmd");
  cmd.trim();
  cmd.toUpperCase();

  Serial.print("[HTTP] ");
  Serial.print(cmd);
  Serial.print(" -> ");

  if (cmd == "RESET") {
    resetCycle();
    sendToArm("RESET");

    server.send(200, "text/plain", "RESET");
    Serial.println("RESET");
    return;
  }

  if (cmd == "STOP") {
    pythonAllowsMovement = false;

    // Don't cancel an active pickup or reverse sequence.
    if (
      carState != STATE_PICKUP_WAIT &&
      carState != STATE_REVERSE
    ) {
      stopCar();
      carState = STATE_IDLE;
    }

    server.send(200, "text/plain", "STOPPED");
    Serial.println("STOPPED");
    return;
  }

  if (cmd == "FORWARD") {
    // Active pickup/reverse must finish before the next cycle.
    if (
      carState == STATE_PICKUP_WAIT ||
      carState == STATE_REVERSE
    ) {
      stopCar();

      server.send(
        409,
        "text/plain",
        "PICKUP_OR_REVERSE_STILL_ACTIVE"
      );

      Serial.println("PICKUP_OR_REVERSE_STILL_ACTIVE");
      return;
    }

    // Read a fresh measurement before moving.
    float d = readDistance();
    currentDistance = d;

    if (d < 0.0f) {
      stopCar();
      pythonAllowsMovement = false;

      server.send(503, "text/plain", "INVALID_DISTANCE");
      Serial.println("INVALID_DISTANCE");
      return;
    }

    if (d <= STOP_DISTANCE_CM) {
      stopCar();
      pythonAllowsMovement = false;

      // If we were following the bottle, initiate pickup.
      if (carState == STATE_FORWARD && !pickupSent) {
        startPickup();
      } else {
        carState = STATE_IDLE;
      }

      server.send(
        200,
        "text/plain",
        "FORWARD_BLOCKED_DISTANCE"
      );

      Serial.println("FORWARD_BLOCKED_DISTANCE");
      return;
    }

    carState = STATE_FORWARD;
    pythonAllowsMovement = true;

    moveForward();

    server.send(200, "text/plain", "FORWARD_ACCEPTED");
    Serial.println("FORWARD_ACCEPTED");
    return;
  }

  if (cmd == "BACKWARD") {
    if (
      carState == STATE_PICKUP_WAIT ||
      carState == STATE_REVERSE
    ) {
      server.send(409, "text/plain", "SEQUENCE_ACTIVE");
      Serial.println("SEQUENCE_ACTIVE");
      return;
    }

    pythonAllowsMovement = false;
    carState = STATE_IDLE;
    moveBackward();

    server.send(200, "text/plain", "BACKWARD");
    Serial.println("BACKWARD");
    return;
  }

  server.send(400, "text/plain", "UNKNOWN_COMMAND");
  Serial.println("UNKNOWN_COMMAND");
}


// ============================================================
// HTTP STATUS AND DISTANCE
// ============================================================

void handleStatus() {
  const char* status = "READY";

  switch (carState) {
    case STATE_IDLE:
      status = "READY";
      break;

    case STATE_FORWARD:
      status = "MOVING_ALLOWED";
      break;

    case STATE_PICKUP_WAIT:
      status = "PICKUP_STARTED";
      break;

    case STATE_REVERSE:
      status = "REVERSE_20_ACTIVE";
      break;
  }

  server.send(200, "text/plain", status);
}

void handleDistance() {
  if (currentDistance < 0.0f) {
    server.send(503, "text/plain", "INVALID_DISTANCE");
    return;
  }

  server.send(
    200,
    "text/plain",
    String(currentDistance, 1)
  );
}


// ============================================================
// WIFI
// ============================================================

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("[WIFI] Connecting");

  unsigned long started = millis();

  while (
    WiFi.status() != WL_CONNECTED &&
    millis() - started < 30000
  ) {
    stopCar();
    delay(500);
    Serial.print(".");
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[WIFI] IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("[WIFI] Connection failed");
    stopCar();
  }
}


// ============================================================
// SETUP
// ============================================================

void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);
  stopCar();

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);

  connectWiFi();

  if (WiFi.status() == WL_CONNECTED) {
    if (!armFeedbackUdp.begin(CAR_FEEDBACK_PORT)) {
      Serial.println("[UDP] Feedback listener failed");
    } else {
      Serial.print("[UDP] Listening on port ");
      Serial.println(CAR_FEEDBACK_PORT);
    }
  }

  server.on("/command", HTTP_GET, handleCommand);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/distance", HTTP_GET, handleDistance);

  server.on("/reset", HTTP_GET, []() {
    resetCycle();
    sendToArm("RESET");
    server.send(200, "text/plain", "RESET_COMPLETE");
  });

  server.begin();

  currentDistance = readDistance();
  lastDistanceRead = millis();

  Serial.println("[CAR] HTTP server started");
  Serial.println("[CAR] READY");
}


// ============================================================
// MAIN LOOP
// ============================================================

void loop() {
  server.handleClient();

  checkArmFeedback();

  updateCarLogic();

  server.handleClient();

  delay(1);
}
