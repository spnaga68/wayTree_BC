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
            let parserLib: any = pdfParse;

            // Strategy 1: Standard v1 Function
            if (typeof parserLib === 'function') {
                const data = await parserLib(pdfBuffer);
                const extractingText = data.text;
                // Normalize return to match expected flow
                return PdfService.cleanText(extractingText);
            }

            // Strategy 2: v2 Class (PDFParse property)
            if (parserLib.PDFParse && typeof parserLib.PDFParse === 'function') {
                const dataBytes = new Uint8Array(pdfBuffer);

                try {
                    console.log('   - [RESOLVE] Found PDFParse class. Attempting v2 class-based extraction.');
                    // Strategy A: Instantiate -> Load with data object
                    const parser = new parserLib.PDFParse({ verbosity: 0 });
                    await parser.load({ data: dataBytes });

                    const text = await parser.getText();
                    const rawText = (typeof text === 'string') ? text : (text.text || "");
                    return PdfService.cleanText(rawText);
                } catch (classErr: any) {
                    console.error("   - [WARN] Class Strategy A (load) failed:", classErr.message);

                    // Fallback Strategy B: Constructor Data directly
                    try {
                        const parser = new parserLib.PDFParse(dataBytes);
                        if (typeof parser.getText === 'function') {
                            const text = await parser.getText();
                            const rawText = (typeof text === 'string') ? text : (text.text || "");
                            return PdfService.cleanText(rawText);
                        }
                        throw new Error("Constructor accepted data but no getText method found.");
                    } catch (classErrB: any) {
                        throw new Error(`All PDFParse class strategies failed. Original error: ${classErr.message}`);
                    }
                }
            }

            // Strategy 3: ESM Default
            if (parserLib.default && typeof parserLib.default === 'function') {
                const data = await parserLib.default(pdfBuffer);
                return PdfService.cleanText(data.text);
            }

            throw new Error(`Unsupported pdf-parse library structure. Keys: ${Object.keys(parserLib).join(', ')}`);

            // Unreachable fallback for flow
            // const data = await parser(pdfBuffer);

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
