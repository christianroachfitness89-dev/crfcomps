# CRF Comps SMS Sender

Send queued SMS/iMessage follow-ups from CRF Comps using your Mac Messages app. There is no per-message cost and no SMS-provider subscription.

> **Two options:** use the Mac script (recommended, easiest) or build the Apple Shortcuts version manually.

## How it works

1. In CRF Comps, open a lead pool (Giveaway, New Member, Non-Attendance or Birthday).
2. Open the **Bulk SMS** panel, choose or type a message template, pick **Selected leads only** or **All currently filtered leads**, then click **Send via Shortcuts / Mac Script**.
3. Copy the 7-character queue code shown.
4. Run the Mac script or Shortcuts shortcut, paste the code, and confirm.
5. The tool fetches the queue, sends each message automatically, and reports back to CRF Comps so each lead is marked `sms_sent` and logged.

---

## Option A — Mac script (recommended)

This is the easiest way and avoids Apple Shortcuts entirely. It runs in Terminal and uses the Messages app on your Mac. SMS messages route through your iPhone if **SMS forwarding** is enabled in Messages settings.

### Requirements

- macOS
- Node.js installed (run `node --version` in Terminal to check; install from nodejs.org if missing)
- Messages app signed in with iMessage
- SMS forwarding enabled if you want to send SMS (green bubbles) — System Settings → Messages → Text Message Forwarding

### First-time setup

1. Download `send-sms-queue.js` and `send-sms-queue.command` from this folder.
2. Place them in the same folder (e.g. your Desktop or Documents).
3. Double-click `send-sms-queue.command`.
4. macOS may warn you that it was downloaded from the internet. Right-click the file and choose **Open** to allow it.
5. Terminal opens and asks for a queue code.

### Run it

1. In CRF Comps, click **Send via Shortcuts / Mac Script** and copy the queue code.
2. Double-click `send-sms-queue.command`.
3. Paste the queue code and press Enter.
4. Confirm when it asks `Send N messages now? (y/n)`.
5. The script sends each message and prints progress. When done, refresh CRF Comps to see `sms_sent` statuses.

### Troubleshooting the Mac script

| Problem | Fix |
|---|---|
| `command not found: node` | Install Node.js from https://nodejs.org |
| `Could not fetch queue` | Check your internet connection or queue code. Codes expire after 24 hours. |
| Message sends but status isn't updated | The script needs internet to call the PATCH endpoint after sending. Try again. |
| Script can't send SMS (green bubble) | Enable SMS forwarding on your iPhone: Settings → Messages → Text Message Forwarding → turn on your Mac. |
| macOS says file is damaged | Right-click → Open, or run `xattr -cr send-sms-queue.command` in Terminal. |

---

## Option B — Apple Shortcuts (manual build)

Use this if you prefer to run from your iPhone/iPad without a Mac.

> **Note:** Apple no longer allows unsigned `.wflow` files to be imported, so the shortcut must be built manually in the Shortcuts app. The tricky part is linking the `QueueID` variable into the URL actions.

### Step 1 — create the shortcut

- Open the **Shortcuts** app.
- Tap/click the **+** to create a new shortcut.
- Name it **CRF Comps SMS Sender**.

### Step 2 — ask for the queue code

- Add action: **Ask for Text**
- Prompt: `Enter CRF Comps queue code`
- Long-press the result pill, rename it to `QueueID`.

### Step 3 — fetch the queue from CRF Comps

- Add action: **URL**
- In the URL field, type: `https://crfcompsf2f-one.vercel.app/api/sms-queue?id=`
- Then tap the URL field, choose **Select Variable**, and pick `QueueID`.
- Add action: **Get Contents of URL** → Method: **GET**
- Add action: **Get Dictionary from Input**
- Add action: **Get Value for Key** → Key: `items`, rename result to `Items`.

### Step 4 — loop through each message

- Add action: **Repeat with Each** → choose `Items`.

Inside the repeat loop, add these actions in order:

1. **Get Value for Key** → Key: `phone`, rename to `Phone`
2. **Get Value for Key** → Key: `message`, rename to `Message`
3. **Get Value for Key** → Key: `lead_id`, rename to `LeadID`
4. **Send Message**
   - Recipients: `Phone`
   - Message: `Message`
   - Turn **Show Compose Sheet** OFF.
5. **URL** → `https://crfcompsf2f-one.vercel.app/api/sms-queue?id=QueueID` (use the variable)
6. **Get Contents of URL**
   - Method: **PATCH**
   - Request Body: **JSON**
   - JSON content:
     ```json
     {
       "lead_id": "LeadID",
       "status": "sent"
     }
     ```
   - The `"LeadID"` value should be the `LeadID` variable, not plain text.

### Step 5 — save and run

Save the shortcut. In CRF Comps, copy a queue code, then open Shortcuts and run **CRF Comps SMS Sender**.

---

## Security

- Each queue code is random, 7 characters long, and expires after 24 hours.
- The tool can only send the exact messages and phone numbers you queued in CRF Comps.
- Anyone with the queue code could send those queued messages, so keep the code private until used.

---

## Want an even simpler option?

If Mac-only or Shortcuts are still too painful, the next step is a paid SMS provider (ClickSend, MessageMedia, Twilio, Burst SMS). These cost ~AUD $0.05–$0.10 per SMS and work fully automatically from CRF Comps with no Shortcuts or Mac required. Let me know if you want that built in.
