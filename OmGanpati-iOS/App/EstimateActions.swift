import UIKit
import MessageUI

extension CalculatorController: MFMailComposeViewControllerDelegate, MFMessageComposeViewControllerDelegate, UIDocumentPickerDelegate {
    func presentEstimate(_ body: [String: Any], reply: @escaping (Any?, String?) -> Void) {
        guard presentedViewController == nil, let action = body["action"] as? String else {
            reply(nil, "Close the current sheet first."); return
        }
        if action == "sms" {
            guard MFMessageComposeViewController.canSendText(), let text = body["text"] as? String else {
                reply(nil, "SMS is unavailable on this device."); return
            }
            let composer = MFMessageComposeViewController()
            composer.messageComposeDelegate = self
            composer.body = text
            present(composer, animated: true) { reply("", nil) }
            return
        }
        guard let quote = preparedQuote, body["token"] as? String == quote.token, let filename = body["filename"] as? String,
              filename == (filename as NSString).lastPathComponent, filename.hasSuffix(".pdf") else {
            reply(nil, "Please generate the quotation PDF again."); return
        }
        let pdf = quote.pdf
        if action == "print" {
            guard UIPrintInteractionController.isPrintingAvailable else {
                reply(nil, "Printing is unavailable on this device."); return
            }
            let printer = UIPrintInteractionController.shared
            let info = UIPrintInfo(dictionary: nil)
            info.jobName = filename
            info.outputType = .general
            printer.printInfo = info
            printer.printingItem = pdf
            let completion: (UIPrintInteractionController, Bool, Error?) -> Void = { _, _, error in
                reply(error == nil ? "" : nil, error?.localizedDescription)
            }
            if traitCollection.userInterfaceIdiom == .pad {
                printer.present(from: anchorRect, in: view, animated: true, completionHandler: completion)
            } else {
                printer.present(animated: true, completionHandler: completion)
            }
            return
        }
        if action == "email", MFMailComposeViewController.canSendMail() {
            let composer = MFMailComposeViewController()
            composer.mailComposeDelegate = self
            composer.setSubject("Om Ganpati Jewellers · Estimate Price Quotation")
            composer.addAttachmentData(pdf, mimeType: "application/pdf", fileName: filename)
            present(composer, animated: true) { reply("", nil) }
            return
        }
        guard ["whatsapp", "email", "save"].contains(action) else { reply(nil, "Unknown action."); return }
        do {
            let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let file = folder.appendingPathComponent(filename)
            try pdf.write(to: file, options: .atomic)
            if action == "save" {
                estimateExportFolder = folder
                let picker = UIDocumentPickerViewController(forExporting: [file], asCopy: true)
                picker.delegate = self
                present(picker, animated: true) { reply("", nil) }
            } else {
                let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
                sheet.popoverPresentationController?.sourceView = view
                sheet.popoverPresentationController?.sourceRect = anchorRect
                sheet.completionWithItemsHandler = { _, _, _, _ in try? FileManager.default.removeItem(at: folder) }
                present(sheet, animated: true) { reply("", nil) }
            }
        } catch { reply(nil, error.localizedDescription) }
    }
    private var anchorRect: CGRect {
        CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
    }
    func mailComposeController(_ controller: MFMailComposeViewController, didFinishWith result: MFMailComposeResult, error: Error?) {
        controller.dismiss(animated: true)
    }
    func messageComposeViewController(_ controller: MFMessageComposeViewController, didFinishWith result: MessageComposeResult) {
        controller.dismiss(animated: true)
    }
    private func cleanExport() {
        if let folder = estimateExportFolder { try? FileManager.default.removeItem(at: folder) }
        estimateExportFolder = nil
    }
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { cleanExport() }
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { cleanExport() }
}

extension CalculatorController {
    func quotationPDF(_ input: Any?) -> Data? {
        guard let quote = input as? [String: Any], let name = quote["name"] as? String,
              let date = quote["date"] as? String, let rows = quote["rows"] as? [[String]],
              rows.count >= 3, rows.allSatisfy({ $0.count == 2 }),
              let notes = quote["disclaimer"] as? [String] else { return nil }
        let page = CGRect(x: 0, y: 0, width: 420, height: 595)
        let plum = UIColor(red: 0.2, green: 0.15, blue: 0.26, alpha: 1)
        let gold = UIColor(red: 0.83, green: 0.69, blue: 0.45, alpha: 1)
        let dark = UIColor.black
        func draw(_ text: String, _ rect: CGRect, _ size: CGFloat, _ color: UIColor, bold: Bool = false, right: Bool = false) {
            let style = NSMutableParagraphStyle()
            style.alignment = right ? .right : .left
            let font = bold ? UIFont.boldSystemFont(ofSize: size) : UIFont.systemFont(ofSize: size)
            (text as NSString).draw(in: rect, withAttributes: [.font: font, .foregroundColor: color, .paragraphStyle: style])
        }
        let details = Array(rows.dropLast(3))
        let pages = max(1, (details.count + 8) / 9)
        return UIGraphicsPDFRenderer(bounds: page).pdfData { renderer in
            for i in 0..<pages {
                renderer.beginPage()
                let ctx = renderer.cgContext
                ctx.setFillColor(plum.cgColor); ctx.fill(CGRect(x:0,y:0,width:420,height:80))
                ctx.setFillColor(gold.cgColor); ctx.fill(CGRect(x:0,y:78,width:420,height:2))
                draw("Om Ganpati Jewellers", CGRect(x:26,y:16,width:370,height:36), 24, .white, bold:true)
                draw("SUNAM  ·  PUNJAB", CGRect(x:27,y:52,width:366,height:18), 10, gold)
                draw("Estimate Price Quotation", CGRect(x:26,y:96,width:210,height:20), 13, plum, bold:true)
                draw(date, CGRect(x:234,y:97,width:160,height:20), 10, dark, right:true)
                draw(name, CGRect(x:26,y:124,width:368,height:30), 18, dark, bold:true)
                let first = i*9
                var y: CGFloat = 166
                for row in details.dropFirst(first).prefix(9) {
                    draw(row[0], CGRect(x:26,y:y,width:142,height:30), 10, dark)
                    draw(row[1], CGRect(x:174,y:y,width:220,height:30), 10, dark, right:true)
                    y += 30
                }
                if i == pages-1 {
                    for row in rows.suffix(3).dropLast() {
                        draw(row[0], CGRect(x:26,y:y,width:178,height:21), 11, dark)
                        draw(row[1], CGRect(x:210,y:y,width:184,height:21), 11, dark, right:true)
                        y += 21
                    }
                    let total = rows[rows.count-1]
                    ctx.setFillColor(plum.cgColor); ctx.fill(CGRect(x:22,y:y,width:376,height:31))
                    draw(total[0], CGRect(x:29,y:y+7,width:207,height:22), 12, .white, bold:true)
                    draw(total[1], CGRect(x:236,y:y+6,width:154,height:24), 13, .white, bold:true,right:true)
                }
                draw(notes.joined(separator:"\n"), CGRect(x:26,y:532,width:368,height:38), 10, dark)
                draw("\(i+1) / \(pages)", CGRect(x:326,y:571,width:68,height:15), 9, plum, right:true)
            }
        }
    }
}
