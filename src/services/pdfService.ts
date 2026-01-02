const pdfParse = require("pdf-parse");

// Simple wrapper for pdf text extraction
export class PdfService {
    /**
     * Extract text from a base64 encoded PDF
     * @param base64Pdf - Base64 encoded PDF string
     * @returns Extracted text from the PDF
     */
    static async extractTextFromPdf(base64Pdf: string): Promise<string> {
        try {
            console.log('📄 Starting PDF extraction...');
            console.log('   - Input length:', base64Pdf.length);

            // Remove data URL prefix if present (e.g., "data:application/pdf;base64,")
            const base64Data = base64Pdf.includes(',')
                ? base64Pdf.split(',')[1]
                : base64Pdf;

            console.log('   - Base64 data length after cleanup:', base64Data.length);

            // Convert base64 to buffer
            const pdfBuffer = Buffer.from(base64Data, 'base64');
            console.log('   - Buffer size:', pdfBuffer.length, 'bytes');

            // Check if buffer looks like a PDF
            const header = pdfBuffer.toString('utf8', 0, 5);
            console.log('   - File header:', header);

            if (!header.startsWith('%PDF')) {
                throw new Error('Invalid PDF format - header does not start with %PDF');
            }

            console.log('   - Extracting text using pdf-parse...');

            // Debug pdf-parse structure to fix import issue
            console.log('   - pdf-parse structure keys:', Object.keys(pdfParse));

            // Try to find the function
            let parser = pdfParse;
            if (typeof parser !== 'function') {
                if (parser.default && typeof parser.default === 'function') {
                    parser = parser.default;
                } else if (parser.PDFParse) {
                    console.log('   - Found pdfParse.PDFParse export, using it.');
                    parser = parser.PDFParse;
                } else {
                    console.log('   - pdf-parse is not a function and has no default export.');
                    // Fallback: try to find ANYTHING that looks like a function or just throw with more info
                    // Some versions might export a class or a named function?
                    // CommonCommonJS pattern: module.exports = function... 
                    // If it is an object, maybe it's { pdfParse: [Function] }?
                }
            }

            // Final check
            if (typeof parser !== 'function' && typeof parser !== 'object') { // loose check to allow class
                throw new Error(`pdf-parse library resolution failed. Type: ${typeof pdfParse}, Keys: ${Object.keys(pdfParse).join(', ')}`);
            }

            let data;
            try {
                // Try calling as function (standard lib)
                data = await parser(pdfBuffer);
            } catch (err: any) {
                console.log('   - Function call failed, trying new instance...');
                // Fallback for some variants: new Parser(buffer)
                if (err.message && err.message.includes("constructor")) {
                    // If it's a class
                    new parser(pdfBuffer);
                    // Assume it has a parse method or similar? 
                    // Standard pdf-parse returns a promise.
                    // If this is a weird lib, we might need to inspect it.
                    // But let's hope it's just the function wrapped in a property.
                    throw err;
                }
                throw err;
            }

            const extractedText = data.text;


            console.log('   - Extraction complete');

            // Log only first two lines as requested
            const lines = extractedText.split('\n').slice(0, 2);
            console.log('   - Scanned Text Prefix (Raw):', lines.join('\n'));

            const finalCleanedText = PdfService.cleanText(extractedText);
            console.log('   - CleanText length:', finalCleanedText.length);

            return finalCleanedText;
        } catch (error: any) {
            console.error('❌ PDF extraction error details:', error.message);
            throw new Error(`Failed to process PDF: ${error.message}`);
        }
    }

    /**
     * Cleans extracted PDF text by removing page numbers, headers, and excessive whitespace.
     */
    private static cleanText(text: string): string {
        if (!text) return "";

        // 1. Remove Page Numbers (standalone numbers on a line)
        // Matches: "1", " 1 ", "Page 1", "Page 1 of 10", "1 of 10"
        let cleaned = text.replace(/^\s*(Page\s*)?\d+(\s*of\s*\d+)?\s*$/gim, '');

        // 2. Remove common separators (---, ***, etc)
        cleaned = cleaned.replace(/^\s*[-*_•=]{3,}\s*$/gm, '');

        // 3. Remove Copyright lines (basic)
        cleaned = cleaned.replace(/^Copyright\s*©?.*$/gim, '');

        // 4. Collapse multiple spaces/tabs to single space
        cleaned = cleaned.replace(/[ \t]+/g, ' ');

        // 5. Collapse multiple newlines to double newline (preserve paragraph structure)
        cleaned = cleaned.replace(/\n\s*\n+/g, '\n\n');

        return cleaned.trim();
    }


    /**
     * Validate if the base64 string is a valid PDF
     * @param base64String - Base64 encoded string
     * @returns true if valid PDF, false otherwise
     */
    static isValidPdf(base64String: string): boolean {
        try {
            const base64Data = base64String.includes(',')
                ? base64String.split(',')[1]
                : base64String;

            const buffer = Buffer.from(base64Data, 'base64');

            // Check PDF magic number (starts with %PDF)
            const header = buffer.toString('utf8', 0, 4);
            return header === '%PDF';
        } catch {
            return false;
        }
    }
}
