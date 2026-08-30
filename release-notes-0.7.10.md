# BMS Data Platform 0.7.10

- Adds configurable History sections and a hide button directly in every chart header.
- Adds one-year balancing diagnostics aligned to the real month in which history recording began.
- Adds Excel export for battery data, SOC events, connection history and metadata.
- Improves cell indication using battery chemistry, absolute voltage, pack deviation, BMS alarms and stale-data state.
- Makes inferred balancing cells clearly visible and labels the inference honestly.
- Adds a prominent warning that estimated cell resistance is an indirect trend indicator, not a laboratory DCR measurement.
- Reworks the physical energy-flow diagram on both the desktop and phone: charger → BMS → battery, with a separate BMS → load branch.
- Compacts the desktop Overview so the important telemetry fits more comfortably in one window.
- Synchronizes the Diagnostic Center with the implemented SOC, resistance, connection, threshold and balancing tools.
- Includes Android Gateway 0.4.0.
