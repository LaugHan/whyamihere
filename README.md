# Why Am I Here? / 我咋在这？

A Chrome extension that interrupts unconscious scrolling by asking one question:

> Why did I open this site?

After you stay on a monitored domain for a configurable period, the extension shows a small overlay. You must write your purpose before continuing, then choose how long to snooze the reminder. The goal is not to block websites completely. The goal is to restore intention at the moment attention starts drifting.

## Why This Exists

The project is based on a simple observation: many productivity systems fail because the user never takes the first step. For distracting websites, the first step is often just noticing that you are there.

This extension creates that noticing moment:

- Detects when you spend time on high-distraction domains.
- Prompts you to write the reason you opened the site.
- Saves a local history of those reasons.
- Lets you snooze a domain after you have made the choice explicit.

All data is stored locally through Chrome storage. There is no backend.

## Current Features

- Default monitored sites: Zhihu, Xiaohongshu, Weibo, Bilibili, Douban, Tieba, Douyin.
- Add or remove monitored domains from the popup.
- Per-tab timer that only runs on the active tab.
- Shadow DOM overlay to avoid page CSS conflicts.
- Configurable timer and minimum-purpose text before submit.
- Snooze presets and custom snooze duration.
- Local history page with domain filtering and deletion.
- Unit tests for core behavior plus syntax checks for extension scripts.

## Install Locally

1. Open Chrome and go to `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder:

```text
why-am-i-here
```

## Test

Run from the repository root:

```bash
node why-am-i-here/tests/run-tests.js
```

The test runner validates both core logic and JavaScript syntax for the actual extension scripts.

## Hackathon Demo Flow

Use the demo as a short story, not a feature tour.

1. Start with the problem:
   "I don't want another todo app. I want a tool for the exact moment I realize I opened Xiaohongshu or Bilibili without knowing why."

2. Show the normal failure:
   Open a distracting site and say: "This is the moment where most productivity tools are absent."

3. Trigger the extension:
   Use a short test timer if needed, then show the overlay asking for the purpose.

4. Make the interaction concrete:
   Type a bad vague answer first, show that it is not enough, then type a real intention.

5. Show agency instead of blocking:
   Pick a snooze duration and submit. Emphasize that the extension does not ban the site; it forces a conscious decision.

6. Show reflection:
   Open the history page and show the accumulated reasons by domain.

7. Close with the product thesis:
   "The product is not a blocker. It is an intention checkpoint."

## Suggested Pitch

"Why Am I Here? is a Chrome extension for people who do not need more motivation quotes or stricter blockers. When you drift into a distracting site, it asks you to write why you are there before you continue. That tiny interruption converts unconscious browsing into an explicit choice, and the local history shows where your attention actually goes."

## Next Improvements

- Make timer changes reschedule the currently active tab immediately.
- Add a daily summary: most interrupted domain, total checkpoints, and common time windows.
- Add an option to export local history as JSON or CSV.
- Reduce permissions before store submission or clearly explain why broad host access is needed.
