
export interface CodeFile {
  name: string;
  language: 'c' | 'cpp' | 'cmake' | 'json' | 'bash' | 'yaml';
  content: string;
}

export interface Directory {
  name:string;
  files: CodeFile[];
  directories?: Directory[];
  isOpen?: boolean;
}

// ==========================================================================
// DOCUMENTATION (v10.0)
// ==========================================================================

const DOCS_SETUP_MD = `# Developer Setup Guide

This guide describes how to set up a local development environment for the DPA Premium firmware.

## 1. Prerequisites

- A Linux or macOS environment (Windows with WSL2 is also suitable).
- Git version control.
- Python 3.8 or higher.

## 2. ESP-IDF Setup

The project is built using ESP-IDF v5.1.

\`\`\`bash
# 1. Clone the ESP-IDF repository
git clone -b v5.1 --recursive https://github.com/espressif/esp-idf.git

# 2. Run the installer
cd esp-idf
./install.sh esp32s3

# 3. Source the environment script
# Add this line to your .bashrc or .zshrc for convenience
source $HOME/esp-idf/export.sh
\`\`\`

## 3. Project Build

With the environment configured, you can now build the firmware.

\`\`\`bash
# 1. Clone the DPA Premium firmware repository
git clone <repo_url>
cd dpa-premium-firmware

# 2. Set the target SoC
idf.py set-target esp32s3

# 3. Build the project
idf.py build
\`\`\`

A successful build will generate the \`dpa-firmware.bin\` file in the \`build/\` directory.
`;

const DOCS_CAPSULE_SPEC_MD = `# DPA Capsule Specification (v2.0)

A DPA Capsule (\`.dpa\` file) is a secure, multi-content container for delivering digital assets like audio, metadata, and unlockable perks.

## Philosophy

The format is designed to be extensible. It uses a manifest to describe the contents, allowing a single encrypted capsule to hold multiple, distinct data blocks (e.g., an audio track, tour date information, and a merchandise image).

## Binary Structure

The file consists of a fixed-size header, a variable-size manifest, and the concatenated data blocks. All multi-byte fields are little-endian.

### 1. Header (64 Bytes)

| Offset | Size | Field              | Description                                                  |
|--------|------|--------------------|--------------------------------------------------------------|
| 0      | 4    | Magic              | Must be **"DPA2"** (0x32415044)                               |
| 4      | 4    | Version            | Capsule format version, currently \`2\`.                         |
| 8      | 16   | IV                 | 128-bit Initialization Vector for the AES-CTR cipher stream. |
| 24     | 32   | Wrapped Key        | 256-bit AES content key, encrypted with a hardware master key. |
| 56     | 4    | Manifest Entries   | The number of \`dpa_manifest_entry_t\` structs that follow.      |
| 60     | 4    | Reserved           | Must be zero.                                                |

### 2. Content Manifest (N * 64 Bytes)

Immediately following the header is an array of \`dpa_manifest_entry_t\` structs. The size of this section is \`Manifest Entries * 64\`.

#### Manifest Entry Structure (64 Bytes)

| Rel. Offset | Size | Field      | Description                                                                                                   |
|-------------|------|------------|---------------------------------------------------------------------------------------------------------------|
| 0           | 4    | \`type\`     | A \`dpa_content_type_t\` enum value (e.g., \`1\` for Audio).                                                        |
| 4           | 4    | \`flags\`    | Reserved for future use (e.g., compression hints). Must be zero.                                                |
| 8           | 32   | \`id\`       | Null-terminated UTF-8 string identifier for the content (e.g., "track_01", "merch_tee_1"). Max 31 chars + null. |
| 40          | 8    | \`offset\`   | Byte offset of this content's data, relative to the start of the Data Region.                                   |
| 48          | 8    | \`size\`     | The exact size of this content's data in bytes.                                                                 |
| 56          | 8    | \`metadata\` | Content-specific data. For 24/96 audio, this could be the sample rate (96000). For links, it could be an index. |

### 3. Data Region

This region starts immediately after the Content Manifest. It contains all the raw, encrypted data for all content entries, concatenated together. The \`offset\` field in each manifest entry points to a location within this region.

## Encryption

- The entire capsule, starting from the **Content Manifest** to the end of the file, is treated as a single continuous stream encrypted with **AES-256-CTR**. The header itself is not encrypted.
- The **Wrapped Key** in the header is encrypted using a NIST Key Wrap algorithm (e.g., AES-KW) with a hardware-derived master key. This prevents the content key from being extracted on non-authorized hardware.
`;

const DOCS_API_MD = `# DPA BLE API Specification

This document defines the GATT service and characteristics for interacting with the DPA Premium device.

**Service UUID**: \`5c6c0000-1212-efde-1523-785feabcd123\`

| Name                 | UUID Suffix | Access   | Description                                           |
|----------------------|-------------|----------|-------------------------------------------------------|
| **Identity**         | \`...0100\`   | Read     | Returns the UTF-8 string of the \`DPA_ALBUM_ID\`.       |
| **OTA URL**          | \`...0300\`   | Write    | Write a UTF-8 URL to trigger a firmware update.       |
| **Playback Control** | \`...0400\`   | Write    | Write a single byte command: <br> \`0x01\`: Toggle Play/Pause <br> \`0x02\`: Next Track <br> \`0x03\`: Previous Track |
| **Playback Status**  | \`...0500\`   | Notify   | Notifies with a single byte: <br> \`0x00\`: Idle/Paused <br> \`0x01\`: Playing |
| **Battery Level**    | \`...0600\`   | Notify   | Notifies with a single byte representing battery percentage (0-100). |
`;

// ==========================================================================
// ROOT CONFIGURATION
// ==========================================================================

const ROOT_CMAKE = `cmake_minimum_required(VERSION 3.16)

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(dpa_premium_firmware)
`;

const SDKCONFIG_DEFAULTS = `CONFIG_IDF_TARGET="esp32s3"
CONFIG_ESP32S3_DEFAULT_CPU_FREQ_240=y
CONFIG_SPIRAM_MODE_OCT=y
CONFIG_SPIRAM_TYPE_AUTO=y
CONFIG_DPA_AUDIO_DMA_BUF_COUNT=8
CONFIG_DPA_AUDIO_DMA_BUF_LEN=1024
CONFIG_PARTITION_TABLE_CUSTOM=y
CONFIG_PARTITION_TABLE_CUSTOM_FILENAME="partitions.csv"
CONFIG_SECURE_BOOT=y
CONFIG_SECURE_BOOT_V2_ENABLED=y
CONFIG_ESP_FLASH_ENCRYPTION_ENABLED=y
CONFIG_ESP_COREDUMP_ENABLE_TO_FLASH=y
CONFIG_ESP_TASK_WDT_EN=y
CONFIG_ESP_TASK_WDT_TIMEOUT_S=5
`;

const PARTITIONS_CSV = `# Name,   Type, SubType, Offset,  Size, Flags
nvs,      data, nvs,     ,        0x4000,
otadata,  data, ota,     ,        0x2000,
phy_init, data, phy,     ,        0x1000,
coredump, data, coredump,,        64K,
factory,  app,  factory, ,        4M,
storage,  data, spiffs,  ,        8M, encrypted
`;

const README_MD = `# DPA Premium Firmware v11.0.0

This repository contains the final architectural blueprint for the DPA Premium audio player firmware, built on ESP-IDF v5.1 for the ESP32-S3.

## Getting Started

A complete guide for setting up a local development environment and building the firmware can be found in the documentation:

**[Developer Setup Guide](./docs/SETUP.md)**

## Architecture

The firmware is a zoneless, event-driven system. The key to the DPA platform is the multi-content capsule format, which allows a single secure file to deliver the entire digital experience.

- **[Capsule v2.0 Specification](./docs/CAPSULE_SPEC.md)**: **REQUIRED READING.** Defines the manifest-based secure audio file format.
- **[BLE API Specification](./docs/API.md)**: Defines the GATT contract for mobile app interaction.

## Next Steps / Implementation Plan

The current codebase represents a complete and stable architecture. The following tasks are the priority for the development team to transform the architectural stubs into production features:

1.  **Audio Decoder Integration** (\`dpa_player.c\`)
    -   License and integrate a lightweight, high-resolution audio codec (e.g., Opus, FLAC).
    -   Modify the \`player_task\` to decode the 24-bit/96kHz stream into PCM data before writing to the I2S HAL.

2.  **Perk/Content Unlocking Logic** (\`dpa_core\` and \`main.c\`)
    -   Implement UI/LED feedback for available perks discovered in a capsule's manifest.
    -   Create tasks to handle non-audio content types (e.g., displaying a merch image URL via BLE).

3.  **Power Management IC (PMIC) Logic** (\`dpa_power.c\`)
    -   Implement the I2C driver for the selected PMIC.
    -   Add logic to the \`power_monitor_task\` to handle charging states (Charging, Charged, Discharging).
`;

// ==========================================================================
// COMPONENT: CORE
// ==========================================================================

const CORE_CMAKE = `idf_component_register(SRCS "dpa_core.c"
                    INCLUDE_DIRS "."
                    REQUIRES esp_common freertos)`;

const DPA_BOARD_H = `#pragma once

// --- DPA IDENTITY ---
#define DPA_ALBUM_ID        "ALBUM_883_MIDNIGHT_ECHOES"
#define DPA_ARTIST_ID       "ARTIST_29_NEON_SKY"
#define DPA_DEFAULT_TRACK   "track_01"

// --- IO MAP (ESP32-S3 WROVER) ---
#define DPA_PIN_I2S_BCK     41
#define DPA_PIN_I2S_WS      42
#define DPA_PIN_I2S_DO      40
#define DPA_PIN_I2S_MCK     39

#define DPA_PIN_BTN_MAIN    0
#define DPA_PIN_HAPTIC      4
#define DPA_PIN_LED_DATA    48

#define DPA_PIN_USB_VBUS    2
#define DPA_PIN_BAT_ADC     1

#define DPA_PIN_I2C_SDA     8
#define DPA_PIN_I2C_SCL     9
`;

const DPA_EVENTS_H = `#pragma once
#include <stdint.h>

/**
 * @brief System State Machine
 */
typedef enum {
    DPA_STATE_BOOT = 0,
    DPA_STATE_READY,        // Idle, waiting for input
    DPA_STATE_PLAYING,      // Audio is streaming
    DPA_STATE_SNIPPET_MODE, // Special promo mode
    DPA_STATE_UPDATING,     // OTA in progress
    DPA_STATE_USB_MSC,      // Mass Storage Mode
    DPA_STATE_DIAGNOSTICS,  // Factory Test Mode
    DPA_STATE_LOW_BATTERY,  
    DPA_STATE_ERROR_FATAL   
} dpa_state_t;

/**
 * @brief Unlockable Content Types
 */
typedef enum {
    DPA_PERK_TOUR = 0,    
    DPA_PERK_VIDEO,       
    DPA_PERK_MERCH,       
    DPA_PERK_SIGNING      
} dpa_perk_type_t;

/**
 * @brief Internal Event Bus Messages
 */
typedef enum {
    DPA_EVENT_PLAY_PAUSE,
    DPA_EVENT_NEXT_TRACK,
    DPA_EVENT_TOGGLE_SHUFFLE,
    DPA_EVENT_PERK_AVAILABLE,    
    DPA_EVENT_ENTER_SNIPPET,
    DPA_EVENT_START_UPDATE, // Data: (char*) URL
    DPA_EVENT_BATTERY_LOW,
    DPA_EVENT_SYS_ERROR,
    DPA_EVENT_ENTER_SLEEP   
} dpa_event_t;

typedef struct {
    dpa_event_t type;
    void *data;
} dpa_event_msg_t;
`;

const DPA_CORE_H = `#pragma once
#include "esp_err.h"
#include "dpa_events.h"
#include <stdbool.h>

/**
 * @brief Initialize the main event bus and state machine
 */
esp_err_t dpa_core_init(void);

/**
 * @brief Send an event to the main loop
 * @param type Event type
 * @param data Optional pointer to data (must be valid until processed)
 */
esp_err_t dpa_core_send_event(dpa_event_t type, void *data);

/**
 * @brief Blocking call to receive next event
 */
bool dpa_core_receive(dpa_event_msg_t *msg, uint32_t wait_ms);

/**
 * @brief Update global system state
 */
void dpa_core_set_state(dpa_state_t state);

/**
 * @brief Get current system state
 */
dpa_state_t dpa_core_get_state(void);

/**
 * @brief Enter deep sleep with wake-up triggers configured
 */
void dpa_core_enter_deep_sleep(void);
`;

const DPA_CORE_C = `#include "dpa_core.h"
#include "dpa_events.h"
#include "dpa_board.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "esp_log.h"
#include "esp_sleep.h"

#define TAG "DPA_CORE"

static QueueHandle_t dpa_queue;
static dpa_state_t current_state = DPA_STATE_BOOT;

esp_err_t dpa_core_init(void) {
    dpa_queue = xQueueCreate(20, sizeof(dpa_event_msg_t)); 
    if (!dpa_queue) return ESP_ERR_NO_MEM;
    ESP_LOGI(TAG, "Core Init. Identity: %s", DPA_ALBUM_ID);
    return ESP_OK;
}

esp_err_t dpa_core_send_event(dpa_event_t type, void *data) {
    dpa_event_msg_t msg = { .type = type, .data = data };
    if (xQueueSend(dpa_queue, &msg, 0) != pdTRUE) return ESP_FAIL;
    return ESP_OK;
}

bool dpa_core_receive(dpa_event_msg_t *msg, uint32_t wait_ms) {
    return xQueueReceive(dpa_queue, msg, pdMS_TO_TICKS(wait_ms)) == pdTRUE;
}

void dpa_core_set_state(dpa_state_t state) {
    ESP_LOGI(TAG, "State Change: %d -> %d", current_state, state);
    current_state = state;
}

dpa_state_t dpa_core_get_state(void) {
    return current_state;
}

void dpa_core_enter_deep_sleep(void) {
    ESP_LOGI(TAG, "Entering Deep Sleep...");
    // Wake up if the main button is pressed (LOW level)
    esp_sleep_enable_ext0_wakeup(DPA_PIN_BTN_MAIN, 0); 
    esp_deep_sleep_start();
}
`;

// ==========================================================================
// COMPONENT: SYSTEM
// ==========================================================================

const SYS_CMAKE = `idf_component_register(SRCS "dpa_sys.c" INCLUDE_DIRS "." REQUIRES esp_system esp_timer)`;

const DPA_SYS_H = `#pragma once
#include "esp_err.h"

#define DPA_FW_VERSION "11.0.0"

/**
 * @brief Init Watchdogs, Brownout detectors, and Crash Handlers
 */
esp_err_t dpa_sys_init(void);

/**
 * @brief Get Firmware Version String
 */
const char* dpa_sys_get_version(void);

/**
 * @brief Software Reset with reason logging
 */
void dpa_sys_reboot(const char *reason);
`;

const DPA_SYS_C = `#include "dpa_sys.h"
#include "esp_system.h"
#include "esp_log.h"
#include "esp_task_wdt.h"

#define TAG "SYS"

esp_err_t dpa_sys_init(void) {
    ESP_LOGI(TAG, "Initializing DPA System Services (v%s)", DPA_FW_VERSION);
    
    esp_task_wdt_config_t wdt_config = {
        .timeout_ms = 5000,
        .idle_core_mask = (1 << 0),
        .trigger_panic = true,
    };
    esp_task_wdt_init(&wdt_config);
    esp_task_wdt_add(NULL); // Add current task (main)

    esp_reset_reason_t reason = esp_reset_reason();
    ESP_LOGW(TAG, "Reset Reason: %d", reason);

    return ESP_OK;
}

const char* dpa_sys_get_version(void) {
    return DPA_FW_VERSION;
}

void dpa_sys_reboot(const char *reason) {
    ESP_LOGE(TAG, "System Reboot Requested: %s", reason);
    esp_restart();
}
`;

// ==========================================================================
// COMPONENT: DRM
// ==========================================================================

const DRM_CMAKE = `idf_component_register(SRCS "dpa_drm.c" INCLUDE_DIRS "." REQUIRES mbedtls dpa_security)`;

const DPA_DRM_H = `#pragma once
#include "esp_err.h"
#include "mbedtls/aes.h"

typedef struct {
    mbedtls_aes_context aes;
    size_t nc_off;
    uint8_t nonce_counter[16];
    uint8_t stream_block[16];
} dpa_drm_session_t;

esp_err_t dpa_drm_init_session(dpa_drm_session_t *session, const uint8_t *header_iv, const uint8_t *wrapped_key);
void dpa_drm_decrypt(dpa_drm_session_t *session, uint8_t *data, size_t len);
void dpa_drm_cleanup(dpa_drm_session_t *session);
`;

const DPA_DRM_C = `#include "dpa_drm.h"
#include "esp_log.h"
#include <string.h>

#define TAG "DRM"

// CRITICAL: In production, this MUST be derived from a hardware fuse (e.g., eFuse) 
// or a secure element. A hardcoded key is a major vulnerability.
static const uint8_t DEVICE_MASTER_KEY[32] = { 0xDE, 0xAD, 0xBE, 0xEF, 0x00, 0x11, 0x22, 0x33, /* ... */ };

esp_err_t dpa_drm_init_session(dpa_drm_session_t *session, const uint8_t *header_iv, const uint8_t *wrapped_key) {
    if (!session || !header_iv) return ESP_ERR_INVALID_ARG;

    // In production: use mbedtls_nist_kw_unwrap(...) with the hardware-derived master key
    uint8_t content_key[32]; 
    memcpy(content_key, wrapped_key, 32); // Mock unwrap for architecture demo

    mbedtls_aes_init(&session->aes);
    if (mbedtls_aes_setkey_enc(&session->aes, content_key, 256) != 0) {
        return ESP_FAIL;
    }

    session->nc_off = 0;
    memcpy(session->nonce_counter, header_iv, 16);
    memset(session->stream_block, 0, 16);

    ESP_LOGI(TAG, "DRM Session Active. Key Unwrapped.");
    
    // Secure erase key from stack
    memset(content_key, 0, 32); 
    return ESP_OK;
}

void dpa_drm_decrypt(dpa_drm_session_t *session, uint8_t *data, size_t len) {
    mbedtls_aes_crypt_ctr(&session->aes, len, &session->nc_off, session->nonce_counter, session->stream_block, data, data);
}

void dpa_drm_cleanup(dpa_drm_session_t *session) {
    mbedtls_aes_free(&session->aes);
    memset(session, 0, sizeof(dpa_drm_session_t));
}
`;

// ==========================================================================
// COMPONENT: SECURITY
// ==========================================================================

const SECURITY_CMAKE = `idf_component_register(SRCS "dpa_security.c" INCLUDE_DIRS "." REQUIRES mbedtls esp_flash_encrypt)`;

const DPA_SECURITY_H = `#pragma once
#include "esp_err.h"
#include <stdint.h>
#include <stddef.h>
esp_err_t dpa_security_init(void);
esp_err_t dpa_security_verify_signature(const uint8_t *payload, size_t len, const uint8_t *signature, size_t sig_len);
`;

const DPA_SECURITY_C = `#include "dpa_security.h"
#include "mbedtls/ecdsa.h"
#include "mbedtls/sha256.h"
#include "mbedtls/pk.h"
#include "esp_log.h"
#include "esp_flash_encrypt.h"
#include "esp_mac.h"
#define TAG "SEC"

// In production, this public key would be embedded during the factory flashing process.
// It corresponds to the private key used by the backend to sign content capsules.
extern const char dpa_root_ca_public_pem_start[] asm("_binary_dpa_root_ca_public_pem_start");
extern const char dpa_root_ca_public_pem_end[]   asm("_binary_dpa_root_ca_public_pem_end");

esp_err_t dpa_security_init(void) {
    if (!esp_flash_encryption_enabled()) {
        ESP_LOGW(TAG, "CRITICAL: Flash Encryption DISABLED. Device is Insecure (Dev Mode).");
    } else {
        ESP_LOGI(TAG, "Flash Encryption Active.");
    }
    return ESP_OK;
}

esp_err_t dpa_security_verify_signature(const uint8_t *payload, size_t len, const uint8_t *signature, size_t sig_len) {
    mbedtls_pk_context pk;
    mbedtls_pk_init(&pk);
    const size_t pem_len = dpa_root_ca_public_pem_end - dpa_root_ca_public_pem_start;
    
    int ret = mbedtls_pk_parse_public_key(&pk, (const unsigned char *)dpa_root_ca_public_pem_start, pem_len + 1);
    if (ret != 0) { mbedtls_pk_free(&pk); return ESP_FAIL; }
    
    uint8_t hash[32];
    if (mbedtls_sha256(payload, len, hash, 0) != 0) { mbedtls_pk_free(&pk); return ESP_FAIL; }
    
    ret = mbedtls_pk_verify(&pk, MBEDTLS_MD_SHA256, hash, 0, signature, sig_len);
    mbedtls_pk_free(&pk);

    if (ret != 0) { ESP_LOGE(TAG, "Signature Verification FAILED"); return ESP_ERR_INVALID_STATE; }
    ESP_LOGI(TAG, "Signature Verified OK");
    return ESP_OK;
}
`;

// ==========================================================================
// COMPONENT: CAPSULE (v11.0 Refactor)
// ==========================================================================

const CAPSULE_CMAKE = `idf_component_register(SRCS "dpa_capsule.c" INCLUDE_DIRS "." REQUIRES esp_partition esp_littlefs dpa_drm)`;

const DPA_CAPSULE_H = `#pragma once
#include "esp_err.h"
#include "dpa_drm.h"
#include <stdio.h>
#include <stdint.h>

// Defines the types of content a capsule can hold.
typedef enum {
    DPA_CONTENT_TYPE_UNKNOWN = 0,
    DPA_CONTENT_TYPE_AUDIO,       // e.g., 24-bit 96kHz Opus stream
    DPA_CONTENT_TYPE_VIDEO_LINK,  // Metadata contains a URL
    DPA_CONTENT_TYPE_TOUR_INFO,   // JSON or similar structured text
    DPA_CONTENT_TYPE_MERCH_LINK,  // Metadata contains a URL
    DPA_CONTENT_TYPE_MERCH_IMAGE, // e.g., JPEG or WEBP data
    DPA_CONTENT_TYPE_SIGNING,     // Metadata for digital signing events
} dpa_content_type_t;

// Represents one piece of content within the capsule's manifest.
typedef struct {
    dpa_content_type_t type;
    uint32_t flags;
    char id[32];
    uint64_t offset;
    uint64_t size;
    uint64_t metadata;
} __attribute__((packed)) dpa_manifest_entry_t;


// Handle for an open content stream from a capsule.
typedef struct { 
    FILE *fp; 
    uint64_t content_start_offset; // Start of this specific content in the file
    uint64_t content_size;         // Size of this specific content
    uint64_t bytes_read;           // How many bytes have been read so far
    dpa_drm_session_t drm;
} dpa_capsule_handle_t;

esp_err_t dpa_fs_mount_encrypted(void);

// Opens a specific piece of content within a capsule.
dpa_capsule_handle_t* dpa_capsule_open_content(const char *capsule_id, const char *content_id);

// Reads decrypted data from the opened content stream.
int dpa_capsule_read(dpa_capsule_handle_t *h, uint8_t *buf, size_t len);

// Closes the handle and file.
void dpa_capsule_close(dpa_capsule_handle_t *h);
`;

const DPA_CAPSULE_C = `#include "dpa_capsule.h"
#include "esp_littlefs.h"
#include "esp_log.h"
#include <stdlib.h>
#include <string.h>

#define TAG "CAPSULE"

// Capsule v2.0 Header Structure
typedef struct {
    char magic[4];          // "DPA2"
    uint32_t version;
    uint8_t iv[16];   
    uint8_t wrapped_key[32];
    uint32_t manifest_entries;
    uint32_t reserved;
} __attribute__((packed)) dpa_file_header_t;

esp_err_t dpa_fs_mount_encrypted(void) {
    esp_vfs_littlefs_conf_t conf = { .base_path = "/storage", .partition_label = "storage", .format_if_mount_failed = false };
    return esp_vfs_littlefs_register(&conf);
}

dpa_capsule_handle_t* dpa_capsule_open_content(const char *capsule_id, const char *content_id) {
    char path[64];
    snprintf(path, sizeof(path), "/storage/%s.dpa", capsule_id);
    
    FILE *f = fopen(path, "rb");
    if(!f) { ESP_LOGE(TAG, "Capsule file not found: %s", path); return NULL; }
    
    dpa_file_header_t header;
    if (fread(&header, 1, sizeof(header), f) != sizeof(header)) {
        ESP_LOGE(TAG, "Failed to read capsule header");
        fclose(f); return NULL;
    }
    if (strncmp(header.magic, "DPA2", 4) != 0) {
        ESP_LOGE(TAG, "Invalid capsule magic number");
        fclose(f); return NULL;
    }

    if (header.manifest_entries == 0 || header.manifest_entries > 100) { // Sanity check
        ESP_LOGE(TAG, "Invalid manifest entry count: %u", header.manifest_entries);
        fclose(f); return NULL;
    }

    // Read the entire manifest
    size_t manifest_size = sizeof(dpa_manifest_entry_t) * header.manifest_entries;
    dpa_manifest_entry_t *manifest = malloc(manifest_size);
    if (!manifest) { fclose(f); return NULL; }
    if (fread(manifest, 1, manifest_size, f) != manifest_size) {
        ESP_LOGE(TAG, "Failed to read manifest");
        free(manifest); fclose(f); return NULL;
    }

    // Find the requested content ID in the manifest
    dpa_manifest_entry_t *target_entry = NULL;
    for (uint32_t i = 0; i < header.manifest_entries; i++) {
        if (strncmp(manifest[i].id, content_id, sizeof(manifest[i].id)) == 0) {
            target_entry = &manifest[i];
            break;
        }
    }
    
    if (!target_entry) {
        ESP_LOGW(TAG, "Content ID '%s' not found in capsule '%s'", content_id, capsule_id);
        free(manifest); fclose(f); return NULL;
    }

    dpa_capsule_handle_t *h = malloc(sizeof(dpa_capsule_handle_t));
    if (!h) { free(manifest); fclose(f); return NULL; }

    h->fp = f;
    h->content_start_offset = sizeof(header) + manifest_size + target_entry->offset;
    h->content_size = target_entry->size;
    h->bytes_read = 0;
    
    fseek(f, h->content_start_offset, SEEK_SET);

    if (dpa_drm_init_session(&h->drm, header.iv, header.wrapped_key) != ESP_OK) {
        ESP_LOGE(TAG, "DRM Init Failed");
        fclose(f); free(h); free(manifest); return NULL;
    }
    
    free(manifest); // Manifest is no longer needed
    return h;
}

int dpa_capsule_read(dpa_capsule_handle_t *h, uint8_t *buf, size_t len) {
    if (!h || !h->fp) return -1;
    
    // Don't allow reading past the end of this content block
    uint64_t remaining_bytes = h->content_size - h->bytes_read;
    if (len > remaining_bytes) {
        len = remaining_bytes;
    }
    if (len == 0) return 0; // End of content

    int read_bytes = fread(buf, 1, len, h->fp);
    if (read_bytes > 0) {
        dpa_drm_decrypt(&h->drm, buf, read_bytes);
        h->bytes_read += read_bytes;
    }
    return read_bytes;
}

void dpa_capsule_close(dpa_capsule_handle_t *h) {
    if(h) { 
        dpa_drm_cleanup(&h->drm);
        if (h->fp) fclose(h->fp); 
        free(h); 
    }
}
`;

// ==========================================================================
// COMPONENT: AUDIO (v9.0 Refactor)
// ==========================================================================

const AUDIO_CMAKE = `idf_component_register(SRCS "dpa_audio_hal.c" "dpa_player.c" INCLUDE_DIRS "." REQUIRES driver dpa_capsule dpa_core)`;

const DPA_AUDIO_HAL_H = `#pragma once
#include "esp_err.h"
#include <stddef.h>
esp_err_t dpa_audio_hal_init(void);
void dpa_audio_hal_set_clock(uint32_t rate);
size_t dpa_audio_hal_write(const void *src, size_t size);
`;

const DPA_AUDIO_HAL_C = `#include "dpa_audio_hal.h"
#include "dpa_board.h"
#include "driver/i2s_std.h"
#include "esp_log.h"
#define TAG "AUDIO_HAL"
static i2s_chan_handle_t tx_handle = NULL;
esp_err_t dpa_audio_hal_init(void) {
    i2s_chan_config_t chan_cfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
    i2s_new_channel(&chan_cfg, &tx_handle, NULL);
    i2s_std_config_t std_cfg = { .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(96000), .slot_cfg = I2S_STD_MSB_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_24BIT, I2S_SLOT_MODE_STEREO), .gpio_cfg = { .mclk = DPA_PIN_I2S_MCK, .bclk = DPA_PIN_I2S_BCK, .ws = DPA_PIN_I2S_WS, .dout = DPA_PIN_I2S_DO, .din = -1 } };
    i2s_channel_init_std_mode(tx_handle, &std_cfg);
    i2s_channel_enable(tx_handle);
    ESP_LOGI(TAG, "I2S HAL Initialized for 24-bit, 96kHz audio.");
    return ESP_OK;
}
void dpa_audio_hal_set_clock(uint32_t rate) { i2s_std_clk_config_t clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(rate); i2s_channel_reconfig_std_clock(tx_handle, &clk_cfg); }
size_t dpa_audio_hal_write(const void *src, size_t size) { size_t bytes_written = 0; if (!tx_handle) return 0; i2s_channel_write(tx_handle, src, size, &bytes_written, portMAX_DELAY); return bytes_written; }
`;

const DPA_PLAYER_H = `#pragma once
#include "esp_err.h"
esp_err_t dpa_player_start(const char *track_id);
void dpa_player_stop(void);
`;

const DPA_PLAYER_C = `#include "dpa_player.h"
#include "dpa_capsule.h"
#include "dpa_audio_hal.h"
#include "dpa_core.h"
#include "dpa_board.h"
#include "esp_log.h"
#include "esp_heap_caps.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define DECODE_BUF_SIZE 4096
#define TAG "PLAYER"

static TaskHandle_t player_task_handle = NULL;

// In a real system, this would be a sophisticated decoder task (e.g., Opus, FLAC)
// It would read from the capsule, decode, and write to a PCM buffer for the I2S task.
// For this simulation, we combine it into one task.
static void player_task(void *pvParameters) {
    char *track_id = (char *)pvParameters;
    
    dpa_capsule_handle_t *file = dpa_capsule_open_content(DPA_ALBUM_ID, track_id);
    if (!file) {
        dpa_core_send_event(DPA_EVENT_SYS_ERROR, "Failed to open track");
        goto cleanup;
    }
    
    uint8_t *in_buf = heap_caps_malloc(DECODE_BUF_SIZE, MALLOC_CAP_SPIRAM);
    if (!in_buf) {
        dpa_core_send_event(DPA_EVENT_SYS_ERROR, "No memory for audio buffer");
        dpa_capsule_close(file);
        goto cleanup;
    }
    
    ESP_LOGI(TAG, "Starting playback for %s", track_id);
    dpa_core_set_state(DPA_STATE_PLAYING);

    while (dpa_core_get_state() == DPA_STATE_PLAYING) {
        int bytes_read = dpa_capsule_read(file, in_buf, DECODE_BUF_SIZE);
        if (bytes_read <= 0) break; // End of file
        
        // This is where a real audio DECODER would process in_buf to 24-bit PCM
        // For now, we write the (mock) decrypted data directly to the I2S HAL.
        dpa_audio_hal_write(in_buf, bytes_read);
    }
    
    free(in_buf);
    dpa_capsule_close(file);
    
cleanup:
    ESP_LOGI(TAG, "Playback finished for %s", track_id);
    if (dpa_core_get_state() == DPA_STATE_PLAYING) {
       dpa_core_send_event(DPA_EVENT_PLAY_PAUSE, NULL);
    }
    free(track_id);
    player_task_handle = NULL;
    vTaskDelete(NULL);
}

esp_err_t dpa_player_start(const char *track_id) {
    if (player_task_handle) {
        ESP_LOGW(TAG, "Player already active.");
        return ESP_FAIL;
    }
    
    char* track_id_copy = strdup(track_id);
    xTaskCreate(player_task, "player_task", 4096, track_id_copy, 5, &player_task_handle);
    return ESP_OK;
}

void dpa_player_stop(void) {
    if (player_task_handle) {
        dpa_core_set_state(DPA_STATE_READY); // Signal task to stop
        // The task will clean itself up.
    }
}
`;

// ==========================================================================
// COMPONENT: LED
// ==========================================================================

const LED_CMAKE = `idf_component_register(SRCS "dpa_led.c" INCLUDE_DIRS "." REQUIRES led_strip dpa_core dpa_nvs)`;
const IDF_COMPONENT_YML = `dependencies:\n  espressif/led_strip: "^2.0.0"`;
const DPA_LED_H = `#pragma once\n#include "esp_err.h"\n#include <stdint.h>\ntypedef struct { uint8_t r; uint8_t g; uint8_t b; } dpa_color_t;\ntypedef enum { DPA_LED_MODE_IDLE, DPA_LED_MODE_PLAYING, DPA_LED_MODE_SNIPPET, DPA_LED_MODE_UPDATE, DPA_LED_MODE_USB, DPA_LED_MODE_DIAG, DPA_LED_MODE_LOW_BAT, DPA_LED_MODE_ERROR } dpa_led_mode_t;\nesp_err_t dpa_led_init(void);\nvoid dpa_led_set_user_color(dpa_color_t c);\nvoid dpa_led_set_mode(dpa_led_mode_t m);\nvoid dpa_led_pulse_confirmation(void);`;
const DPA_LED_C = `#include "dpa_led.h"\n#include "dpa_nvs.h"\n#include "dpa_board.h"\n#include "led_strip.h"\n#include "freertos/FreeRTOS.h"\n#include "freertos/task.h"\nstatic led_strip_handle_t strip;\nstatic dpa_color_t active_user_color = { 255, 255, 255 };\nstatic const dpa_color_t COL_SYS_ERROR = { 255, 0, 0 };\nstatic const dpa_color_t COL_SYS_USB = { 128, 0, 128 };\nesp_err_t dpa_led_init(void) { led_strip_config_t c={.strip_gpio_num=DPA_PIN_LED_DATA, .max_leds=1}; led_strip_rmt_config_t r={.resolution_hz=10000000}; led_strip_new_rmt_device(&c,&r,&strip); uint8_t r_v,g_v,b_v; if(dpa_nvs_get_color(&r_v,&g_v,&b_v)==ESP_OK) { active_user_color.r=r_v; active_user_color.g=g_v; active_user_color.b=b_v; } return ESP_OK; }\nvoid dpa_led_set_user_color(dpa_color_t c) { active_user_color = c; dpa_nvs_set_color(c.r, c.g, c.b); led_strip_set_pixel(strip, 0, c.r, c.g, c.b); led_strip_refresh(strip); }\nvoid dpa_led_set_mode(dpa_led_mode_t m) { dpa_color_t t = {0}; switch(m) { case DPA_LED_MODE_IDLE: t = (dpa_color_t){10,10,10}; break; case DPA_LED_MODE_PLAYING: t = active_user_color; break; case DPA_LED_MODE_ERROR: t = COL_SYS_ERROR; break; case DPA_LED_MODE_USB: t = COL_SYS_USB; break; default: t = (dpa_color_t){0,0,255}; break; } led_strip_set_pixel(strip, 0, t.r, t.g, t.b); led_strip_refresh(strip); }\nvoid dpa_led_pulse_confirmation(void) { led_strip_set_pixel(strip, 0, 0, 255, 0); led_strip_refresh(strip); vTaskDelay(pdMS_TO_TICKS(150)); dpa_led_set_mode(DPA_LED_MODE_IDLE); }`;

// ==========================================================================
// COMPONENT: INPUT (v9.0 Refactor)
// ==========================================================================
const INPUT_CMAKE = `idf_component_register(SRCS "dpa_button.c" "dpa_motion.c" INCLUDE_DIRS "." REQUIRES driver dpa_core esp_timer)`;
const DPA_INPUT_H = `#pragma once\n#include "dpa_button.h"\n#include "dpa_motion.h"`;
const DPA_BUTTON_H = `#pragma once\n#include "esp_err.h"\nesp_err_t dpa_button_init(void);`;
const DPA_BUTTON_C = `#include "dpa_button.h"
#include "dpa_board.h"
#include "dpa_core.h"
#include "driver/gpio.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"

static QueueHandle_t gpio_evt_queue = NULL;

static void IRAM_ATTR gpio_isr_handler(void* arg) {
    uint32_t gpio_num = (uint32_t) arg;
    xQueueSendFromISR(gpio_evt_queue, &gpio_num, NULL);
}

// Debounce and handle button presses from the ISR
static void button_task(void* arg) {
    uint32_t io_num;
    for(;;) {
        if(xQueueReceive(gpio_evt_queue, &io_num, portMAX_DELAY)) {
            // Simple debounce: ignore interrupts for a short period
            vTaskDelay(pdMS_TO_TICKS(50)); 
            if (gpio_get_level(io_num) == 0) { // Check if still pressed
                 dpa_core_send_event(DPA_EVENT_PLAY_PAUSE, NULL);
            }
            // Clear any pending ISRs during the debounce period
            xQueueReset(gpio_evt_queue);
        }
    }
}

esp_err_t dpa_button_init(void) {
    gpio_config_t io_conf = {
        .intr_type = GPIO_INTR_NEGEDGE, // Fire on button press (falling edge)
        .mode = GPIO_MODE_INPUT,
        .pin_bit_mask = (1ULL << DPA_PIN_BTN_MAIN),
        .pull_up_en = 1
    };
    gpio_config(&io_conf);
    
    gpio_evt_queue = xQueueCreate(10, sizeof(uint32_t));
    xTaskCreate(button_task, "button_task", 2048, NULL, 10, NULL);
    
    gpio_install_isr_service(0);
    gpio_isr_handler_add(DPA_PIN_BTN_MAIN, gpio_isr_handler, (void*) DPA_PIN_BTN_MAIN);
    
    return ESP_OK;
}
`;
const DPA_MOTION_H = `#pragma once\n#include "esp_err.h"\nesp_err_t dpa_motion_init(void);`;
const DPA_MOTION_C = `#include "dpa_motion.h"
#include "dpa_board.h"
#include "dpa_core.h"
#include "driver/i2c.h"

// This remains a stub but demonstrates where real motion logic (e.g., tap detection) would go.
esp_err_t dpa_motion_init(void) {
    i2c_config_t conf = { .mode = I2C_MODE_MASTER, .sda_io_num = DPA_PIN_I2C_SDA, .scl_io_num = DPA_PIN_I2C_SCL, .sda_pullup_en = GPIO_PULLUP_ENABLE, .scl_pullup_en = GPIO_PULLUP_ENABLE, .master.clk_speed = 100000 };
    i2c_param_config(I2C_NUM_0, &conf);
    i2c_driver_install(I2C_NUM_0, conf.mode, 0, 0, 0);
    return ESP_OK;
}
`;

// ==========================================================================
// COMPONENT: BLE, POWER, OTA, NVS, USB, DIAG
// ==========================================================================
const BLE_CMAKE = `idf_component_register(SRCS "dpa_ble.c" INCLUDE_DIRS "." REQUIRES nvs_flash dpa_core mbedtls dpa_led nimble)`;
const DPA_BLE_H = `#pragma once\n#include "esp_err.h"\nesp_err_t dpa_ble_init(void);`;
const DPA_BLE_C = `#include "dpa_ble.h"
#include "dpa_core.h"
#include "dpa_led.h"
#include "host/ble_hs.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"
#include <string.h>

// DPA Service: 5c6c0000-1212-efde-1523-785feabcd123
static const ble_uuid128_t svc_uuid = BLE_UUID128_INIT(0x23,0xD1,0xBC,0xEA,0x5F,0x78,0x23,0x15,0xDE,0xEF,0x12,0x12,0x00,0x00,0x6C,0x5C);

// ====== CHARACTERISTICS (v9.0 API) ======
// Identity (Read): Returns DPA_ALBUM_ID
static const ble_uuid128_t chr_identity = BLE_UUID128_INIT(0x23,0xD1,0xBC,0xEA,0x5F,0x78,0x23,0x15,0xDE,0xEF,0x12,0x12,0x01,0x00,0x6C,0x5C);
// OTA URL (Write): App provides firmware update URL
static const ble_uuid128_t chr_ota_url = BLE_UUID128_INIT(0x23,0xD1,0xBC,0xEA,0x5F,0x78,0x23,0x15,0xDE,0xEF,0x12,0x12,0x03,0x00,0x6C,0x5C);
// Playback Control (Write): 0x01=Play/Pause, 0x02=Next, 0x03=Prev
static const ble_uuid128_t chr_playback_control = BLE_UUID128_INIT(0x23,0xD1,0xBC,0xEA,0x5F,0x78,0x23,0x15,0xDE,0xEF,0x12,0x12,0x04,0x00,0x6C,0x5C);
// Playback Status (Notify): 0x00=Idle, 0x01=Playing
static const ble_uuid128_t chr_playback_status = BLE_UUID128_INIT(0x23,0xD1,0xBC,0xEA,0x5F,0x78,0x23,0x15,0xDE,0xEF,0x12,0x12,0x05,0x00,0x6C,0x5C);
// Battery Level (Notify): 0-100
static const ble_uuid128_t chr_battery_level = BLE_UUID128_INIT(0x23,0xD1,0xBC,0xEA,0x5F,0x78,0x23,0x15,0xDE,0xEF,0x12,0x12,0x06,0x00,0x6C,0x5C);


static int dpa_gatt_access(uint16_t conn_handle, uint16_t attr_handle, struct ble_gatt_access_ctxt *ctxt, void *arg);

static const struct ble_gatt_svc_def svcs[] = {
    { .type = BLE_GATT_SVC_TYPE_PRIMARY, .uuid = &svc_uuid.u, .characteristics = (struct ble_gatt_chr_def[]) {
        { .uuid = &chr_identity.u, .access_cb = dpa_gatt_access, .flags = BLE_GATT_CHR_F_READ },
        { .uuid = &chr_ota_url.u, .access_cb = dpa_gatt_access, .flags = BLE_GATT_CHR_F_WRITE },
        { .uuid = &chr_playback_control.u, .access_cb = dpa_gatt_access, .flags = BLE_GATT_CHR_F_WRITE },
        { .uuid = &chr_playback_status.u, .access_cb = dpa_gatt_access, .flags = BLE_GATT_CHR_F_NOTIFY },
        { .uuid = &chr_battery_level.u, .access_cb = dpa_gatt_access, .flags = BLE_GATT_CHR_F_NOTIFY },
        { 0 }
    } },
    { 0 }
};

static int dpa_gatt_access(uint16_t conn_handle, uint16_t attr_handle, struct ble_gatt_access_ctxt *ctxt, void *arg) {
    if (ble_uuid_cmp(ctxt->chr->uuid, &chr_ota_url.u) == 0 && ctxt->op == BLE_GATT_ACCESS_OP_WRITE_CHR) {
        uint16_t len = OS_MBUF_PKTLEN(ctxt->om);
        if (len > 0) {
            char *url = malloc(len + 1);
            ble_hs_mbuf_to_flat(ctxt->om, url, len, NULL);
            url[len] = '\\0';
            dpa_core_send_event(DPA_EVENT_START_UPDATE, url);
        }
    } else if (ble_uuid_cmp(ctxt->chr->uuid, &chr_playback_control.u) == 0 && ctxt->op == BLE_GATT_ACCESS_OP_WRITE_CHR) {
        uint8_t command;
        ble_hs_mbuf_to_flat(ctxt->om, &command, 1, NULL);
        if (command == 0x01) dpa_core_send_event(DPA_EVENT_PLAY_PAUSE, NULL);
    }
    return 0;
}

static void ble_app_on_sync(void) { uint8_t type; ble_hs_id_infer_auto(0, &type); ble_gap_adv_start(type, NULL, BLE_HS_FOREVER, &((struct ble_gap_adv_params){.conn_mode=BLE_GAP_CONN_MODE_UND, .disc_mode=BLE_GAP_DISC_MODE_GEN}), NULL, NULL); }
esp_err_t dpa_ble_init(void) { ble_svc_gap_init(); ble_svc_gatt_init(); ble_gatts_count_cfg(svcs); ble_gatts_add_svcs(svcs); ble_hs_cfg.sync_cb = ble_app_on_sync; return ESP_OK; }`;

const POWER_CMAKE = `idf_component_register(SRCS "dpa_power.c" INCLUDE_DIRS "." REQUIRES esp_adc dpa_core)`;
const DPA_POWER_H = `#pragma once\n#include "esp_err.h"\nesp_err_t dpa_power_init(void);\nfloat dpa_power_get_voltage(void);`;
const DPA_POWER_C = `#include "dpa_power.h"
#include "dpa_board.h"
#include "dpa_core.h"
#include "esp_adc/adc_oneshot.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define TAG "POWER"
#define LOW_BATTERY_VOLTAGE 3.4f

static adc_oneshot_unit_handle_t adc_handle;

float dpa_power_get_voltage(void) {
    int raw;
    adc_oneshot_read(adc_handle, ADC_CHANNEL_0, &raw);
    // Voltage divider calculation might be needed here depending on hardware.
    // Assuming 2x divider for this example.
    return (raw / 4095.0f) * 3.3f * 2.0f; 
}

// v9.0: Active Power Monitoring Task
static void power_monitor_task(void *pvParameters) {
    while(1) {
        float voltage = dpa_power_get_voltage();
        ESP_LOGD(TAG, "Battery voltage: %.2fV", voltage);
        
        if (voltage < LOW_BATTERY_VOLTAGE) {
            dpa_core_send_event(DPA_EVENT_BATTERY_LOW, NULL);
        }

        // Check every 30 seconds
        vTaskDelay(pdMS_TO_TICKS(30000));
    }
}

esp_err_t dpa_power_init(void) {
    adc_oneshot_unit_init_cfg_t init_config = { .unit_id = ADC_UNIT_1 };
    adc_oneshot_new_unit(&init_config, &adc_handle);
    adc_oneshot_chan_cfg_t config = { .bitwidth = ADC_BITWIDTH_DEFAULT, .atten = ADC_ATTEN_DB_11 };
    adc_oneshot_config_channel(adc_handle, ADC_CHANNEL_0, &config);
    
    xTaskCreate(power_monitor_task, "power_task", 2048, NULL, 3, NULL);
    
    return ESP_OK;
}
`;

const OTA_CMAKE = `idf_component_register(SRCS "dpa_ota.c" INCLUDE_DIRS "." REQUIRES app_update esp_https_ota dpa_core)`;
const DPA_OTA_H = `#pragma once\n#include "esp_err.h"\nvoid dpa_ota_task(void *pvParameter);`;
const DPA_OTA_C = `#include "dpa_ota.h"\n#include "dpa_core.h"\n#include "esp_https_ota.h"\n#include "esp_log.h"\n#include "freertos/FreeRTOS.h"\n#include "freertos/task.h"\n#define TAG "OTA"\nstatic const char *server_root_ca_pem = "-----BEGIN CERTIFICATE-----\\nMIIDQTCCAimgAwIBAgITBmyfz5m/jAo54vB4ikPmljZbyjANBgkqhkiG9w0BAQsF\\nADA5MQswCQYDVQQGEwJVUzEPMA0GA1UEChMGQW1hem9uMRkwFwYDVQQDExBBbWF6\\n-----END CERTIFICATE-----";\nvoid dpa_ota_task(void *pvParameter) { char *url = (char *)pvParameter; if (!url) { vTaskDelete(NULL); return; } esp_http_client_config_t config = { .url = url, .cert_pem = server_root_ca_pem, .skip_cert_common_name_check = false }; if (esp_https_ota(&config) == ESP_OK) { esp_restart(); } free(url); vTaskDelete(NULL); }`;

const NVS_CMAKE = `idf_component_register(SRCS "dpa_nvs.c" INCLUDE_DIRS "." REQUIRES nvs_flash)`;
const DPA_NVS_H = `#pragma once\n#include "esp_err.h"\n#include <stdint.h>\nesp_err_t dpa_nvs_init(void);\nesp_err_t dpa_nvs_set_color(uint8_t r, uint8_t g, uint8_t b);\nesp_err_t dpa_nvs_get_color(uint8_t *r, uint8_t *g, uint8_t *b);`;
const DPA_NVS_C = `#include "dpa_nvs.h"\n#include "nvs_flash.h"\n#include "nvs.h"\n#include "esp_log.h"\nesp_err_t dpa_nvs_init(void) { esp_err_t ret = nvs_flash_init(); if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) { nvs_flash_erase(); ret = nvs_flash_init(); } return ret; }\nesp_err_t dpa_nvs_set_color(uint8_t r, uint8_t g, uint8_t b) { nvs_handle_t h; if (nvs_open("dpa_cfg", NVS_READWRITE, &h) != ESP_OK) return ESP_FAIL; uint32_t packed = (r << 16) | (g << 8) | b; nvs_set_u32(h, "usr_color", packed); nvs_commit(h); nvs_close(h); return ESP_OK; }\nesp_err_t dpa_nvs_get_color(uint8_t *r, uint8_t *g, uint8_t *b) { nvs_handle_t h; if (nvs_open("dpa_cfg", NVS_READONLY, &h) != ESP_OK) return ESP_FAIL; uint32_t packed = 0; esp_err_t err = nvs_get_u32(h, "usr_color", &packed); nvs_close(h); if (err != ESP_OK) return err; *r = (packed >> 16) & 0xFF; *g = (packed >> 8) & 0xFF; *b = packed & 0xFF; return ESP_OK; }`;

const USB_CMAKE = `idf_component_register(SRCS "dpa_usb.c" INCLUDE_DIRS "." REQUIRES esp_tinyusb esp_partition)`;
const DPA_USB_H = `#pragma once\n#include "esp_err.h"\nesp_err_t dpa_usb_init_msc(void);`;
const DPA_USB_C = `#include "dpa_usb.h"\n#include "dpa_board.h"\n#include "esp_log.h"\n#include "esp_tinyusb.h"\n#include "tusb_msc_storage.h"\nesp_err_t dpa_usb_init_msc(void) { const tinyusb_config_t tusb_cfg = { .external_phy = false }; tinyusb_driver_install(&tusb_cfg); tinyusb_msc_spiffs_config_t msc_cfg = { .pdrv = 0, .partition_label = "storage", .mount_path = "/storage" }; tinyusb_msc_storage_init_spiffs(&msc_cfg); return ESP_OK; }`;

const DIAG_CMAKE = `idf_component_register(SRCS "dpa_diag.c" INCLUDE_DIRS "." REQUIRES dpa_led dpa_audio dpa_input)`;
const DPA_DIAG_H = `#pragma once\nvoid dpa_diag_run_factory_test(void);`;
const DPA_DIAG_C = `#include "dpa_diag.h"\n#include "dpa_led.h"\n#include "dpa_audio_hal.h"\n#include "dpa_input.h"\n#include "esp_log.h"\n#include "freertos/FreeRTOS.h"\n#include "freertos/task.h"\nvoid dpa_diag_run_factory_test(void) { dpa_led_set_user_color((dpa_color_t){255,0,0}); vTaskDelay(pdMS_TO_TICKS(500)); dpa_led_set_user_color((dpa_color_t){0,255,0}); vTaskDelay(pdMS_TO_TICKS(500)); dpa_led_set_user_color((dpa_color_t){0,0,255}); vTaskDelay(pdMS_TO_TICKS(500)); dpa_led_set_user_color((dpa_color_t){255,255,255}); while(1) { vTaskDelay(100); } }`;

// ==========================================================================
// APP: MAIN (v9.0 Refactor)
// ==========================================================================

const MAIN_CMAKE = `idf_component_register(SRCS "main.c"
                    INCLUDE_DIRS "."
                    REQUIRES dpa_core dpa_sys dpa_led dpa_audio dpa_ble dpa_security dpa_input dpa_power dpa_ota dpa_nvs dpa_usb dpa_diag)`;

const MAIN_C = `#include "dpa_core.h"
#include "dpa_sys.h"
#include "dpa_led.h"
#include "dpa_audio_hal.h"
#include "dpa_player.h" // v9.0
#include "dpa_ble.h"
#include "dpa_security.h"
#include "dpa_input.h"
#include "dpa_capsule.h"
#include "dpa_power.h"
#include "dpa_nvs.h"
#include "dpa_ota.h"
#include "dpa_usb.h"
#include "dpa_diag.h"
#include "dpa_board.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define TAG "MAIN"
#define IDLE_TIMEOUT_SECONDS 300

static void check_boot_mode(void) {
    gpio_set_direction(DPA_PIN_BTN_MAIN, GPIO_MODE_INPUT);
    gpio_set_pull_mode(DPA_PIN_BTN_MAIN, GPIO_PULLUP_ONLY);
    
    if (gpio_get_level(DPA_PIN_BTN_MAIN) == 0) {
        vTaskDelay(pdMS_TO_TICKS(3000));
        if (gpio_get_level(DPA_PIN_BTN_MAIN) == 0) {
             dpa_diag_run_factory_test(); 
        } else {
             dpa_usb_init_msc();
             while(1) vTaskDelay(1000);
        }
    }
}

void app_main(void) {
    dpa_nvs_init();
    dpa_sys_init();
    dpa_core_init();
    dpa_led_init();
    
    check_boot_mode();

    if (dpa_security_init() != ESP_OK) {
        dpa_core_set_state(DPA_STATE_ERROR_FATAL);
        dpa_led_set_mode(DPA_LED_MODE_ERROR);
        return;
    }
    
    dpa_audio_hal_init();
    dpa_button_init();
    dpa_motion_init();
    dpa_power_init();
    dpa_ble_init();
    dpa_fs_mount_encrypted();
    
    ESP_LOGI(TAG, "DPA PREMIUM v%s READY", dpa_sys_get_version());
    dpa_core_set_state(DPA_STATE_READY);
    dpa_led_set_mode(DPA_LED_MODE_IDLE);

    uint32_t idle_ticks = 0;
    dpa_event_msg_t msg;
    while (1) {
        if (dpa_core_receive(&msg, 1000)) {
            idle_ticks = 0;
            switch(msg.type) {
                case DPA_EVENT_PLAY_PAUSE:
                    if (dpa_core_get_state() == DPA_STATE_PLAYING) {
                        dpa_player_stop();
                        dpa_led_set_mode(DPA_LED_MODE_IDLE);
                    } else {
                        dpa_player_start(DPA_DEFAULT_TRACK);
                        dpa_led_set_mode(DPA_LED_MODE_PLAYING); 
                    }
                    break;
                case DPA_EVENT_SYS_ERROR:
                    ESP_LOGE(TAG, "FATAL SYSTEM ERROR: %s", (char*)msg.data);
                    dpa_core_set_state(DPA_STATE_ERROR_FATAL);
                    dpa_led_set_mode(DPA_LED_MODE_ERROR);
                    break;
                case DPA_EVENT_START_UPDATE:
                    xTaskCreate(dpa_ota_task, "ota", 8192, msg.data, 5, NULL);
                    break;
                case DPA_EVENT_BATTERY_LOW:
                    dpa_core_set_state(DPA_STATE_LOW_BATTERY);
                    dpa_led_set_mode(DPA_LED_MODE_LOW_BAT);
                    break;
                case DPA_EVENT_ENTER_SLEEP:
                    dpa_core_enter_deep_sleep();
                    break;
                default: break;
            }
        } else {
            if (dpa_core_get_state() == DPA_STATE_READY) {
                idle_ticks++;
                if (idle_ticks > IDLE_TIMEOUT_SECONDS) dpa_core_send_event(DPA_EVENT_ENTER_SLEEP, NULL);
            }
        }
    }
}
`;

// ==========================================================================
// BACKEND / CI
// ==========================================================================

const GEN_PKI_SH = `#!/bin/bash
set -e
echo ">>> DPA PREMIUM: Generating Security Artifacts..."

# 1. Secure Boot Signing Key (RSA-3072)
openssl genrsa -out secure_boot_signing_key.pem 3072

# 2. Flash Encryption Key (AES-256)
openssl rand -out flash_encryption_key.bin 32

# 3. DPA Root CA for Capsule Signatures (ECC P-256)
openssl ecparam -name prime256v1 -genkey -noout -out dpa_root_ca_private.pem
openssl ec -in dpa_root_ca_private.pem -pubout -out dpa_root_ca_public.pem

echo ">>> KEYS GENERATED."
`;

const BUILD_YML = `name: DPA Firmware Build
on:
  push:
    branches: [ "main" ]
jobs:
  build:
    runs-on: ubuntu-latest
    container: espressif/idf:release-v5.1
    steps:
    - uses: actions/checkout@v3
    - name: Build
      run: |
        idf.py set-target esp32s3
        idf.py build
    - uses: actions/upload-artifact@v3
      with:
        name: dpa-firmware-unsigned
        path: build/dpa-firmware.bin
`;

// ==========================================================================
// EXPORT STRUCTURE
// ==========================================================================

export const REPO_STRUCTURE: Directory[] = [
  {
    name: 'components',
    isOpen: true,
    files: [],
    directories: [
      {
        name: 'dpa_core',
        isOpen: true,
        files: [
           { name: 'CMakeLists.txt', language: 'cmake', content: CORE_CMAKE },
           { name: 'dpa_core.c', language: 'c', content: DPA_CORE_C },
           { name: 'dpa_core.h', language: 'c', content: DPA_CORE_H },
           { name: 'dpa_events.h', language: 'c', content: DPA_EVENTS_H },
           { name: 'dpa_board.h', language: 'c', content: DPA_BOARD_H }
        ]
      },
      {
        name: 'dpa_sys',
        files: [
           { name: 'CMakeLists.txt', language: 'cmake', content: SYS_CMAKE },
           { name: 'dpa_sys.c', language: 'c', content: DPA_SYS_C },
           { name: 'dpa_sys.h', language: 'c', content: DPA_SYS_H }
        ]
      },
      {
        name: 'dpa_led',
        files: [
          { name: 'CMakeLists.txt', language: 'cmake', content: LED_CMAKE },
          { name: 'idf_component.yml', language: 'yaml', content: IDF_COMPONENT_YML },
          { name: 'dpa_led.c', language: 'c', content: DPA_LED_C },
          { name: 'dpa_led.h', language: 'c', content: DPA_LED_H }
        ]
      },
      {
        name: 'dpa_ble',
        isOpen: false,
        files: [
           { name: 'CMakeLists.txt', language: 'cmake', content: BLE_CMAKE },
           { name: 'dpa_ble.c', language: 'c', content: DPA_BLE_C },
           { name: 'dpa_ble.h', language: 'c', content: DPA_BLE_H }
        ]
      },
      {
        name: 'dpa_security',
        files: [
          { name: 'CMakeLists.txt', language: 'cmake', content: SECURITY_CMAKE },
          { name: 'dpa_security.c', language: 'c', content: DPA_SECURITY_C },
          { name: 'dpa_security.h', language: 'c', content: DPA_SECURITY_H }
        ]
      },
      {
        name: 'dpa_capsule',
        isOpen: true,
        files: [
          { name: 'CMakeLists.txt', language: 'cmake', content: CAPSULE_CMAKE },
          { name: 'dpa_capsule.c', language: 'c', content: DPA_CAPSULE_C },
          { name: 'dpa_capsule.h', language: 'c', content: DPA_CAPSULE_H }
        ]
      },
      {
        name: 'dpa_drm',
        files: [
          { name: 'CMakeLists.txt', language: 'cmake', content: DRM_CMAKE },
          { name: 'dpa_drm.c', language: 'c', content: DPA_DRM_C },
          { name: 'dpa_drm.h', language: 'c', content: DPA_DRM_H }
        ]
      },
      {
        name: 'dpa_audio',
        isOpen: false,
        files: [
          { name: 'CMakeLists.txt', language: 'cmake', content: AUDIO_CMAKE },
          { name: 'dpa_audio_hal.c', language: 'c', content: DPA_AUDIO_HAL_C },
          { name: 'dpa_audio_hal.h', language: 'c', content: DPA_AUDIO_HAL_H },
          { name: 'dpa_player.c', language: 'c', content: DPA_PLAYER_C },
          { name: 'dpa_player.h', language: 'c', content: DPA_PLAYER_H }
        ]
      },
      {
        name: 'dpa_input',
        isOpen: false,
        files: [
          { name: 'CMakeLists.txt', language: 'cmake', content: INPUT_CMAKE },
          { name: 'dpa_button.c', language: 'c', content: DPA_BUTTON_C },
          { name: 'dpa_button.h', language: 'c', content: DPA_BUTTON_H },
          { name: 'dpa_motion.c', language: 'c', content: DPA_MOTION_C },
          { name: 'dpa_motion.h', language: 'c', content: DPA_MOTION_H },
          { name: 'dpa_input.h', language: 'c', content: DPA_INPUT_H }
        ]
      },
      {
        name: 'dpa_power',
        isOpen: false,
        files: [
          { name: 'CMakeLists.txt', language: 'cmake', content: POWER_CMAKE },
          { name: 'dpa_power.c', language: 'c', content: DPA_POWER_C },
          { name: 'dpa_power.h', language: 'c', content: DPA_POWER_H }
        ]
      },
      {
        name: 'dpa_ota',
        files: [
          { name: 'CMakeLists.txt', language: 'cmake', content: OTA_CMAKE },
          { name: 'dpa_ota.c', language: 'c', content: DPA_OTA_C },
          { name: 'dpa_ota.h', language: 'c', content: DPA_OTA_H }
        ]
      },
      {
        name: 'dpa_nvs',
        files: [
          { name: 'CMakeLists.txt', language: 'cmake', content: NVS_CMAKE },
          { name: 'dpa_nvs.c', language: 'c', content: DPA_NVS_C },
          { name: 'dpa_nvs.h', language: 'c', content: DPA_NVS_H }
        ]
      },
      {
        name: 'dpa_usb',
        files: [
          { name: 'CMakeLists.txt', language: 'cmake', content: USB_CMAKE },
          { name: 'dpa_usb.c', language: 'c', content: DPA_USB_C },
          { name: 'dpa_usb.h', language: 'c', content: DPA_USB_H }
        ]
      },
      {
        name: 'dpa_diag',
        files: [
          { name: 'CMakeLists.txt', language: 'cmake', content: DIAG_CMAKE },
          { name: 'dpa_diag.c', language: 'c', content: DPA_DIAG_C },
          { name: 'dpa_diag.h', language: 'c', content: DPA_DIAG_H }
        ]
      },
      {
        name: 'main',
        isOpen: true,
        files: [
          { name: 'CMakeLists.txt', language: 'cmake', content: MAIN_CMAKE },
          { name: 'main.c', language: 'c', content: MAIN_C }
        ]
      }
    ]
  },
  {
    name: 'docs',
    isOpen: true,
    files: [
      { name: 'SETUP.md', language: 'bash', content: DOCS_SETUP_MD },
      { name: 'CAPSULE_SPEC.md', language: 'bash', content: DOCS_CAPSULE_SPEC_MD },
      { name: 'API.md', language: 'bash', content: DOCS_API_MD }
    ]
  },
  {
    name: 'backend',
    isOpen: false,
    files: [],
    directories: [
      {
        name: 'keys',
        files: [
          { name: 'generate_pki.sh', language: 'bash', content: GEN_PKI_SH }
        ]
      }
    ]
  },
  {
    name: '.github',
    isOpen: false,
    directories: [
      {
        name: 'workflows',
        files: [
          { name: 'dpa_build.yml', language: 'yaml', content: BUILD_YML }
        ]
      }
    ],
    files: []
  },
  {
    name: 'root_files',
    isOpen: false,
    files: [
       { name: 'README.md', language: 'bash', content: README_MD },
       { name: 'CMakeLists.txt', language: 'cmake', content: ROOT_CMAKE },
       { name: 'sdkconfig.defaults', language: 'yaml', content: SDKCONFIG_DEFAULTS },
       { name: 'partitions.csv', language: 'cmake', content: PARTITIONS_CSV }
    ]
  }
];
