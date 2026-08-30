# BMS Data Platform 0.7.30

## Исправления

- Исправлен белый экран в мобильных браузерах без поддержки `crypto.randomUUID`.
- Добавлен понятный экран ошибки вместо бесконечной белой страницы.
- QR-доступ к компьютерному монитору теперь работает через локальный сетевой сервер.
- Код `0x80000` распознаётся как напоминание сменить пароль BMS, а не как авария.
- Обновлены сетевые и диагностические уведомления.

## English

- Fixed the blank page on mobile browsers without `crypto.randomUUID` support.
- Added a readable error screen instead of a blank page.
- QR access to the desktop monitor now uses a local network server.
- Code `0x80000` is shown as a password-change reminder, not a battery alarm.

## Комплект

- `BMS-Data-Platform-0.7.30-Windows-x64.zip` — компьютерная часть.
- `BMS-Gateway-0.4.5-Android.apk` — приложение-шлюз для телефона и подключения к JK BMS.

## Возможности / Features

### Русский

BMS Data Platform состоит из двух частей: Android-телефон подключается к JK/Jikong BMS по Bluetooth и работает как шлюз, а Windows-монитор показывает данные на большом экране по локальной Wi‑Fi-сети. Облачный аккаунт не нужен.

Доступны обзор SOC, напряжения, тока, мощности, температур, балансировки и состояния MOSFET; сетка ячеек 4–32S; история до года; отдельные и комбинированные графики; включение и отключение кривых ячеек; пороги BMS и пользовательские пороги; метки SOC 0/100%; события потери связи; косвенный анализ сопротивления; диагностика наполнения ячеек; экспорт истории в Excel; QR-код и цифровой адрес для открытия монитора на другом устройстве.

Приложение работает в режиме чтения и не изменяет защитные параметры BMS.

### English

BMS Data Platform has two parts: the Android phone connects to a JK/Jikong BMS over Bluetooth and acts as a gateway, while the Windows monitor presents the data on a large screen over the local Wi‑Fi network. No cloud account is required.

It includes live SOC, pack voltage, current, power, temperatures, balancing and MOSFET status; configurable 4–32S cell layouts; up to one year of history; individual and combined charts; per-cell curve visibility; BMS and user thresholds; SOC 0/100% markers; connection-loss events; indirect resistance analysis; cell-fill diagnostics; Excel export; and a QR code with a numeric address for opening the monitor on another device.

The application is read-only and does not change BMS protection settings.
