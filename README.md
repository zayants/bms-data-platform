# BMS Data Platform

Phone gateway and desktop dashboard for long-term, read-only monitoring of JK/Jikong battery management systems.

> Early public preview. Please report your BMS model, firmware and Android version when opening an issue.

[Download the latest release](https://github.com/zayants/bms-data-platform/releases/latest) · [Инструкция по подключению](docs/connection-guide-ru.md)

![Desktop overview](screenshots/desktop-overview.png)

## Why this project exists

The phone stays near the battery, maintains the Bluetooth connection and stores telemetry. Any Windows computer on the same local Wi-Fi network can then show a full monitoring dashboard and analyze the history. No cloud account is required and the first version does not write protection settings to the BMS.

## Current components

- **BMS Gateway 0.3.3 for Android 8.0+** — BLE discovery, manual BMS selection, automatic reconnection, live battery data, up to 32 cell voltages, one year of local history, CSV export and a local Wi-Fi API.
- **Desktop Monitor 0.6.4 for Windows x64** — live overview, cell monitoring, cascaded multi-parameter history, individual fullscreen charts, selectable periods, cell-voltage comparison, SOC boundary diagnostics and current/power correlation.
- Interface languages: English, Ukrainian, Russian, German, Polish, Spanish, French and Czech.

## BMS compatibility

The gateway currently implements automatic detection for JK/Jikong telemetry variants:

- JK02 up to 24S;
- JK02 PB / 32S;
- JK04 used by older models.

It has been tested on available JK/Jikong hardware, but the model range is large and firmware behaviour varies. Models not yet tested are exactly why this preview is public. If your BMS does not work, please open an issue with the advertised Bluetooth name, exact model, firmware version and a screenshot of the connection page.

## Connection

1. Install BMS Gateway on the Android phone near the battery.
2. Enable Bluetooth and, when required by Android, system location. Run the full 25-second scan and select the BMS.
3. Connect the phone and computer to the same Wi-Fi network.
4. Enable the local Wi-Fi gateway on the phone and copy the displayed `http://...:8765` address.
5. Enter that address on the Desktop Monitor connection page.

![Android gateway](screenshots/android-gateway-status.png)

| Phone Wi-Fi gateway | Desktop connection |
|---|---|
| ![Wi-Fi gateway](screenshots/android-wifi-gateway.png) | ![Desktop connection](screenshots/desktop-connection.png) |

## History and diagnostics

![History charts](screenshots/desktop-history.png)

The Android phone is the logger and gateway. It records samples locally every 30 seconds and exposes them only to devices on the local network. The desktop app can combine cell voltages with current, SOC, power, temperature and imbalance on the same time axis.

## Privacy and safety

- Local operation without a mandatory cloud account.
- No location data is read or stored; some Android versions require location to be enabled for BLE discovery.
- Read-only BMS telemetry in this preview.
- No modification of BMS protection parameters.
- One BMS normally accepts only one active Bluetooth application at a time; close the official JK app before connecting the gateway.

## Downloads

Open [Releases](https://github.com/zayants/bms-data-platform/releases) and download:

- `BMS-Gateway-0.3.3-Android.apk` for the phone;
- `BMS-Data-Platform-0.6.4-Windows-x64.zip` for the computer;
- `BMS-Connection-Guide-Telegram.zip` for the Russian connection guide and screenshots.

The source code is not distributed in this public download repository. Copyright © 2026 zayants. All rights reserved.

---

## Русский

BMS Data Platform — система долговременного мониторинга JK/Jikong BMS. Телефон находится рядом с аккумулятором, поддерживает Bluetooth-связь, хранит историю и работает как локальный Wi-Fi-шлюз. Компьютер получает данные через домашнюю сеть и показывает полноценный монитор с графиками.

Для начала скачайте APK и Windows-архив в разделе [Releases](https://github.com/zayants/bms-data-platform/releases), затем воспользуйтесь [подробной инструкцией подключения](docs/connection-guide-ru.md).

Проект пока находится на стадии публичного тестирования. Отзывы о неподдерживаемых моделях JK/Jikong особенно полезны: указывайте модель BMS, версию прошивки, имя Bluetooth-устройства и модель телефона.

