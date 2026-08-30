# BMS Data Platform 0.7.15

## Русский

Комплект для постоянного мониторинга аккумулятора с JK/Jikong BMS. Телефон подключается к BMS по Bluetooth, записывает историю и передаёт данные по локальной Wi‑Fi-сети. Компьютер отображает текущие параметры, историю и диагностические графики.

### Файлы релиза

- **BMS-Gateway-0.4.3-Android.apk** — приложение-шлюз для телефона Android.
- **BMS-Data-Platform-0.7.15-Windows-x64.zip** — монитор для компьютера Windows x64.
- Файлы **SHA256** позволяют проверить целостность загрузки.

### Для чего это полезно

- **Старый телефон становится автономным шлюзом.** Его можно оставить возле аккумулятора с постоянным питанием: он поддерживает Bluetooth-связь с BMS и продолжает записывать историю.
- **Без облака и аккаунта.** Данные передаются напрямую внутри вашей локальной Wi‑Fi-сети и не отправляются на сторонний сервер.
- **История до одного года.** Можно посмотреть, что происходило с током, мощностью, SOC, температурой, разбалансом и каждой ячейкой раньше, а не только в текущую секунду.
- **До 32 ячеек.** Кривые отдельных ячеек можно включать и выключать, менять их цвета и совмещать с током, мощностью или SOC.
- **Собственная компоновка анализа.** Добавляйте нужные параметры в общий график, убирайте лишние и сохраняйте удобный набор для следующего запуска.
- **Пороговые линии.** На графиках видны доступные защитные значения, полученные из BMS, и собственные диагностические границы. Пользовательские пороги ничего не записывают в BMS.
- **Диагностические метки.** Вертикальные метки позволяют закрепить важные моменты времени и сравнить одно событие сразу на нескольких параметрах.
- **Диагностика SOC 0/100%.** Программа отмечает моменты коррекции SOC и сохраняет состояние ячеек, тока и батареи для последующего разбора.
- **Контроль связи.** Записываются потеря и восстановление соединения с длительностью обрыва.
- **Экспорт данных.** Телефон сохраняет историю в CSV для дальнейшего анализа, а компьютер экспортирует данные в Excel.
- **Портативная Windows-версия.** Установка не требуется: достаточно распаковать архив и запустить программу.

### Полезные советы

- Закрепите за телефоном постоянный IP-адрес в настройках роутера — тогда адрес шлюза не будет меняться.
- Не выгружайте телефонное приложение из памяти и отключите для него агрессивную экономию батареи, если шлюз должен работать постоянно.
- Для поиска слабой ячейки откройте историю напряжений, оставьте несколько подозрительных ячеек и добавьте ток: просадка под одинаковой нагрузкой станет заметнее.
- Если время работы или SOC выглядит странно, сравните SOC с напряжением ячеек и током. Значение SOC приходит из BMS и может дрейфовать из-за погрешности встроенного шунта.
- Используйте пользовательские пороги как визуальные ориентиры для анализа. Аппаратную защиту необходимо правильно настроить в самой BMS официальным приложением.

### Как запустить

1. Установите APK на телефон и подключите его к JK BMS по Bluetooth.
2. Подключите телефон и компьютер к одной Wi‑Fi-сети.
3. В телефонном приложении включите локальный шлюз и посмотрите его сетевой адрес.
4. Распакуйте Windows-архив и запустите **BMS Data Platform.exe**.
5. В разделе подключения компьютера укажите адрес, показанный телефоном.

### Что нового

- Двунаправленные графики тока и мощности: заряд выше нуля, разряд ниже нуля.
- Переключаемая центральная шкала для удобного сравнения заряда и разряда.
- Полосы комбинированных графиков изолированы: кривые, заливки и пороги не накладываются на соседние параметры.
- Независимые перемещаемые временные метки для каждого подходящего графика.
- Пороги BMS и пользовательские пороги остаются видимыми без чрезмерного растягивания масштаба.
- Проверка физического диапазона и правильного порядка пользовательских порогов.
- Единая цветовая логика заряда и разряда для кривых, значений и подсказок.
- Более различимые цвета ячеек и улучшенная толщина линий.
- Шрифты встроены в приложение и работают без интернета; для русского и украинского используется встроенный шрифт с кириллицей.
- В настройках можно управлять видимостью графиков, тенями, порогами и режимом шкалы.

Система работает только в режиме мониторинга и не изменяет защитные настройки BMS.

---

## English

A two-part system for continuous battery monitoring with JK/Jikong BMS. The phone connects to the BMS over Bluetooth, records history and provides the data over the local Wi‑Fi network. The Windows application displays live values, history and diagnostic charts.

### Release files

- **BMS-Gateway-0.4.3-Android.apk** — Android phone gateway.
- **BMS-Data-Platform-0.7.15-Windows-x64.zip** — Windows x64 desktop monitor.
- **SHA256** files are provided to verify download integrity.

### Why it is useful

- **Turn an old phone into a dedicated gateway.** Leave it near the battery with permanent power: it maintains the Bluetooth connection and records history in the background.
- **No cloud and no account.** Data stays inside your local Wi‑Fi network and is not sent to a third-party server.
- **Up to one year of history.** Review current, power, SOC, temperature, imbalance and individual cell behaviour instead of seeing only the current moment.
- **Up to 32 cells.** Enable or disable individual cell curves, choose their colours and combine them with current, power or SOC.
- **Custom analysis layout.** Add useful parameters to the combined chart, remove unnecessary ones and keep the preferred layout for the next launch.
- **Threshold lines.** Display available protection values received from the BMS and local diagnostic limits. Custom thresholds never write anything to the BMS.
- **Diagnostic time markers.** Pin important moments and compare the same event across several parameters.
- **SOC 0/100% diagnostics.** The application marks SOC correction events and records cell, current and battery conditions for later analysis.
- **Connection monitoring.** Connection loss and recovery are recorded together with outage duration.
- **Data export.** The phone exports history to CSV, while the desktop application can export data to Excel.
- **Portable Windows application.** No installation is required: extract the archive and run the executable.

### Useful tips

- Reserve a fixed IP address for the phone in your router so the gateway address does not change.
- Exclude the gateway application from aggressive Android battery optimisation if it must run continuously.
- To investigate a weak cell, open cell-voltage history, leave only the suspected cells enabled and add current. Voltage sag under a similar load becomes easier to see.
- If runtime or SOC looks unusual, compare SOC with cell voltages and current. SOC is reported by the BMS and may drift because of built-in shunt accuracy.
- Treat custom thresholds as visual diagnostic guides. Hardware protection must still be configured correctly in the BMS using the official application.

### Getting started

1. Install the APK on the phone and connect it to the JK BMS over Bluetooth.
2. Connect the phone and computer to the same Wi‑Fi network.
3. Enable the local gateway in the phone application and note its network address.
4. Extract the Windows archive and run **BMS Data Platform.exe**.
5. Enter the address displayed by the phone on the desktop Connection page.

### What is new

- Bidirectional current and power charts: charging above zero and discharge below zero.
- Optional centred scale for direct comparison of charging and discharge.
- Isolated combined-chart lanes prevent curves, fills and thresholds from overlapping neighbouring parameters.
- Independent draggable time markers for every applicable history chart.
- BMS and custom thresholds remain visible without forcing an excessively wide data scale.
- Physical-range and lower/upper-order validation for custom thresholds.
- Consistent charging and discharge colours across curves, values and tooltips.
- Clearer cell colours and improved line weight.
- Fonts are bundled for offline use; Russian and Ukrainian use the included Cyrillic font.
- Settings control chart visibility, curve shadows, thresholds and scale mode.

The system operates in read-only monitoring mode and does not change BMS protection settings.
