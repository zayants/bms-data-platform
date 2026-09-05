# BMS Data Platform — release notes

## 0.7.33 / Android Gateway 0.4.8

- Added a physically armed, controlled two-edge Charge MOS pulse test for comparative cell-resistance diagnostics.
- Every completed test is retained on the phone and compared over time under similar SOC, temperature and charge-current conditions.
- Added per-cell trend and anomaly indication relative to the pack median.
- Added a step-by-step **Details** guide and visible switch-off/return-edge results.
- History-sync progress is shown only when loading takes longer than five seconds.

Full bilingual notes: [release-notes-0.7.33.md](release-notes-0.7.33.md).

---

# Previous public preview

This first public preview combines:

- **BMS Gateway 0.3.3** for Android 8.0 and newer;
- **Desktop Monitor 0.6.4** for Windows x64;
- a Russian connection guide with real application screenshots.

Highlights:

- read-only JK/Jikong BMS monitoring;
- JK02 / JK04 telemetry detection and manual Bluetooth device selection;
- automatic BMS reconnection;
- local Wi-Fi gateway without a mandatory cloud account;
- one year of history stored on the phone;
- CSV export;
- desktop overview, cells, events and advanced history charts;
- up to 32 cell-voltage curves;
- fullscreen individual charts with 1 hour, 24 hour, 7 day, 30 day and 1 year periods;
- English, Ukrainian, Russian, German, Polish, Spanish, French and Czech interfaces.

This is an early compatibility preview. Please report the exact BMS model and firmware if the gateway cannot read telemetry.

SHA-256 checksums are included in the release assets.
## 0.7.31

- Локальная синхронизация истории с телефона: первая установка загружает весь доступный архив, последующие запуски догружают только пропущенные записи.
- История хранится на компьютере отдельно для каждой BMS и доступна при временно недоступном телефоне.
- Добавлен банер устаревших данных при потере связи.
- Экспорт полной локальной истории в SQLite-compatible SQL и Excel перенесён в раздел «Настройки».
- Название функции приведено к единому виду: «Сравнение ячеек при одинаковой нагрузке».

## 0.7.31 (English)

- Local phone-to-PC history synchronization: the first setup downloads the available archive, later runs fetch only missing records.
- History is stored on the computer per BMS device and remains available when the phone is temporarily offline.
- Added a stale-data warning when the gateway connection is lost.
- Full local history export to SQLite-compatible SQL and Excel is available in Settings.
- Unified feature name: “Cell comparison at the same load”.
