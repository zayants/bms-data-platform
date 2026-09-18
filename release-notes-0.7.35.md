# BMS Data Platform 0.7.35 / Android Gateway 0.4.9

## English

Update both the Windows monitor and Android gateway for the complete connection-history fixes. Install the APK over the existing app; do not uninstall it if you want to keep phone history and settings.

Complete illustrated manuals are attached to this release: [English PDF](https://github.com/zayants/bms-data-platform/releases/download/v0.7.35/BMS_Data_Platform_User_Manual_EN_v0.7.35.pdf) and [Russian PDF](https://github.com/zayants/bms-data-platform/releases/download/v0.7.35/BMS_Data_Platform_User_Manual_RU_v0.7.35.pdf).

- History lines and shaded areas now break across detected telemetry gaps instead of drawing a misleading bridge, including bidirectional current and power charts.
- Bluetooth loss/restoration and phone-gateway network loss/restoration have separate square icons. Hover for the event time and connection type.
- Manual BMS disconnection on the phone is recorded; restoration is confirmed by a valid telemetry sample. Previously unrecorded events cannot be recreated retroactively.
- Connection-history refresh continues when telemetry stops. Events after the newest telemetry point are included. Existing history remains available when a background refresh fails.
- Missing network intervals are filled only if real recorded samples are subsequently synchronized from the phone. A network outage does not necessarily mean the phone stopped recording BMS data.
- An SSE reconnect no longer immediately produces a false network-loss event while HTTP polling is healthy.
- Android includes a read-only preview API for external monitoring: `/api/monitoring/v1/snapshot`. See [API documentation](https://github.com/zayants/bms-data-platform/blob/main/docs/MONITORING-API.md). It requires no `clientApi` parameter. Use only on a trusted local network; the gateway has no HTTPS or authentication. No ready-made Zabbix template is included yet.

Normal monitoring does not change BMS protection settings. Existing separately armed active diagnostics are unchanged. Short gaps may be less visible at coarse time scales. Network events are recorded by the running monitor; they do not reconstruct periods when it was closed.

Validation: 58 desktop tests passed, TypeScript and production build passed; Android unit tests and compilation passed.

## Русский

Для полного исправления истории соединений обновите и Windows-монитор, и телефон-шлюз. Устанавливайте APK поверх приложения: не удаляйте его, чтобы сохранить историю и настройки телефона.

К релизу приложены полные иллюстрированные руководства: [на русском языке](https://github.com/zayants/bms-data-platform/releases/download/v0.7.35/BMS_Data_Platform_User_Manual_RU_v0.7.35.pdf) и [на английском языке](https://github.com/zayants/bms-data-platform/releases/download/v0.7.35/BMS_Data_Platform_User_Manual_EN_v0.7.35.pdf).

- Линии и заливки графиков разрываются при обнаруженных пропусках измерений, без выдуманной прямой между ними. Это относится и к двунаправленным графикам тока и мощности.
- Потеря/восстановление Bluetooth и недоступность/восстановление телефона по сети отмечаются разными квадратными значками. При наведении доступны время и тип события.
- Ручное отключение BMS на телефоне записывается в журнал. Восстановление подтверждается получением корректного измерения. Ранее не записанные события задним числом восстановить нельзя.
- Журнал обновляется и при остановке телеметрии; события после последней точки больше не теряются. Ошибка фонового обновления не скрывает уже загруженную историю.
- Пропуск после потери Wi-Fi заполняется только реальными записями, полученными при последующей синхронизации с телефоном. Телефон может продолжать запись BMS без связи с компьютером.
- Перезапуск потока SSE больше не считается немедленным обрывом сети, если обычные HTTP-запросы продолжают работать.
- В Android добавлен предварительный API только для чтения: `/api/monitoring/v1/snapshot`. [Описание API](https://github.com/zayants/bms-data-platform/blob/main/docs/MONITORING-API.md). Параметр `clientApi` не нужен. Используйте только доверенную локальную сеть: HTTPS и авторизации у шлюза нет. Готового шаблона Zabbix пока нет.

Обычный мониторинг не меняет защитные настройки BMS. Существующие отдельно разрешаемые активные тесты не изменены. На крупном временном масштабе короткие разрывы могут быть менее заметны. Сетевые события записывает работающий монитор; периоды, когда он был закрыт, не восстанавливаются.

Проверки: 58 тестов ПК, TypeScript и production-сборка; тесты и компиляция Android прошли успешно.
