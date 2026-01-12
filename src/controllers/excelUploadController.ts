import { Request, Response } from 'express';
import XLSX from 'xlsx';
import { Event } from '../models/Event';
import { MemberManagementService } from '../services/memberManagementService';

/**
 * Enhanced Excel upload with automatic user creation and embedding generation
 * POST /event-connections/upload-members-enhanced
 */
export const uploadMembersExcelEnhanced = async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        let { eventId, organizerId } = req.body;

        // Fallback to query params if not in body
        if (!eventId) eventId = req.query.eventId;
        if (!organizerId) organizerId = req.query.organizerId;

        if (!eventId) {
            return res.status(400).json({ success: false, message: 'EventId is required' });
        }

        // Auto-fetch organizerId if missing
        if (!organizerId) {
            const event = await Event.findById(eventId);
            if (event) {
                organizerId = event.createdBy;
            } else {
                return res.status(404).json({ success: false, message: 'Event not found' });
            }
        }

        // Parse Excel file
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet) as any[];

        console.log(`📊 Processing Excel file with ${data.length} rows`);

        // Convert Excel rows to member input format
        // User's Excel structure (EXHIBITOR FORMAT):
        // - 'name' column = COMPANY NAME (organization)
        // - 'founderName' column = FOUNDER NAME (person's name)
        // - 'about' column = BIO/DESCRIPTION
        // - 'founderDesignation' column = ROLE/TITLE
        const members = data.map((row) => {
            // Extract FOUNDER NAME (person's name) - this is the USER name
            const founderName = row['founderName'] || row['Founder Name'] ||
                row['FounderName'] || row['founder_name'];

            // Extract COMPANY NAME - this is in the 'name' column for exhibitors
            const companyName = row['name'] || row['Name'] ||
                row['exhibitor_name'] || row['Exhibitor Name'] ||
                row['organisation'] || row['Organisation'] ||
                row['organizationName'] || row['Organization Name'];

            // Extract BIO/ABOUT - description of the person/company
            const bioText = row['about'] || row['About'] ||
                row['bio'] || row['Bio'] ||
                row['description'] || row['Description'];

            // Extract FOUNDER DESIGNATION/ROLE - this is PRIORITY for bio
            const designation = row['founderDesignation'] || row['Founder Designation'] ||
                row['FounderDesignation'] || row['founder_designation'] ||
                row['designation'] || row['Designation'] ||
                row['role'] || row['Role'];

            // Extract other fields
            const website = row['website'] || row['Website'] || '';
            const linkedin = row['linkedin'] || row['LinkedIn'] || row['founderLinkedin'] || '';
            const productName = row['productName'] || row['Product Name'] || '';
            const productAbout = row['productAbout'] || row['Product About'] || '';

            // Build comprehensive bio by COMBINING all available fields
            // Format: "Designation\nAbout\nProduct Info"
            const bioParts = [];

            // Add designation (CEO, CTO, etc.)
            if (designation) {
                bioParts.push(designation);
            }

            // Add about/description (company description)
            if (bioText) {
                bioParts.push(bioText);
            }

            // Add product about if available and different from bioText
            if (productAbout && productAbout !== bioText) {
                bioParts.push(productAbout);
            }

            // Add product name if available
            if (productName && !bioParts.join(' ').includes(productName)) {
                bioParts.push(`Product: ${productName}`);
            }

            // Join all parts with newlines for better readability
            const finalBio = bioParts.join('\n').trim();

            return {
                // Person's name (FOUNDER NAME from founderName column)
                name: founderName || companyName,  // Fallback to company if no founder name
                founderName: founderName,

                // Company/Organization name (from 'name' column)
                company: companyName,
                organisation: companyName,
                exhibitor_name: companyName,

                // Bio/Description (founderDesignation has priority)
                bio: finalBio,
                about: finalBio,
                description: finalBio,
                founderDesignation: designation,

                // Contact information
                website: website,
                linkedin: linkedin,

                // Phone (will be auto-generated if missing)
                phoneNumber: row['phoneNumber'] || row['Phone Number'] || row['phone'] || row['Phone'] ||
                    row['mobile'] || row['Mobile'],

                // Email (will be auto-generated if missing)
                email: row['email'] || row['Email'],

                // Additional fields (stored but not used for user creation)
                exhibitor_id: row['exhibitor_id'] || row['Exhibitor ID'],
                organisationType: row['organisationType'] || row['Organisation Type'],
                profileType: row['profileType'] || row['Profile Type'],
                sectorIntrested: row['sectorIntrested'] || row['Sector Interested'],
                facade: row['facade'] || row['Facade'],
                productName: productName,
                productAbout: productAbout,
                productService: row['productService'] || row['Product Service'],
                booth_number: row['booth_number'] || row['Booth Number'],
            };
        }).filter(member => member.name); // Only include rows with founder names

        console.log(`📊 Mapped ${members.length} valid members from Excel`);

        // DEBUG: Show first member's data
        if (members.length > 0) {
            console.log(`\n🔍 First Member Data:`);
            console.log(`   Name: ${members[0].name}`);
            console.log(`   Company: ${members[0].company}`);
            console.log(`   Bio: ${members[0].bio ? members[0].bio.substring(0, 200) : 'EMPTY'}`);
            console.log(`   Designation: ${members[0].founderDesignation || 'EMPTY'}`);
        }

        if (members.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid members found in Excel file. Ensure there is a "Name" column.',
            });
        }

        // Process all members using the service
        const result = await MemberManagementService.addMembersFromJSON(
            eventId,
            organizerId,
            members,
            'excel'
        );

        return res.status(200).json({
            success: true,
            message: `Processed ${result.totalProcessed} members from Excel`,
            totalProcessed: result.totalProcessed,
            added: result.added,
            skipped: result.skipped,
            failed: result.failed,
            // Frontend compatibility fields
            addedCount: result.added,
            duplicateCount: result.skipped,
            duplicates: [],  // Can add details if needed
            newUsersCreated: result.results.filter(r => r.isNewUser).length,
            embeddingsCreated: result.results.filter(r => r.embeddingCreated).length,
            details: result.results.map((r) => ({
                userId: r.userId,
                isNewUser: r.isNewUser,
                embeddingCreated: r.embeddingCreated,
                message: r.message,
            })),
        });

    } catch (error) {
        console.error('❌ Error processing Excel:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to process file',
            error: (error as any).message,
        });
    }
};
