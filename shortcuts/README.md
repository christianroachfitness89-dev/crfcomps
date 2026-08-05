# CRF Comps SMS Sender — Apple Shortcuts

This shortcut sends SMS/iMessage messages from a queue you create in the CRF Comps admin panel. It uses your existing Apple Messages account, so there is no per-message cost and no SMS-provider subscription.

> **Note:** Apple no longer allows unsigned `.wflow` files to be imported. The shortcut must be built manually in the Shortcuts app. It takes about 2 minutes and works on iPhone, iPad and Mac.

## How it works

1. In CRF Comps, open a lead pool (Giveaway, New Member, Non-Attendance or Birthday).
2. Open the **Bulk SMS** panel, choose or type a message template, pick **Selected leads only** or **All currently filtered leads**, then click **Send via Shortcuts**.
3. Copy the 7-character queue code shown.
4. Run the **CRF Comps SMS Sender** shortcut on your iPhone or Mac, paste the code, and tap Run.
5. The shortcut fetches the queue, sends each message automatically, and reports back to CRF Comps so each lead is marked `sms_sent` and logged.

## Build the shortcut manually

### Step 1 — create the shortcut

- Open the **Shortcuts** app.
- Tap/click the **+** to create a new shortcut.
- Name it **CRF Comps SMS Sender**.

### Step 2 — ask for the queue code

- Add action: **Ask for Text**
- Prompt: `Enter CRF Comps queue code`
- Tap/click the variable name and rename it to `QueueID`.

### Step 3 — fetch the queue from CRF Comps

- Add action: **URL**
  - URL: `https://crfcompsf2f-one.vercel.app/api/sms-queue?id=QueueID`
  - (The `QueueID` part is the variable from Step 2.)
- Add action: **Get Contents of URL**
  - Method: **GET**
- Add action: **Get Dictionary from Input**
- Add action: **Get Value for Key**
  - Key: `items`
  - Rename the result variable to `Items`.

### Step 4 — loop through each message

- Add action: **Repeat with Each**
  - Choose the `Items` variable.

Inside the repeat loop, add these actions in order:

1. **Get Value for Key**
   - Key: `phone`
   - Rename result to `Phone`
2. **Get Value for Key**
   - Key: `message`
   - Rename result to `Message`
3. **Get Value for Key**
   - Key: `lead_id`
   - Rename result to `LeadID`
4. **Send Message**
   - Recipients: `Phone`
   - Message: `Message`
   - Turn **Show Compose Sheet** OFF so it sends automatically.
5. **URL**
   - URL: `https://crfcompsf2f-one.vercel.app/api/sms-queue?id=QueueID`
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
   - Both `LeadID` strings should be the variable, not plain text.

### Step 5 — save

Save the shortcut. You can add it to your home screen or a keyboard shortcut on Mac for faster access.

## Run it

- On **iPhone/iPad**: open Shortcuts, tap **CRF Comps SMS Sender**, paste the queue code, tap Run.
- On **Mac**: run the shortcut from the Shortcuts app, or set a keyboard shortcut in System Settings.

The shortcut finishes automatically when every queued message is sent or failed. You can stop it early by force-quitting Shortcuts.

## Security

- Each queue code is random, 7 characters long, and expires after 24 hours.
- The shortcut can only send the exact messages and phone numbers you queued in CRF Comps.
- Anyone with the queue code could send those queued messages, so keep the code private until used.

## Troubleshooting

| Problem | Fix |
|---|---|
| Shortcut says "Queue not found" | The queue expired (after 24h) or the code was mistyped. Create a new queue in CRF Comps. |
| Message not marked sent in CRF Comps | Check internet connection; the shortcut needs data/Wi-Fi to call the PATCH endpoint after each send. |
| Messages open but don't send | On iPhone, make sure iMessage/SMS is enabled. On Mac, SMS forwarding must be on if sending to non-iMessage numbers. |
| Want to use a different domain | Edit the URL actions in the shortcut to match your production URL. |
| Mac shows "cannot be opened" | Make sure Shortcuts has permission to run automations. System Settings → Privacy & Security → Automation → Shortcuts. |
