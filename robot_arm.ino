#include <WiFi.h>
#include <WiFiUdp.h>
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

// ============================================================
// WIFI SETTINGS
// ============================================================

const char* WIFI_SSID = "Yash";
const char* WIFI_PASSWORD = "Leum9932";

// ============================================================
// NETWORK SETTINGS
// ARM IP IS ASSIGNED AUTOMATICALLY BY WIFI (DHCP)
// ============================================================

IPAddress CAR_IP(10, 172, 189, 44);
IPAddress CAMERA_IP(10, 172, 189, 233);

// UDP PORTS
const uint16_t SLIDER_PORT = 4242;
const uint16_t COMMAND_PORT = 5005;
const uint16_t FEEDBACK_PORT = 5006;

// ============================================================
// PCA9685 SETTINGS
// ============================================================

Adafruit_PWMServoDriver pwm = Adafruit_PWMServoDriver(0x40);

const uint8_t SERVO_COUNT = 6;
const uint8_t SERVO_CHANNELS[6] = {0, 1, 2, 3, 4, 5};

const uint16_t SERVO_MIN_US = 500;
const uint16_t SERVO_MAX_US = 2500;
const uint16_t SERVO_FREQUENCY = 50;

// ============================================================
// ============================================================
// HOME ANGLES & JOINT LIMITS
// ============================================================

const uint8_t HOME_ANGLES[6] = {
  146,  // Servo 0: Base
  180,  // Servo 1: Shoulder
  46,   // Servo 2: Elbow
  78,  // Servo 3: Wrist Pitch (Home: 124°, Max: 240°)
  119,  // Servo 4: Wrist Roll (Home: 119° - Level)
  157   // Servo 5: Gripper (170° Open, 90° Closed)
};

// Calibrated joint limits (0-180 wire byte format; CH3 represents 0°-360° mechanical range)
const uint8_t MIN_ANGLES[6] = {0, 0, 0, 0, 0, 0};
const uint8_t MAX_ANGLES[6] = {180, 180, 180, 180, 180, 180};

uint8_t currentAngles[6] = {
  146, 180, 46, 78, 119, 157
};

// Target angles commanded via UDP slider or commands
float targetAngles[6] = {
  146.0f, 180.0f, 46.0f, 78.0f, 119.0f, 157.0f
};

// Current interpolated physical position of each servo
float actualAngles[6] = {
  146.0f, 180.0f, 46.0f, 78.0f, 119.0f, 157.0f
};

// Max degrees per step for smooth motion (66Hz update)
// CH0=Base (2.5°), CH1=Shoulder (2.0°), CH2=Elbow (2.5°), CH3=Pitch (3.0°), CH4=Roll (2.5°), CH5=Gripper (3.5°)
const float MAX_STEP_DEG[6] = {
  2.5f, 2.0f, 2.5f, 3.0f, 2.5f, 3.5f
};

unsigned long lastSmoothUpdateTime = 0;
const unsigned long SMOOTH_INTERVAL_MS = 15; // 66Hz smooth motion update

// ============================================================
// UDP
// ============================================================

WiFiUDP sliderUDP;
WiFiUDP commandUDP;
WiFiUDP feedbackUDP;

// ============================================================
// HOMING STATE
// ============================================================

bool homing = false;
bool pickupCompleteHoming = false;

uint8_t homeServoIndex = 0;
int homeCurrentAngle = 0;

unsigned long lastStepTime = 0;
unsigned long pauseUntil = 0;

const unsigned long STEP_INTERVAL = 20;
const unsigned long SERVO_PAUSE = 500;

// ============================================================
// ANGLE TO PWM CONVERSION
// ============================================================

uint16_t angleToPulse(uint8_t index, float angle) {
  if (index >= SERVO_COUNT) {
    return SERVO_MIN_US;
  }

  uint8_t minA = MIN_ANGLES[index];
  uint8_t maxA = MAX_ANGLES[index];
  angle = constrain(angle, (float)minA, (float)maxA);

  return map(
    (long)(angle * 10),
    (long)(minA * 10),
    (long)(maxA * 10),
    SERVO_MIN_US,
    SERVO_MAX_US
  );
}

// ============================================================
// MOVE SERVO (IMMEDIATE OR TARGET SETTING)
// ============================================================

void setServoAngle(uint8_t index, uint8_t angle, bool immediate = false) {
  if (index >= SERVO_COUNT) {
    return;
  }

  angle = constrain(angle, MIN_ANGLES[index], MAX_ANGLES[index]);
  targetAngles[index] = (float)angle;

  if (immediate) {
    actualAngles[index] = (float)angle;
    uint16_t pulse = angleToPulse(index, actualAngles[index]);
    pwm.writeMicroseconds(
      SERVO_CHANNELS[index],
      pulse
    );
    currentAngles[index] = angle;
  }
}

// ============================================================
// SMOOTH MOTION UPDATE LOOP (66Hz SLEW-RATE LIMITING)
// ============================================================

void updateServoPositions() {
  unsigned long now = millis();
  if (now - lastSmoothUpdateTime < SMOOTH_INTERVAL_MS) {
    return;
  }
  lastSmoothUpdateTime = now;

  for (int i = 0; i < SERVO_COUNT; i++) {
    float diff = targetAngles[i] - actualAngles[i];
    if (abs(diff) > 0.05f) {
      float step = MAX_STEP_DEG[i];
      if (abs(diff) <= step) {
        actualAngles[i] = targetAngles[i];
      } else {
        actualAngles[i] += (diff > 0 ? step : -step);
      }

      uint16_t pulse = angleToPulse(i, actualAngles[i]);
      pwm.writeMicroseconds(
        SERVO_CHANNELS[i],
        pulse
      );
      currentAngles[i] = (uint8_t)round(actualAngles[i]);
    }
  }
}

// ============================================================
// SEND FEEDBACK TO CAR
// ============================================================

void sendFeedback(const char* message) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[FEEDBACK] WiFi not connected");
    return;
  }

  feedbackUDP.beginPacket(CAR_IP, FEEDBACK_PORT);
  feedbackUDP.print(message);
  feedbackUDP.endPacket();

  Serial.print("[ARM -> CAR] ");
  Serial.println(message);
}

// ============================================================
// STOP HOMING
// ============================================================

void stopHoming() {
  homing = false;
  pickupCompleteHoming = false;

  Serial.println();
  Serial.println("[ARM] HOMING STOPPED");
  Serial.println("[ARM] Servos holding current position");
}

// ============================================================
// START HOMING
// ============================================================

void startHoming(bool forPickupComplete = false) {
  if (homing) {
    Serial.println("[ARM] HOME already running");
    return;
  }

  homing = true;
  pickupCompleteHoming = forPickupComplete;
  homeServoIndex = 0;
  homeCurrentAngle = currentAngles[0];

  lastStepTime = millis();
  pauseUntil = 0;

  if (pickupCompleteHoming) {
    sendFeedback("PICKUP_COMPLETE_START");

    Serial.println();
    Serial.println("[ARM] PICKUP COMPLETE");
    Serial.println("[ARM] RETURNING TO HOME");
  } else {
    sendFeedback("HOME_START");

    Serial.println();
    Serial.println("[ARM] HOME STARTED");
  }

  Serial.println("[ARM] Non-blocking homing enabled");
}

// ============================================================
// UPDATE HOMING
// ============================================================

void updateHoming() {
  if (!homing) {
    return;
  }

  if (millis() < pauseUntil) {
    return;
  }

  uint8_t targetAngle = HOME_ANGLES[homeServoIndex];

  // CURRENT SERVO REACHED HOME
  if (homeCurrentAngle == targetAngle) {
    Serial.print("[ARM] Servo ");
    Serial.print(homeServoIndex);
    Serial.println(" reached HOME");

    homeServoIndex++;

    // ALL SERVOS COMPLETE
    if (homeServoIndex >= SERVO_COUNT) {
      homing = false;

      if (pickupCompleteHoming) {
        sendFeedback("PICKUP_COMPLETE_DONE");

        pickupCompleteHoming = false;

        Serial.println();
        Serial.println("[ARM] PICKUP COMPLETE");
        Serial.println("[ARM] ARM IS HOME");
      } else {
        sendFeedback("HOME_DONE");

        Serial.println();
        Serial.println("[ARM] HOME COMPLETED");
      }

      return;
    }

    // START NEXT SERVO
    homeCurrentAngle = currentAngles[homeServoIndex];
    pauseUntil = millis() + SERVO_PAUSE;

    Serial.print("[ARM] Moving Servo ");
    Serial.println(homeServoIndex);

    return;
  }

  // MOVEMENT SPEED
  if (millis() - lastStepTime < STEP_INTERVAL) {
    return;
  }

  lastStepTime = millis();

  // MOVE ONE DEGREE
  if (homeCurrentAngle < targetAngle) {
    homeCurrentAngle++;
  } else {
    homeCurrentAngle--;
  }

  setServoAngle(homeServoIndex, homeCurrentAngle, true);
}

// ============================================================
// RECEIVE SLIDER DATA
// ============================================================

void receiveSliderData() {
  int packetSize = sliderUDP.parsePacket();

  if (packetSize <= 0) {
    return;
  }

  uint8_t angles[6];

  // PACKET MUST BE EXACTLY 6 BYTES
  if (packetSize != 6) {
    Serial.print("[UDP] Invalid packet size: ");
    Serial.println(packetSize);

    while (sliderUDP.available()) {
      sliderUDP.read();
    }

    return;
  }

  int received = sliderUDP.read(angles, 6);

  if (received != 6) {
    Serial.println("[UDP] Failed to read six angles");
    return;
  }

  // VALIDATE ANGLES
  for (int i = 0; i < 6; i++) {
    if (angles[i] < MIN_ANGLES[i] || angles[i] > MAX_ANGLES[i]) {
      Serial.print("[UDP] Invalid angle on joint ");
      Serial.print(i);
      Serial.print(": ");
      Serial.println(angles[i]);
      return;
    }
  }

  // IGNORE SLIDER DURING HOMING
  if (homing) {
    Serial.println("[UDP] Slider ignored during HOME");
    return;
  }

  // UPDATE ALL SERVOS WITH SMOOTH INTERPOLATION
  for (int i = 0; i < 6; i++) {
    setServoAngle(i, angles[i], false);
  }

  // DEBUG
  Serial.print("[UDP] Angles: ");

  for (int i = 0; i < 6; i++) {
    Serial.print(angles[i]);

    if (i < 5) {
      Serial.print(", ");
    }
  }

  Serial.println();
}

// ============================================================
// RECEIVE COMMANDS
// ============================================================

void receiveCommands() {
  int packetSize = commandUDP.parsePacket();

  if (packetSize <= 0) {
    return;
  }

  char buffer[64];

  int length = commandUDP.read(
    buffer,
    sizeof(buffer) - 1
  );

  if (length <= 0) {
    return;
  }

  buffer[length] = '\0';

  String command = String(buffer);

  command.trim();
  command.toUpperCase();

  Serial.println();
  Serial.print("[COMMAND] ");
  Serial.println(command);

  // HOME
  if (command == "HOME") {
    startHoming(false);
  }

  // PICKUP
  else if (command == "PICKUP") {
    sendFeedback("PICKUP_STARTED");

    Serial.println();
    Serial.println("================================");
    Serial.println("[ARM] PICKUP STARTED");
    Serial.println("[ARM] MANUAL CONTROL ENABLED");
    Serial.println("[ARM] Use slider GUI");
    Serial.println("================================");
  }

  // PICKUP COMPLETE
  else if (command == "PICKUP_COMPLETE") {
    startHoming(true);
  }

  // STOP
  else if (command == "STOP") {
    stopHoming();
  }

  // RESET
  else if (command == "RESET") {
    stopHoming();
    pickupCompleteHoming = false;

    Serial.println("[ARM] RESET received");
  }

  // UNKNOWN COMMAND
  else {
    Serial.print("[ARM] Unknown command: ");
    Serial.println(command);
  }
}

// ============================================================
// CONNECT WIFI USING DHCP
// ============================================================

void connectWiFi() {
  WiFi.mode(WIFI_STA);

  // Better UDP responsiveness
  WiFi.setSleep(false);

  Serial.println();
  Serial.print("[WIFI] Connecting to ");
  Serial.println(WIFI_SSID);

  // DHCP assigns the actual ARM IP.
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startTime = millis();

  while (
    WiFi.status() != WL_CONNECTED &&
    millis() - startTime < 20000
  ) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();

  // CONNECTION FAILED
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WIFI] Connection failed");
    Serial.println("[WIFI] Restarting...");

    delay(3000);
    ESP.restart();
    return;
  }

  // CONNECTION SUCCESSFUL
  Serial.println();
  Serial.println("========================================");
  Serial.println("           WIFI CONNECTED");
  Serial.println("========================================");

  Serial.print("[WIFI] ACTUAL ARM IP: ");
  Serial.println(WiFi.localIP());

  Serial.print("[WIFI] Gateway: ");
  Serial.println(WiFi.gatewayIP());

  Serial.print("[WIFI] Subnet: ");
  Serial.println(WiFi.subnetMask());

  Serial.print("[WIFI] RSSI: ");
  Serial.println(WiFi.RSSI());

  Serial.print("[WIFI] CAR IP: ");
  Serial.println(CAR_IP);

  Serial.print("[WIFI] CAMERA IP: ");
  Serial.println(CAMERA_IP);
}

// ============================================================
// CHECK PCA9685
// ============================================================

bool checkPCA9685() {
  Wire.beginTransmission(0x40);

  byte error = Wire.endTransmission();

  if (error == 0) {
    Serial.println("[I2C] PCA9685 detected at 0x40");
    return true;
  }

  Serial.println("[I2C ERROR] PCA9685 not detected");
  return false;
}

// ============================================================
// SETUP
// ============================================================

void setup() {
  Serial.begin(115200);

  delay(1500);

  Serial.println();
  Serial.println("========================================");
  Serial.println("          WAREBOT ARM ESP32");
  Serial.println("========================================");

  // I2C
  Wire.begin(21, 22);

  // CHECK PCA9685
  checkPCA9685();

  // START PCA9685
  pwm.begin();

  pwm.setOscillatorFrequency(27000000);
  pwm.setPWMFreq(SERVO_FREQUENCY);

  delay(500);

  // CONNECT WIFI
  connectWiFi();

  // START UDP PORTS
  sliderUDP.begin(SLIDER_PORT);
  commandUDP.begin(COMMAND_PORT);
  feedbackUDP.begin(FEEDBACK_PORT);

  // NETWORK DETAILS
  Serial.println();
  Serial.println("========================================");
  Serial.println("               NETWORK");
  Serial.println("========================================");

  Serial.print("ACTUAL ARM IP: ");
  Serial.println(WiFi.localIP());

  Serial.print("CAR IP       : ");
  Serial.println(CAR_IP);

  Serial.print("CAMERA IP    : ");
  Serial.println(CAMERA_IP);

  Serial.print("Gateway      : ");
  Serial.println(WiFi.gatewayIP());

  Serial.println();
  Serial.println("========================================");
  Serial.println("UDP PORTS");
  Serial.println("========================================");

  Serial.print("Slider UDP  : ");
  Serial.println(SLIDER_PORT);

  Serial.print("Command UDP : ");
  Serial.println(COMMAND_PORT);

  Serial.print("Feedback UDP: ");
  Serial.println(FEEDBACK_PORT);

  // INITIAL HOME POSITION
  Serial.println();
  Serial.println("[ARM] Initializing servo positions...");

  for (int i = 0; i < 6; i++) {
    setServoAngle(i, HOME_ANGLES[i], true);
    delay(250);
  }

  // READY
  Serial.println();
  Serial.println("========================================");
  Serial.println("              ARM READY");
  Serial.println("========================================");

  Serial.println("Waiting for slider / CAR commands...");
}

// ============================================================
// LOOP
// ============================================================

void loop() {
  // COMMANDS FIRST
  receiveCommands();

  // SLIDER DATA
  receiveSliderData();

  // NON-BLOCKING HOME MOVEMENT
  updateHoming();

  // SMOOTH INTERPOLATED MOTION UPDATE
  updateServoPositions();

  delay(2);
}