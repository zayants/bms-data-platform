# BMS Data Platform 0.7.33 / BMS Gateway 0.4.8

## English

This release adds a controlled active diagnostic for tracking cell resistance over the battery lifetime.

- The phone can briefly switch JK BMS Charge MOS off and restore it while a stable positive charging current is present.
- Cell resistance is calculated independently on the switch-off and return-current edges. Matching edges are averaged; inconsistent values are rejected.
- The function requires a temporary 30-minute physical permission on the phone, safe and stable conditions, and explicit confirmation on the computer. The actual interruption lasts only a few seconds.
- A new **Details** section explains the complete measurement algorithm step by step.
- Every completed test is stored permanently on the phone for the selected BMS.
- The desktop compares the newest test with the first and previous measurements made at similar SOC, temperature and charge current.
- Possible cell anomalies are detected relative to the pack median, reducing false warnings caused by a common temperature or measurement shift.
- Fast background history synchronisation no longer flashes a banner; progress appears only when synchronisation takes longer than five seconds. Errors remain immediate.

Normal monitoring remains read-only. The active test never changes protection thresholds, but it does control Charge MOS briefly. Stay beside the battery and charger while it runs. This is a comparative diagnostic, not a laboratory DCIR measurement or an automatic fault diagnosis.

## Русский

В этой версии добавлена контролируемая активная диагностика для отслеживания изменения сопротивления ячеек в течение срока службы аккумулятора.

- Телефон может кратковременно отключить Charge MOS JK BMS и восстановить его при наличии стабильного положительного тока заряда.
- Сопротивление каждой ячейки рассчитывается отдельно при отключении и повторном включении тока. Согласованные результаты усредняются, противоречивые отбрасываются.
- Функция требует временного физического разрешения на телефоне сроком 30 минут, безопасных стабильных условий и явного подтверждения на компьютере. Само отключение длится лишь несколько секунд.
- Кнопка **«Подробнее»** раскрывает полный пошаговый алгоритм измерения.
- Каждый завершённый тест постоянно сохраняется на телефоне отдельно для выбранной BMS.
- Компьютер сравнивает новый тест с первым и предыдущим замерами при близких SOC, температуре и токе заряда.
- Возможные аномалии определяются относительно медианы всего пакета, чтобы общий температурный или измерительный сдвиг не создавал ложных предупреждений.
- Быстрая фоновая синхронизация больше не показывает мигающий баннер: он появляется только при загрузке дольше пяти секунд. Ошибки отображаются сразу.

Обычный мониторинг остаётся режимом только для чтения. Активный тест не меняет защитные пороги, но кратковременно управляет Charge MOS. Во время теста оставайтесь рядом с батареей и зарядным устройством. Это сравнительная диагностика, а не лабораторное измерение DCIR и не автоматический диагноз неисправности.
