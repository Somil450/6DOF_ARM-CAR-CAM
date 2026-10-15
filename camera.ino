/*
  WAREBOT - ESP32-CAM CONTINUOUS LOW-LATENCY MJPEG STREAM
  Board: AI Thinker ESP32-CAM

  Wi-Fi: Somil's A35
  Camera IP: DHCP; check Serial Monitor at 115200 baud
  CAR IP: 10.116.205.44 (display only)
  ARM IP: 10.116.205.193 (display only)

  Endpoints:
    /         Live video page
    /stream   Continuous MJPEG video
    /capture  Single JPEG snapshot
*/

#include "esp_camera.h"
#include <WiFi.h>
#include "esp_http_server.h"

// ---------------- Wi-Fi ----------------
const char* WIFI_SSID = "Somil's A35";
const char* WIFI_PASSWORD = "somil@12";

IPAddress ARM_IP(10, 116, 205, 193);
IPAddress CAR_IP(10, 116, 205, 44);

// ---------------- AI Thinker camera pins ----------------
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

static httpd_handle_t camera_httpd = nullptr;
static bool cameraReady = false;

static unsigned long lastWiFiCheck = 0;
static const unsigned long WIFI_CHECK_INTERVAL_MS = 5000;

static const char* STREAM_CONTENT_TYPE =
    "multipart/x-mixed-replace; boundary=frame";

static const char* STREAM_BOUNDARY = "\r\n--frame\r\n";

static const char* STREAM_PART_HEADER =
    "Content-Type: image/jpeg\r\n"
    "Content-Length: %u\r\n\r\n";

// ---------------- Camera initialization ----------------
bool initializeCamera() {
  camera_config_t config = {};

  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;

  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;

  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;

  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;

  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;

  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  // High resolution with zero-lag streaming
  if (psramFound()) {
    config.frame_size = FRAMESIZE_VGA;  // 640 x 480 High Resolution
    config.jpeg_quality = 18;           // 18 is optimal: 18KB payload, crystal clear, ultra-low Wi-Fi latency
    config.fb_count = 2;
    config.grab_mode = CAMERA_GRAB_LATEST; // Always grab newest frame (zero lag)
    config.fb_location = CAMERA_FB_IN_PSRAM;
  } else {
    config.frame_size = FRAMESIZE_HVGA; // 480 x 320
    config.jpeg_quality = 20;
    config.fb_count = 1;
    config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
    config.fb_location = CAMERA_FB_IN_DRAM;
  }

  esp_err_t err = esp_camera_init(&config);

  if (err != ESP_OK) {
    Serial.printf("[CAMERA ERROR] Init failed: 0x%x\n", err);
    return false;
  }

  sensor_t* sensor = esp_camera_sensor_get();

  if (sensor != nullptr) {
    if (psramFound()) {
      sensor->set_framesize(sensor, FRAMESIZE_VGA);
      sensor->set_quality(sensor, 18);
    } else {
      sensor->set_framesize(sensor, FRAMESIZE_HVGA);
      sensor->set_quality(sensor, 20);
    }
    sensor->set_brightness(sensor, 1);
    sensor->set_contrast(sensor, 1);
    sensor->set_saturation(sensor, 0);
  }

  Serial.printf(
      "[CAMERA] Initialized; PSRAM: %s; resolution: 640x480\n",
      psramFound() ? "yes" : "no"
  );

  return true;
}

// ---------------- Network information ----------------
void printNetworkInfo() {
  Serial.println("\n========== WAREBOT CAMERA ==========");

  Serial.print("Camera IP: ");
  Serial.println(WiFi.localIP());

  Serial.print("Camera stream: http://");
  Serial.print(WiFi.localIP());
  Serial.println("/stream");

  Serial.print("Live page: http://");
  Serial.print(WiFi.localIP());
  Serial.println("/");

  Serial.print("Snapshot: http://");
  Serial.print(WiFi.localIP());
  Serial.println("/capture");

  Serial.print("CAR IP: ");
  Serial.println(CAR_IP);

  Serial.print("ARM IP: ");
  Serial.println(ARM_IP);

  Serial.print("Wi-Fi RSSI: ");
  Serial.println(WiFi.RSSI());

  Serial.println("====================================\n");
}

// ---------------- Live page ----------------
static esp_err_t rootHandler(httpd_req_t* req) {
  const char html[] =
      "<!doctype html><html><head>"
      "<meta name='viewport' content='width=device-width,initial-scale=1'>"
      "<title>WAREBOT Live Video</title>"
      "<style>"
      "body{margin:0;background:#111;color:#eee;font-family:Arial;text-align:center}"
      "h2{font-size:20px;padding:10px}"
      "img{display:block;width:100%;max-width:960px;height:auto;margin:auto}"
      "</style></head><body>"
      "<h2>WAREBOT - CONTINUOUS LIVE VIDEO</h2>"
      "<img src='/stream' alt='Connecting to live stream'>"
      "</body></html>";

  httpd_resp_set_type(req, "text/html; charset=utf-8");
  httpd_resp_set_hdr(req, "Cache-Control", "no-store");

  return httpd_resp_send(req, html, HTTPD_RESP_USE_STRLEN);
}

// ---------------- Single snapshot endpoint ----------------
static esp_err_t captureHandler(httpd_req_t* req) {
  if (!cameraReady) {
    httpd_resp_set_status(req, "503 Service Unavailable");
    httpd_resp_set_type(req, "text/plain");
    return httpd_resp_sendstr(req, "Camera not ready");
  }

  camera_fb_t* fb = esp_camera_fb_get();

  if (fb == nullptr) {
    httpd_resp_set_status(req, "500 Internal Server Error");
    httpd_resp_set_type(req, "text/plain");
    return httpd_resp_sendstr(req, "Camera capture failed");
  }

  if (fb->format != PIXFORMAT_JPEG || fb->len == 0) {
    esp_camera_fb_return(fb);
    httpd_resp_set_status(req, "500 Internal Server Error");
    httpd_resp_set_type(req, "text/plain");
    return httpd_resp_sendstr(req, "Invalid JPEG frame");
  }

  httpd_resp_set_type(req, "image/jpeg");
  httpd_resp_set_hdr(req, "Cache-Control", "no-store, no-cache, must-revalidate");

  esp_err_t result = httpd_resp_send(
      req,
      reinterpret_cast<const char*>(fb->buf),
      fb->len
  );

  esp_camera_fb_return(fb);
  return result;
}

// ---------------- Continuous MJPEG stream ----------------
static esp_err_t streamHandler(httpd_req_t* req) {
  httpd_resp_set_type(req, STREAM_CONTENT_TYPE);

  httpd_resp_set_hdr(
      req,
      "Cache-Control",
      "no-store, no-cache, must-revalidate"
  );

  httpd_resp_set_hdr(req, "Pragma", "no-cache");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");

  Serial.println("[STREAM] Client connected");

  char partHeader[96];
  unsigned long framesSent = 0;
  esp_err_t result = ESP_OK;

  while (true) {
    camera_fb_t* fb = esp_camera_fb_get();

    // In double-buffered PSRAM mode, flush older queued buffer to guarantee instant live frame
    if (psramFound() && fb != nullptr) {
      esp_camera_fb_return(fb);
      fb = esp_camera_fb_get();
    }

    if (fb == nullptr) {
      Serial.println("[STREAM ERROR] Frame capture failed");
      result = ESP_FAIL;
      break;
    }

    if (fb->format != PIXFORMAT_JPEG || fb->len == 0) {
      esp_camera_fb_return(fb);
      Serial.println("[STREAM ERROR] Invalid JPEG frame");
      result = ESP_FAIL;
      break;
    }

    // Start the next MJPEG frame.
    result = httpd_resp_send_chunk(
        req,
        STREAM_BOUNDARY,
        strlen(STREAM_BOUNDARY)
    );

    // Send JPEG frame headers.
    if (result == ESP_OK) {
      int headerLen = snprintf(
          partHeader,
          sizeof(partHeader),
          STREAM_PART_HEADER,
          static_cast<unsigned int>(fb->len)
      );

      result = httpd_resp_send_chunk(
          req,
          partHeader,
          headerLen
      );
    }

    // Send JPEG frame data.
    if (result == ESP_OK) {
      result = httpd_resp_send_chunk(
          req,
          reinterpret_cast<const char*>(fb->buf),
          fb->len
      );
    }

    // Release the camera buffer on every path.
    esp_camera_fb_return(fb);

    if (result != ESP_OK) {
      Serial.printf("[STREAM] Send ended (error=%d)\n", (int)result);
      break;
    }

    framesSent++;

    if (framesSent % 100 == 0) {
      Serial.printf("[STREAM] %lu frames sent\n", framesSent);
    }

    // Pace stream to prevent lwIP TCP socket buffer bloat
    vTaskDelay(pdMS_TO_TICKS(10));
  }

  Serial.printf(
      "[STREAM] Client disconnected; total frames: %lu\n",
      framesSent
  );

  return result;
}

// ---------------- HTTP server ----------------
bool startCameraServer() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();

  config.server_port = 80;
  config.ctrl_port = 32768;
  config.max_uri_handlers = 8;
  config.stack_size = 8192;
  config.send_wait_timeout = 10;
  config.recv_wait_timeout = 10;
  config.lru_purge_enable = true;

  if (httpd_start(&camera_httpd, &config) != ESP_OK) {
    Serial.println("[HTTP ERROR] Server start failed");
    camera_httpd = nullptr;
    return false;
  }

  httpd_uri_t rootUri = {};
  rootUri.uri = "/";
  rootUri.method = HTTP_GET;
  rootUri.handler = rootHandler;

  httpd_uri_t streamUri = {};
  streamUri.uri = "/stream";
  streamUri.method = HTTP_GET;
  streamUri.handler = streamHandler;

  httpd_uri_t captureUri = {};
  captureUri.uri = "/capture";
  captureUri.method = HTTP_GET;
  captureUri.handler = captureHandler;

  if (httpd_register_uri_handler(camera_httpd, &rootUri) != ESP_OK ||
      httpd_register_uri_handler(camera_httpd, &streamUri) != ESP_OK ||
      httpd_register_uri_handler(camera_httpd, &captureUri) != ESP_OK) {
    Serial.println("[HTTP ERROR] Route registration failed");
    httpd_stop(camera_httpd);
    camera_httpd = nullptr;
    return false;
  }

  Serial.println("[HTTP] Server started on port 80");
  return true;
}

// ---------------- Wi-Fi connection ----------------
void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.printf("[WIFI] Connecting to %s", WIFI_SSID);

  unsigned long started = millis();

  while (WiFi.status() != WL_CONNECTED &&
         millis() - started < 25000) {
    delay(300);
    Serial.print('.');
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("[WIFI] Connected");
    printNetworkInfo();
  } else {
    Serial.println("[WIFI ERROR] Connection failed");
  }
}

void maintainWiFi() {
  if (millis() - lastWiFiCheck < WIFI_CHECK_INTERVAL_MS) {
    return;
  }

  lastWiFiCheck = millis();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WIFI] Disconnected; reconnecting");
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }
}

// ---------------- Setup ----------------
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\nWAREBOT ESP32-CAM LOW-LATENCY STREAM STARTING");

  cameraReady = initializeCamera();

  if (!cameraReady) {
    Serial.println("[FATAL] Camera initialization failed; restarting");
    delay(4000);
    ESP.restart();
  }

  connectWiFi();

  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    WiFi.reconnect();
  }

  if (!startCameraServer()) {
    Serial.println("[FATAL] HTTP server failed; restarting");
    delay(4000);
    ESP.restart();
  }

  printNetworkInfo();
}

// ---------------- Main loop ----------------
void loop() {
  maintainWiFi();
  delay(10);
}
