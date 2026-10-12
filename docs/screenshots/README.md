# Demo screenshots: capture checklist

Four screenshots of the real app, captured against the **development** environment (see [`../environments.md`](../environments.md)). Never capture from production or show real diners, receipts, or contact details.

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
| `1-verify.png` | Wizard → Verify item details | The extracted item list (top of the step). Then tap the image icon by the restaurant name to open the receipt photo. Place the two captures side by side in one image and note that it's two screens. |
| `2-assign.png` | Wizard → Assign items, on Mezcal Margarita | The "Who had a 3x Mezcal Margarita?" drawer with **Split by share** selected, showing Priya 2 and Marcus 1. |
| `3-review.png` | Wizard → Review diner totals, on Priya | Priya's items (including her ⅔ share of the margaritas), subtotal, tax + tip share, and total. |
| `4-share.png` | Shared link in a private window | Open the share link, pick **Priya** at "Who are you?", and capture her tab with the **Pay @demo-sam on Venmo** button. |

## After capturing

- Check every image for real names, numbers, emails, or other tabs and notifications. Crop the browser chrome.
- Keep each file under about 400 KB (`pngquant` or macOS Preview export).
- In the root `README.md`, replace the `<!-- SCREENSHOTS … -->` comment with the four image lines it contains.
