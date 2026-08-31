// Contact address label — a fixed courier-label-shaped port of
// ContactAddressPrintView1.tsx's layout (~150x105mm sheet). Same pattern as
// shippingLabelTemplate.js: built on the real textField primitive from
// buildTemplate.js, not a second copy of pdfme's defaultSchema.
import { textField } from "./buildTemplate.js";

const PAGE = { width: 150, height: 105 };

export function buildContactAddressTemplate() {
  return {
    basePdf: { width: PAGE.width, height: PAGE.height, padding: [5, 5, 5, 5] },
    schemas: [
      [
        textField({
          name: "toLabel",
          position: { x: 5, y: 5 },
          width: 60,
          height: 6,
          fontSize: 13,
          fontName: "Poppins Bold",
          content: "TO",
          readOnly: true,
        }),
        textField({
          name: "toLocationLine",
          position: { x: 5, y: 12 },
          width: 140,
          height: 6,
          fontSize: 11,
          fontName: "Poppins Bold",
          content: "Area, City, State, Country - Pincode",
          visibilityCondition: { mode: "hideIfEmpty" },
        }),
        textField({
          name: "toCompanyName",
          position: { x: 5, y: 19 },
          width: 140,
          height: 5,
          fontSize: 9,
          content: "Company: Sample Co.",
          visibilityCondition: { mode: "hideIfEmpty" },
        }),
        textField({
          name: "toName",
          position: { x: 5, y: 24 },
          width: 140,
          height: 5,
          fontSize: 9,
          content: "Name: John Doe",
          visibilityCondition: { mode: "hideIfEmpty" },
        }),
        textField({
          name: "toPhone",
          position: { x: 5, y: 29 },
          width: 140,
          height: 5,
          fontSize: 9,
          content: "Contact No.: 9876543210",
          visibilityCondition: { mode: "hideIfEmpty" },
        }),
        textField({
          name: "toEmail",
          position: { x: 5, y: 34 },
          width: 140,
          height: 5,
          fontSize: 9,
          content: "Email: sample@example.com",
          visibilityCondition: { mode: "hideIfEmpty" },
        }),
        textField({
          name: "toAddress",
          position: { x: 5, y: 40 },
          width: 140,
          height: 12,
          fontSize: 9,
          lineHeight: 1.3,
          content: "Address: 123 Sample Street",
          visibilityCondition: { mode: "hideIfEmpty" },
        }),

        // <hr> divider — same hairline-rectangle trick shippingLabelTemplate.js uses.
        textField({
          name: "divider",
          position: { x: 5, y: 54 },
          width: 140,
          height: 0.3,
          backgroundColor: "#000000",
          content: "",
          readOnly: true,
        }),

        textField({
          name: "fromLabel",
          position: { x: 5, y: 58 },
          width: 60,
          height: 6,
          fontSize: 13,
          fontName: "Poppins Bold",
          content: "FROM",
          readOnly: true,
        }),
        textField({
          name: "fromLocationLine",
          position: { x: 5, y: 65 },
          width: 140,
          height: 6,
          fontSize: 11,
          fontName: "Poppins Bold",
          content: "City, State",
          visibilityCondition: { mode: "hideIfEmpty" },
        }),
        textField({
          name: "fromCompanyName",
          position: { x: 5, y: 72 },
          width: 140,
          height: 5,
          fontSize: 9,
          content: "Company: Your Company",
          visibilityCondition: { mode: "hideIfEmpty" },
        }),
        textField({
          name: "fromPhone",
          position: { x: 5, y: 77 },
          width: 140,
          height: 5,
          fontSize: 9,
          content: "Contact No.: 9876543210",
          visibilityCondition: { mode: "hideIfEmpty" },
        }),
        textField({
          name: "fromEmail",
          position: { x: 5, y: 82 },
          width: 140,
          height: 5,
          fontSize: 9,
          content: "Email: sample@example.com",
          visibilityCondition: { mode: "hideIfEmpty" },
        }),
        textField({
          name: "fromAddress",
          position: { x: 5, y: 87 },
          width: 140,
          height: 12,
          fontSize: 9,
          lineHeight: 1.3,
          content: "Address: 456 Company Street",
          visibilityCondition: { mode: "hideIfEmpty" },
        }),
      ],
    ],
  };
}
