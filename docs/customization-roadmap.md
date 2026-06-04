# Digital Wellbeing — Customization Roadmap

## Limit Behavior

| Feature | Description | Complexity |
|---|---|---|
| **Grace period** | When limit hits, give user a 5/10/15 min buffer before killing. Countdown shown in notification. | Medium |
| **Snooze** | "Give me 15 more mins" button on the exceeded dialog. One-time per day per app. | Low |
| **Per-app kill toggle** | Each limit card has its own kill/notify toggle instead of one global setting. | Low |
| **Soft vs Hard limit** | Soft = notify only. Hard = kill. Set per app at limit creation time. | Low |
| **Multi-step warnings** | Notify at 50%, 80%, 95%, 100% — configurable thresholds per step. | Medium |

---

## Tracking Control

| Feature | Description | Complexity |
|---|---|---|
| **Pause tracking** | Tray menu toggle — stop logging while in a meeting or doing personal stuff. | Low |
| **App exclusion list** | Blacklist apps from ever being tracked (File Explorer, Task Manager, etc.). | Low |
| **Minimum session threshold** | Ignore app if active < N seconds — removes noise from accidental clicks. | Low |
| **Custom app name** | Rename "chrome" → "Work Research" for a cleaner dashboard. | Medium |

---

## Focus Mode

| Feature | Description | Complexity |
|---|---|---|
| **Session presets** | Save named whitelist configs — "Deep Work" (VS Code only), "Writing" (Notion + Docs). | Medium |
| **Focus intensity** | Gentle = notify when blocked app opens. Strict = kill immediately (current default). | Low |
| **Break reminder** | After N mins of screen time without a focus session, notify user to start one. | Medium |

---

## Schedule

| Feature | Description | Complexity |
|---|---|---|
| **Work hours only** | Limits only apply Mon–Fri 9am–6pm. Off-hours = no restrictions. | High |
| **Weekend mode** | Different limits on weekends vs weekdays. | High |

---

## Recommended Build Order

1. **Pause tracking** (tray toggle) — most universally needed, ~30 min work
2. **Grace period + Snooze** — makes the kill feature feel less aggressive
3. **Per-app kill toggle** — inline on each limit card, very visible UX win
4. **App exclusion list** — settings page addition, simple DB change
5. **Focus presets** — saves real time for repeat users
6. **Work hours schedule** — power user feature, significant impact
