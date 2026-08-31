# BMS Data Platform 0.7.30

## Русский

BMS Data Platform — локальная система мониторинга аккумуляторов с JK/Jikong BMS. Она состоит из двух частей: Android-телефон подключается к BMS по Bluetooth и работает как шлюз, а программа для Windows получает данные через локальную Wi‑Fi-сеть. Облако и учётная запись не требуются.

### Скачать

- [Android Gateway 0.4.5](https://github.com/zayants/bms-data-platform/releases/download/v0.7.30/BMS-Gateway-0.4.5-Android.apk) — приложение для телефона, подключение к JK/Jikong BMS и передача данных по локальной сети.
- [Windows Monitor 0.7.30](https://github.com/zayants/bms-data-platform/releases/download/v0.7.30/BMS-Data-Platform-0.7.30-Windows-x64.zip) — переносной монитор для компьютера, установка не требуется.

### Возможности

- живые данные: SOC, напряжение батареи и ячеек, ток, мощность, температуры, разбаланс, балансировка и состояния MOSFET;
- работа с конфигурациями от 4 до 32 ячеек;
- отдельные и комбинированные графики с выбором периода до одного года;
- включение отдельных кривых ячеек, выбор цветов, масштабирование и временные метки;
- пороги, полученные из BMS, и пользовательские диагностические пороги;
- метки событий SOC 0/100%, потери и восстановления связи, включения и отключения зарядного канала;
- журнал событий и история соединения с BMS;
- косвенный анализ внутреннего сопротивления и оценка наполнения ячеек;
- учёт фактически принятого заряда по сессиям;
- экспорт истории в Excel;
- QR-код и цифровой адрес для открытия монитора на другом устройстве в той же сети;
- светлая и тёмная темы, интерфейс на русском, украинском и английском языках.

### Изменения 0.7.30

- исправлен белый экран в мобильных браузерах без поддержки `crypto.randomUUID()`;
- добавлен понятный экран ошибки вместо пустой страницы;
- QR-доступ переведён на встроенный локальный веб-сервер;
- код JK BMS `0x80000` распознаётся как напоминание изменить пароль, а не как авария батареи;
- обновлены сетевые и диагностические уведомления.

Приложение работает в режиме чтения и не изменяет защитные параметры BMS.

---

## English

BMS Data Platform is a local battery monitoring system for JK/Jikong BMS. It has two parts: an Android phone connects to the BMS over Bluetooth and acts as a gateway, while the Windows application receives the data over the local Wi‑Fi network. No cloud service or account is required.

### Downloads

- [Android Gateway 0.4.5](https://github.com/zayants/bms-data-platform/releases/download/v0.7.30/BMS-Gateway-0.4.5-Android.apk) — phone application for connecting to a JK/Jikong BMS and sharing telemetry over the local network.
- [Windows Monitor 0.7.30](https://github.com/zayants/bms-data-platform/releases/download/v0.7.30/BMS-Data-Platform-0.7.30-Windows-x64.zip) — portable desktop monitor; installation is not required.

### Features

- live SOC, pack and cell voltage, current, power, temperatures, imbalance, balancing and MOSFET status;
- support for configurations from 4 to 32 cells;
- individual and combined charts with periods up to one year;
- per-cell curve visibility, configurable colours, zooming and time markers;
- thresholds decoded from the BMS and user-defined diagnostic thresholds;
- SOC 0/100%, connection loss/recovery and charge-channel event markers;
- BMS event log and connection history;
- indirect cell-resistance analysis and estimated cell-fill diagnostics;
- measured charge received during each charging session;
- Excel history export;
- QR code and numeric address for opening the monitor on another device on the same network;
- light and dark themes with English, Ukrainian and Russian interfaces.

### Changes in 0.7.30

- fixed the blank screen in mobile browsers without `crypto.randomUUID()` support;
- added a readable error screen instead of an empty page;
- moved QR access to an integrated local web server;
- JK BMS code `0x80000` is recognised as a password-change reminder rather than a battery alarm;
- updated network and diagnostic notifications.

The application is read-only and does not change BMS protection settings.
