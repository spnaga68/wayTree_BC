import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

export class RagPipelineService {
    private static tempDir = path.join(__dirname, '../../temp');
    private static pipelineScript = path.join(__dirname, '../../ai_pipeline/rag_pipeline.py');

    /**
     * Processes multiple URLs using the Python RAG pipeline.
     * Returns a merged array of chunks with embeddings.
     */
    static async processMultiplePdfs(pdfUrls: string[]): Promise<any[]> {
        console.log(`🚀 Starting RAG Pipeline for ${pdfUrls.length} PDFs...`);
        let allChunks: any[] = [];

        for (let i = 0; i < pdfUrls.length; i++) {
            try {
                console.log(`📑 Processing PDF ${i + 1}/${pdfUrls.length}...`);
                const chunks = await this.processEventPdf(pdfUrls[i]);
                // Prefix chunk IDs to avoid collisions
                const prefixedChunks = chunks.map(c => ({
                    ...c,
                    chunkId: `pdf${i}_${c.chunkId}`
                }));
                allChunks = allChunks.concat(prefixedChunks);
            } catch (err) {
                console.error(`❌ Failed to process PDF ${i + 1}:`, err);
            }
        }

        console.log(`✅ Finished RAG Pipeline for all PDFs. Total chunks: ${allChunks.length}`);
        return allChunks;
    }

    /**
     * Processes a Base64 PDF using the Python RAG pipeline.
     * Returns an array of chunks with embeddings.
     */
    static async processEventPdf(pdfInput: string): Promise<any[]> {
        console.log('🚀 Starting RAG Pipeline processing...');

        // Ensure temp directory exists
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }

        const timestamp = Date.now();
        const inputPath = path.join(this.tempDir, `event_${timestamp}.pdf`);
        const outputPath = path.join(this.tempDir, `embeddings_${timestamp}.json`);

        try {
            // 1. Write URL content to file
            console.log(`📄 Writing temporary PDF to: ${inputPath}`);

            if (pdfInput.startsWith('http://') || pdfInput.startsWith('https://')) {
                console.log(`   Downloading PDF from URL: ${pdfInput}`);
                const response = await fetch(pdfInput);
                if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.statusText}`);
                const arrayBuffer = await response.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                // Validate PDF header
                const header = buffer.toString('utf8', 0, 5);
                if (!header.startsWith('%PDF')) {
                    throw new Error('Downloaded file is not a valid PDF (header mismatch)');
                }

                fs.writeFileSync(inputPath, buffer);
            } else {
                throw new Error("Invalid Input: Base64 processing is deprecated. Please provide a valid URL.");
            }

            // 2. Run Python Script
            const command = `python "${this.pipelineScript}" "${inputPath}" "${outputPath}"`;
            console.log(`🐍 Executing Python pipeline: ${command}`);

            const { stdout, stderr } = await execPromise(command);

            if (stdout) console.log(`[Python Output]: ${stdout.substring(0, 200)}...`);

            if (stderr) console.error(`[Python Stderr]: ${stderr}`);

            // 3. Read Output
            if (!fs.existsSync(outputPath)) {
                throw new Error("Pipeline finished but output file was not created.");
            }

            console.log(`📖 Reading embeddings from: ${outputPath}`);
            const rawData = fs.readFileSync(outputPath, 'utf-8');
            const data = JSON.parse(rawData);

            // 4. Map to Schema format
            const chunks = data.map((item: any) => ({
                chunkId: item.id,
                text: item.text,
                embedding: item.embedding
            }));

            console.log(`✅ RAG Pipeline completed. Generated ${chunks.length} chunks.`);
            return chunks;

        } catch (error) {
            console.error("❌ RAG Pipeline failed:", error);
            throw error;
        } finally {
            // 5. Cleanup
            console.log("🧹 Cleaning up temporary files...");
            try {
                if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            } catch (cleanupError) {
                console.error("Warning: Failed to cleanup temp files:", cleanupError);
            }
        }
    }
}
