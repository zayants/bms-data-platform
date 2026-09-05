# BMS Data Platform

Read-only monitoring for JK/Jikong BMS. An Android phone works as the Bluetooth gateway and local logger; the Windows dashboard provides a large-screen view, history and diagnostics over the local Wi-Fi network.

**Latest release: 0.7.33** · [Download Android and Windows packages](https://github.com/zayants/bms-data-platform/releases/tag/v0.7.33) · [Connection guide](docs/connection-guide-ru.md)

![Desktop overview](screenshots/desktop-overview.png)

## What it is for

The phone stays near the battery, maintains the BLE connection, and records telemetry locally. A computer, tablet or TV on the same Wi-Fi network can open the dashboard in a browser or use the Windows monitor. No cloud account is required.

## Included

- **BMS Gateway 0.4.8 (Android 8.0+)** — BMS scanning and manual selection, live telemetry, stable automatic reconnect, up to 32 cells, local history, CSV export, local Wi-Fi API and persistent active-test records.
- **BMS Data Platform 0.7.33 (Windows x64)** — overview, energy flow, configurable history charts, incremental phone-to-PC history synchronisation and long-term cell diagnostics including controlled two-edge charge-pulse resistance comparisons.
- Complete English, Ukrainian and Russian interfaces.

## Screenshots

| Android gateway | Windows overview |
|---|---|
| ![Android gateway](screenshots/android-gateway-status.png) | ![Windows overview](screenshots/desktop-overview.png) |

| Phone Wi-Fi gateway | History and diagnostics |
|---|---|
| ![Phone Wi-Fi gateway](screenshots/android-wifi-gateway.png) | ![History charts](screenshots/desktop-history.png) |

![Desktop connection](screenshots/desktop-connection.png)

## Compatibility and safety

The gateway supports JK/Jikong telemetry variants based on JK02 and JK04 protocols, including many 8S–32S models. Firmware and Bluetooth naming vary, so reports from untested BMS models are welcome.

Normal monitoring is read-only and never changes BMS protection parameters. A separately armed experimental diagnostic can briefly switch Charge MOS off and restore it to estimate cell resistance from two current edges; it requires physical permission on the phone, positive stable charge current and user confirmation. Bluetooth discovery may require Android system Location to be enabled, although the app does not read or store location. Close the official JK app before connecting because a BMS normally accepts one active Bluetooth client at a time.

## Quick start

1. Install the Android APK on a phone placed near the battery.
2. Enable Bluetooth and, if Android requests it, system Location. Scan and select the required BMS.
3. Connect the phone and computer to the same Wi-Fi network.
4. Enable the phone Wi-Fi gateway and copy its local address.
5. Enter that address on the Windows monitor connection page.

## Downloads

- [Android Gateway 0.4.8 APK](https://github.com/zayants/bms-data-platform/releases/download/v0.7.33/BMS-Gateway-0.4.8-Android.apk)
- [Windows Monitor 0.7.33 x64](https://github.com/zayants/bms-data-platform/releases/download/v0.7.33/BMS-Data-Platform-0.7.33-Windows-x64.zip)
- [All release files](https://github.com/zayants/bms-data-platform/releases/tag/v0.7.33)

---

## Русская версия

**BMS Data Platform** — система мониторинга JK/Jikong BMS только для чтения. Телефон находится рядом с аккумулятором, поддерживает Bluetooth-связь и записывает историю. Компьютер, планшет или телевизор в той же Wi-Fi-сети отображает данные через браузер или Windows-монитор.

**Последняя версия: 0.7.33** · [Скачать APK и Windows-архив](https://github.com/zayants/bms-data-platform/releases/tag/v0.7.33) · [Инструкция по подключению](docs/connection-guide-ru.md)

### Возможности

- **BMS Gateway 0.4.8 для Android 8.0+** — поиск и ручной выбор BMS, текущие параметры, устойчивое автопереподключение, до 32 ячеек, локальная история, экспорт CSV, локальный Wi-Fi API и постоянное хранение результатов активных тестов.
- **BMS Data Platform 0.7.33 для Windows x64** — обзор батареи, поток энергии, настраиваемые графики, дозагрузка истории с телефона и долговременная диагностика ячеек, включая контролируемый двухсторонний импульсный тест сопротивления.
- Полностью переведённые интерфейсы: русский, английский и украинский.

### Подключение

1. Установите APK на телефон и разместите его рядом с аккумулятором.
2. Включите Bluetooth и, если требует Android, системную геолокацию. Выполните сканирование и выберите нужную BMS.
3. Подключите телефон и компьютер к одной Wi-Fi-сети.
4. Включите Wi-Fi-шлюз на телефоне и скопируйте показанный локальный адрес.
5. Введите адрес на странице подключения Windows-монитора.

### Важно

Обычный мониторинг работает только в режиме чтения и не изменяет защитные параметры BMS. Отдельно разрешаемая экспериментальная диагностика может кратковременно отключить и восстановить Charge MOS для оценки сопротивления по двум фронтам тока. Для неё нужны физическое разрешение на телефоне, положительный стабильный ток заряда и подтверждение пользователя. Геолокация нужна некоторым версиям Android для обнаружения BLE, но приложение не читает и не сохраняет координаты. Перед подключением закройте официальное приложение JK: одна BMS обычно принимает только одного Bluetooth-клиента.

### Скачать

- [APK для телефона 0.4.8](https://github.com/zayants/bms-data-platform/releases/download/v0.7.33/BMS-Gateway-0.4.8-Android.apk)
- [Windows-монитор 0.7.33 x64](https://github.com/zayants/bms-data-platform/releases/download/v0.7.33/BMS-Data-Platform-0.7.33-Windows-x64.zip)
- [Страница релиза](https://github.com/zayants/bms-data-platform/releases/tag/v0.7.33)

Проект находится в публичном тестировании. Если ваша BMS не подключается, сообщите модель, прошивку, имя Bluetooth-устройства и версию Android.
