# Demo screenshots: capture checklist

Captured on 2026-10-13 against the development database. `1-verify.png` combines two captures of the same step (item list, then the receipt photo). Repeat this checklist to refresh them.

Four screenshots of the real app (two organizer screens, two guest screens), captured against the **development** environment (see [`../environments.md`](../environments.md)). Never capture from production or show real diners, receipts, or contact details.

## Demo data

- **Receipt:** [`demo-receipt.png`](demo-receipt.png), a fictional restaurant with a `555-010` number. Items total exactly $179.00 (tax $15.77), so the bill reconciles. It includes a `3 Mezcal Margarita` line for the unequal split.
- **Organizer account:** a new dev account, e.g. `demo-organizer@example.com`.
- **Diners:** Priya, Marcus, Elena, Sam. If a phone is needed, use `(555) 010-01xx`. Sam is the payer, with Venmo handle `demo-sam` (fictional).
- **Viewport:** browser device mode at **390 × 844**. Hide bookmarks and extensions and use light mode for all four.

## Run-through

1. Sign in to the dev deployment (Preview, or `npm run dev` pointed at the dev database) and start a new receipt.
2. **Scan:** upload `demo-receipt.png` and scan.
3. **Format:** choose *Mixed Bag*.
4. **Diners:** add Priya, Marcus, Elena, and Sam.
5. **Assign:**
   - Shishitos and Burrata: everyone.
   - Stew: Priya. Tacos: Marcus. Risotto: Elena. Trout: Sam.
   - Mezcal Margarita: *Split by share*, Priya 2, Marcus 1.
   - Sparkling Water: Elena and Sam. Churros: everyone.
6. **Tip:** 20%. **Who paid:** Sam, with Venmo `demo-sam`.

## The four shots (save as PNG here)

| File | Screen | Capture |
|---|---|---|
| `1-verify.png` | **Organizer:** Wizard → Verify item details | The extracted item list (top of the step). Then tap the image icon by the restaurant name to open the receipt photo. Place the two captures side by side in one image and note that it's two screens. |
| `2-assign.png` | **Organizer:** Wizard → Assign items, on Mezcal Margarita | The "Who had a 3x Mezcal Margarita?" drawer with **Split by share** selected, showing Priya 2 and Marcus 1. |
| `3-guest-name.png` | **Guest:** shared link in a private window | The "Who are you?" picker listing Priya, Marcus, Elena, and Sam, plus "Just browsing". |
| `4-guest-tab.png` | **Guest:** Priya's tab | After picking **Priya**: her items (including her ⅔ share of the margaritas), tax and tip share, total, and the **Pay @demo-sam on Venmo** button. Use a full-page capture at 390 px wide if it doesn't fit on one screen. |

## After capturing

- Check every image for real names, numbers, emails, or other tabs and notifications. Crop the browser chrome.
- Keep each file under about 400 KB (`pngquant` or macOS Preview export).
- The root `README.md` embeds these four files in flow order.
