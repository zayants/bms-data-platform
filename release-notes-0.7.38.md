# BMS Data Platform 0.7.38 / Android Gateway 0.4.11

## English

Install **both** files from this release: Windows monitor 0.7.38 and Android gateway 0.4.11. These versions use a compatibility check; an older component can show an incompatibility warning instead of displaying misleading data. Install the APK over the existing phone app **without uninstalling it**, so its settings and recorded history remain in place. Unzip the Windows package completely and run `BMS Data Platform.exe` inside its folder. Close any previous copy first, because the local monitor uses port 4174.

Changes since the public 0.7.35 / 0.4.9 release:

- A local **Batteries** page keeps synchronized history separate for each BMS address. Archived batteries can be selected for analysis; a new battery is announced when first detected.
- SQL and Excel exports can include all locally stored batteries or one selected battery. The history export now includes both battery temperature sensors when available.
- The phone gateway supplies separate temperature readings, more complete history-sync metadata, and a steadier remaining-time estimate.
- The cell-voltage chart explains that curve colours identify cells; they do **not** indicate alarm severity. Threshold tooltips are translated and chart controls have clearer contrast.
- The password-change reminder bit (`0x80000`) is not treated as a battery fault.
- The existing active charge-pulse resistance diagnostic remains **experimental**. It is not part of ordinary read-only monitoring and must be explicitly armed on the phone; it only proceeds under its charge-current and safety conditions. It does not change BMS protection thresholds.

The Android APK is signed with the release certificate. Android 8.0+ and Windows x64 are supported. The [illustrated manuals](https://github.com/zayants/bms-data-platform/tree/main/docs/manuals) were written for 0.7.35 and may not yet describe every new control; use these notes for changes since then. The [external read-only monitoring API](https://github.com/zayants/bms-data-platform/blob/main/docs/MONITORING-API.md) remains available on a trusted local network.

Validation: Windows TypeScript production build and 59 unit tests passed; Android unit tests passed, and the APK version and signature were checked.

## Русский

Установите **обе** части из этого релиза: Windows-монитор 0.7.38 и телефон-шлюз 0.4.11. Между ними действует проверка совместимости: старая часть может показать предупреждение вместо недостоверных данных. Устанавливайте APK **поверх существующего приложения, не удаляя его**, чтобы сохранить настройки и историю на телефоне. Windows-архив нужно полностью распаковать и запустить `BMS Data Platform.exe` из папки. Сначала закройте прежнюю копию программы: монитор использует локальный порт 4174.

Изменения после публичного релиза 0.7.35 / 0.4.9:

- Появилась страница **«Аккумуляторы»**: синхронизированная история разных BMS хранится отдельно по адресу устройства. Можно открыть архив конкретного аккумулятора; новое устройство отмечается при первом обнаружении.
- При экспорте SQL и Excel можно выбрать все локально сохранённые аккумуляторы либо один. В историю для экспорта добавлены показания двух датчиков температуры, если BMS их передаёт.
- Телефон-шлюз передаёт отдельные показания температуры, дополнительные сведения о синхронизации истории и более стабильную оценку оставшегося времени.
- На графике ячеек пояснено, что цвета кривых обозначают ячейки, **а не степень аварии**. Подсказки порогов переведены, элементы графиков стали контрастнее.
- Напоминание BMS о смене пароля (`0x80000`) больше не считается неисправностью аккумулятора.
- Ранее добавленный активный импульсный тест сопротивления остаётся **экспериментальным**. Он не входит в обычный мониторинг только для чтения, включается отдельно на телефоне и проводится лишь при выполнении условий по току заряда и безопасности. Защитные пороги BMS он не меняет.

APK подписан релизным ключом. Поддерживаются Android 8.0+ и Windows x64. [Иллюстрированные руководства](https://github.com/zayants/bms-data-platform/tree/main/docs/manuals) подготовлены для 0.7.35 и могут пока не описывать все новые элементы; изменения приведены здесь. [Внешний API только для чтения](https://github.com/zayants/bms-data-platform/blob/main/docs/MONITORING-API.md) доступен в доверенной локальной сети.

Проверки: production-сборка TypeScript для Windows и 59 тестов прошли; тесты Android прошли, версия и подпись APK проверены.
