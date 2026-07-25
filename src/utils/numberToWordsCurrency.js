const units = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
];

const teens = [
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
];

const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
];

const currencyConfigs = {
    INR: { scales: ["", "Thousand", "Lakh", "Crore"], suffix: "Rupees" },
    USD: { scales: ["", "Thousand", "Million", "Billion"], suffix: "Dollars" },
    EUR: { scales: ["", "Thousand", "Million", "Billion"], suffix: "Euros" },
    GBP: { scales: ["", "Thousand", "Million", "Billion"], suffix: "Pounds" },
    JPY: { scales: ["", "Thousand", "Million", "Billion"], suffix: "Yen" },
};

const numberToWords = (n) => {
    if (n === 0) return "";

    let word = "";
    const hundreds = Math.floor(n / 100);
    const remainder = n % 100;

    if (hundreds > 0) {
        word += units[hundreds] + " Hundred ";
    }

    if (remainder >= 10 && remainder < 20) {
        word += teens[remainder - 10];
    } else {
        const tensValue = Math.floor(remainder / 10);
        const unitsValue = remainder % 10;

        if (tensValue > 0) {
            word += tens[tensValue] + " ";
        }
        if (unitsValue > 0) {
            word += units[unitsValue];
        }
    }

    return word.trim();
};

const splitNumber = (n, isIndian) => {
    const parts = [];

    if (isIndian) {
        parts.push(n % 1000);
        n = Math.floor(n / 1000);

        while (n > 0) {
            parts.push(n % 100);
            n = Math.floor(n / 100);
        }
    } else {
        while (n > 0) {
            parts.push(n % 1000);
            n = Math.floor(n / 1000);
        }
    }

    return parts;
};

export const numberToWordsCurrency = (
    num,
    currency,
) => {
    if (num === 0) return `Zero ${currencyConfigs[currency].suffix} Only`;

    const { scales, suffix } = currencyConfigs[currency];
    const isIndian = currency === "INR";

    const rupees = Math.floor(num);
    const paise = Math.round((num - rupees) * 100);

    const chunks = splitNumber(rupees, isIndian);

    let words = "";

    for (let i = chunks.length - 1; i >= 0; i--) {
        const chunk = chunks[i];
        if (chunk !== 0) {
            words += numberToWords(chunk) + (scales[i] ? " " + scales[i] : "") + " ";
        }
    }

    let finalWords = words.trim() + ` ${suffix} Only`;

    if (paise > 0) {
        finalWords += ` and ${numberToWords(paise)} ${currency === "INR" ? "Paise" : "Cents"}`;
    }

    return finalWords.trim();
};
