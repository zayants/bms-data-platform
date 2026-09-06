# External monitoring API v1 — development preview

Included starting with Android Gateway 0.4.9. Earlier 0.4.8 APKs do not contain this endpoint.
This contract is separate from the desktop's `clientApi` compatibility check.
Bluetooth, desktop APIs and active-test permissions are unchanged.

## English

Enable the gateway's local web server. Use its displayed Wi-Fi address:

```sh
curl --max-time 10 "http://PHONE_IP:8765/api/monitoring/v1/snapshot"
```

No `clientApi` parameter is needed. GET returns JSON, HEAD returns headers, OPTIONS
returns 204. Writes to this route return 405. Unknown routes/versions return 404.
Monitoring requests do not invoke desktop compatibility notifications or control callbacks.
The monitoring namespace exposes no Charge MOS or diagnostic-start commands.

**Security:** this is unauthenticated, unencrypted local HTTP, using the existing
gateway web server. Use only on a trusted LAN; do not port-forward it to the Internet.
This new read-only namespace does NOT secure or disable existing control endpoints.
For remote access use a separately secured network solution. No cloud account needed.

### Response

Envelope fields: `schemaVersion` (1), `gatewayVersion` (string), `serverTime` and
`timestamp` (Unix milliseconds), `ageMs`, `deviceName`, `available`, `connected`,
`stale`, `data`. Timestamp and age are null before the first sample.
`available` means a sample exists, not necessarily that it is fresh.

**When disconnected, absent, older than 10 seconds, or timestamped in the future,
`stale` is true and `data` is null.** HTTP 200 in this case means the server works,
not that the battery is healthy. Never convert missing measurements to zero.

Fresh `data` contains:

| Field | Meaning / unit |
|---|---|
| packVoltageV | Battery voltage, V |
| currentA | Battery current, A; positive charge, negative discharge |
| powerW | Voltage × current, W; same sign convention |
| socPercent | BMS SOC, %; may drift, not an independent capacity measurement |
| temperatureC | Summary temperature, °C; not a separate sensor per cell |
| deltaMv | Maximum minus minimum cell voltage, mV |
| cellsV | Ordered cell voltages, V; index 0 = C1; discover actual length |
| balancing | BMS balancing state, boolean |
| chargeMosEnabled / dischargeMosEnabled | MOS permissions, boolean or null; not proof of actual current |
| remainingCapacityAh / nominalCapacityAh | BMS capacity values, Ah, or null |
| chemistry | Chemistry string, or null |
| alarmMask / unknownAlarmMask | Integer alarm bit fields |
| alarms | Array of BMS alarm identifiers; empty means none reported |

### Zabbix integration outline (template pending target version)

Use one HTTP agent master item polling every 5–10 seconds, storing response as text.
Extract dependent items with JSONPath, for example `$.data.packVoltageV`,
`$.data.currentA`, `$.data.socPercent`, `$.data.cellsV[0]`.
Track `$.stale`, `$.connected` and `$.ageMs` separately. Discard unavailable numeric
values rather than recording zero. Distinguish HTTP failure from a disconnected BMS.
Do not treat gateway unavailability as a zero-alarm or zero-current condition.
Use cell discovery rather than hardcoding an 8-cell battery. Verify exact preprocessing
and import format against the user's Zabbix version before deploying a template.

Within v1, existing field meanings should be preserved; clients must ignore additional
fields. Breaking changes require a new route version. This is a preview, not yet a
release guarantee. Do not expose the API or publish real battery data without consent.

## Русский

Это отдельный предварительный API для внешнего мониторинга **только для чтения**.
Доступен начиная с APK 0.4.9; в ранее выпущенном APK 0.4.8 его нет. Адрес запроса приведён выше.
Подставьте IP телефона, указанный в приложении. Параметр `clientApi` не требуется.
Запросы не вызывают предупреждение о несовместимости компьютерной программы.

Внешний мониторинг не может через этот раздел API запускать тесты или переключать MOS.
Существующие управляющие адреса не изменены: это не защита всего сервера от записи.
Сервер не имеет авторизации и HTTPS — доступ допустим только в доверенной локальной сети.

Если BMS отключена, данных ещё нет или им больше 10 секунд, возвращается `stale: true`
и `data: null`. Старые измерения не выдаются как новые. Не заменяйте null нулём.
Временные метки — миллисекунды Unix. `cellsV[0]` — первая ячейка.
Ток положительный при заряде и отрицательный при разряде. SOC берётся из BMS и может
иметь накопленную погрешность. Разрешённый MOS не означает, что фактически течёт ток.

Для Zabbix планируется один запрос на все параметры и зависимые элементы данных.
Готовый импортируемый шаблон будет подготовлен после уточнения версии Zabbix и проверки.
