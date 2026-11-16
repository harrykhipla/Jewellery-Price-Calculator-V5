# Om Ganpati Jewellers — iPhone & iPad source package

Gold and silver calculator with purity-specific rates, manual embellishment entries, net weight deductions, QR scanning, HUID photo entry and custom tag printing. Calculations and label generation work from bundled files. Native CoreBluetooth replaces the browser Bluetooth API; Bluefy is not required.

## Install using a Mac
1. Install Xcode from Apple's Mac App Store. Open it once to finish setup.
2. Double-click OmGanpati.xcodeproj in the extracted folder.
3. Select the OmGanpati target → Signing & Capabilities → select your Apple team. Change the bundle identifier if needed.
4. Connect your iPhone, select it as the run destination and press Run. Complete any device trust / Developer Mode prompts on the phone.
5. Enter an item name, open Create tag, set the custom template dimensions to match the sticker and use Find printer to select POSIFLOW. Close other printer apps first. Print the small OK test, confirm its appearance, then test one tag and scan its QR.

## Verification and limitations
This is source code, not a signed IPA or App Store/TestFlight release. The Linux build environment has no Apple SDK or Xcode, so the Swift target has NOT been compiled or run on an iPhone. Native Bluetooth requires hardware testing. Do not treat completed BLE writes as confirmation of a physical print. No automatic print retry is implemented.

HUID photo import and manual entry remain available; BIS verification is not included. Print tag sends the custom label to the connected POSIFLOW over Bluetooth. AirPrint opens the iOS print sheet for other compatible printers. Test photo import and the local OCR worker on a device before operational use. No cloud sync or automatic download of website updates is included. Future app updates must replace the bundled Web folder and retain the native Bluetooth adapter.

This project requires app icons, signing, device QA, privacy review and distribution configuration before App Store submission. No Apple credentials are included. Local data stays on the device; no analytics or remote account is added.

## Price checks and quotations
Scan a tag opens the calculator result after one valid scan. Bulk Scan keeps the native camera running and shows read-only details beneath it, including price before GST. Tap Done to exit.

For a customer quotation, enter or scan the item in the calculator and tap Quote Estimate below the breakdown. The app generates the A5 PDF on the device. Print PDF opens the system print interface. Save PDF opens Files. WhatsApp PDF opens the share sheet, and Email PDF opens Mail with the PDF attached or the share sheet if Mail is unavailable. SMS opens a plain-text draft. Check each action on the intended iPhone before shop use.

## Custom tag templates
Create tag opens the custom template editor at 58 × 15 mm. Enter the width across the design and its height in millimetres. Tap a printed element or select it from the list. Choose Whole element or a letter; letter X/Y are offsets from its position in the line. Nudge with arrows or enter coordinates and size directly. Rulers and selection outlines only appear in the editor. Save presets by name and load them for other pieces. Tags longer than 58 mm are rotated in the feed direction. Test the result on one sticker.

Quotations use the native iOS PDF renderer and share one PDF with AirPrint, Mail, Files and the activity sheet. Select WhatsApp in the sheet. SMS uses plain text.
