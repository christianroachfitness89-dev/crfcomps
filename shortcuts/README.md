# CRF Comps SMS Sender — Apple Shortcuts

This shortcut sends SMS/iMessage messages from a queue you create in the CRF Comps admin panel. It uses your existing Apple Messages account, so there is no per-message cost and no SMS-provider subscription.

## How it works

1. In CRF Comps, open a lead pool (Giveaway, New Member, Non-Attendance or Birthday).
2. Open the **Bulk SMS** panel, choose or type a message template, pick **Selected leads only** or **All currently filtered leads**, then click **Send via Shortcuts**.
3. Copy the 7-character queue code shown.
4. Run the **CRF Comps SMS Sender** shortcut on your iPhone or Mac, paste the code, and tap Run.
5. The shortcut fetches the queue, sends each message automatically, and reports back to CRF Comps so each lead is marked `sms_sent` and logged.

## Install the shortcut

### Option A — import the `.wflow` file (experimental)

Modern Shortcuts uses a signed `.shortcut` format; the old `.wflow` import may or may not work depending on your macOS/iOS version.

1. Try double-clicking `CRF_Comps_SMS_Sender.wflow` on your Mac.
2. If Shortcuts refuses it, use **Option B** below to build the shortcut manually — it takes about 2 minutes and is the most reliable method.

### Option B — build it manually on iPhone/iPad

1. Create a new shortcut named **CRF Comps SMS Sender**.
2. Add these actions in order:

   **Ask for Text**  
   - Prompt: `Enter CRF Comps queue code`
   - Save to variable: `QueueID`

   **URL**  
   - URL: `https://crfcompsf2f-one.vercel.app/api/sms-queue?id=QueueID`
   - Or use your deployment URL

   **Get Contents of URL**  
   - Method: GET

   **Get Dictionary from Input**

   **Get Value for Key**  
   - Key: `items`
   - Save to variable: `Items`

   **Repeat with Each** (`Items`)
   - Inside the repeat:
     - **Get Value for Key** → Key `phone` → variable `Phone`
     - **Get Value for Key** → Key `message` → variable `Message`
     - **Get Value for Key** → Key `lead_id` → variable `LeadID`
     - **Send Message** → Recipients: `Phone`, Message: `Message`
     - **URL** → `https://crfcompsf2f-one.vercel.app/api/sms-queue?id=QueueID`
     - **Get Contents of URL** → Method: PATCH, Request Body: JSON  
       ```json
       { "lead_id": "LeadID", "status": "sent" }
       ```

3. Save the shortcut.

## Run it

- On iPhone: open Shortcuts, tap **CRF Comps SMS Sender**, paste the queue code, tap Run.
- On Mac: run the shortcut from the Shortcuts app or assign a keyboard shortcut.

The shortcut stops automatically when every message in the queue is sent or failed. You can stop it early by force-quitting Shortcuts.

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
