# BMS Data Platform 0.7.34 / Android Gateway 0.4.8

## English

Updated build (September 5): fixed exiting fullscreen when switching the history period. The expanded chart now stays open while loading, including when the selected range is empty or loading fails. Download the Windows archive again if you installed the earlier 0.7.34 build. Android Gateway 0.4.8 is unchanged.

This maintenance release improves time-range switching on the History page.

- Selecting **1 hour**, **24 hours**, **7 days**, **30 days** or **1 year** now immediately removes the previous range from the screen.
- A clear loading state is displayed while the selected history range is read from the synchronized local archive.
- Shorter periods use an optimized number of chart points, reducing redraw time while retaining useful detail.
- All history charts, including fullscreen charts, use the same period-switching behavior.
- The package includes the unchanged **Android Gateway 0.4.8**.

The application remains local-first. The phone stores BMS history and the Windows monitor synchronizes only the missing records.

## Русский

Исправленная сборка (5 сентября): устранён выход из полноэкранного графика при переключении периода. График остаётся развёрнутым во время загрузки, при отсутствии записей и ошибке загрузки. Если вы установили прежнюю сборку 0.7.34, скачайте Windows-архив повторно. Android Gateway 0.4.8 не изменён.

Это техническое обновление улучшает переключение временного диапазона на странице «История».

- При выборе **1 часа**, **24 часов**, **7 дней**, **30 дней** или **1 года** предыдущий диапазон сразу убирается с экрана.
- Пока выбранный участок читается из синхронизированного локального архива, отображается понятный индикатор загрузки.
- Для коротких периодов используется оптимизированное количество точек: графики перестраиваются быстрее без потери полезной детализации.
- Одинаковое поведение работает во всех графиках, включая полноэкранный режим.
- В комплект входит неизменённый **Android Gateway 0.4.8**.

Приложение по-прежнему работает локально: телефон хранит историю BMS, а Windows-монитор догружает только отсутствующие записи.
