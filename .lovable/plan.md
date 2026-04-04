## Restructuring Plan — Surgical Changes Only

### Batch 1: Navigation + Routes (foundation)
- Update sidebar nav to new 6-item structure
- Update App.tsx routes: add /ip-intelligence, /network-health, /settings; remove old routes
- Rename "Devices" label to "Network Devices"

### Batch 2: IP Intelligence Page
- Create `/ip-intelligence` page with two sub-tabs: All IPs, Blacklist
- Create reusable IP Detail Drawer component (used across pages)
- Move/reuse existing IPReputationTab and blacklist components

### Batch 3: Network Health Page  
- Create `/network-health` page with three sub-tabs: Uptime, Abuse, Report
- Move existing UptimeReportTab content into Uptime sub-tab
- Move existing AbuseReports content into Abuse sub-tab
- Create new Report sub-tab with health score gauge

### Batch 4: Settings Page Enhancement
- Move notification config (Telegram, SMS, channels) into Settings as Card 1
- Arrange settings cards in specified order
- Remove Notifications from sidebar

### Batch 5: Dashboard Redesign
- Replace current dashboard content with hero stats + module summary cards
- Add performance charts row
- Add recent events log
- Remove old flat/server view toggle from dashboard

### Batch 6: Devices Page Updates
- Rename to "Network Devices" / "Gadgets"
- Ensure device cards show interfaces + IPs inline
- Remove any standalone IP add flows
- Keep existing Add Device Wizard (already 5 steps)

Each batch builds on the previous. No database changes needed — all tables already exist.