import pdfParse from "pdf-parse";

// Simple wrapper for pdf text extraction
export class PdfService {
    /**
     * Validate if the string is a valid PDF (Base64 or URL)
     * @param input - Base64 encoded string or URL
     * @returns true if valid PDF, false otherwise
     */
    static isValidPdf(input: string): boolean {
        if (!input) return false;

        // Check if URL
        // Strict enforcement: Must be an HTTP/HTTPS URL
        if (input.startsWith('http://') || input.startsWith('https://')) {
            // Basic check if it likely points to a file or S3 bucket
            return input.includes('.pdf') || input.includes('amazonaws.com') || input.includes('waytree');
        }

        return false;
    }

    /**
     * Helper to get buffer from URL
     */
    private static async getPdfBuffer(input: string): Promise<Buffer> {
        if (input.startsWith('http')) {
            console.log('   - Fetching PDF from URL...');
            const response = await fetch(input);
            if (!response.ok) throw new Error(`Failed to fetch PDF from URL: ${response.statusText}`);
            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
        } else {
            throw new Error('Invalid input: Base64 is no longer supported. Please provide a valid S3 URL.');
        }
    }

    /**
     * Extract text from a base64 encoded PDF or URL
     * @param pdfInput - Base64 encoded PDF string or URL
     * @returns Extracted text from the PDF
     */
    static async extractTextFromPdf(pdfInput: string): Promise<string> {
        try {
            console.log('📄 Starting PDF extraction...');

            // Get buffer (handle URL vs Base64)
            const pdfBuffer = await this.getPdfBuffer(pdfInput);
            console.log('   - Buffer size:', pdfBuffer.length, 'bytes');

            // Check if buffer looks like a PDF
            const header = pdfBuffer.toString('utf8', 0, 5);
            if (!header.startsWith('%PDF')) {
                throw new Error('Invalid PDF format - header does not start with %PDF');
            }

            console.log('   - Extracting text using pdf-parse...');
            let parser = pdfParse;
            // ... (keep existing resolution logic if needed, or simplify if environment is stable)
            // Assuming environment is stable now, but safer to keep:
            if (typeof parser !== 'function') {
                if (parser.default && typeof parser.default === 'function') parser = parser.default;
                else if (parser.PDFParse) parser = parser.PDFParse;
            }

            const data = await parser(pdfBuffer);
            const extractedText = data.text;
            console.log('   - Extraction complete');

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
}
