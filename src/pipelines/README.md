# Pipelines Directory

This directory contains all data processing pipelines for the WayTree application.

## Structure

```
pipelines/
├── member_pipeline/
│   └── index.ts          # Member management pipeline
└── [future_pipeline]/
    └── index.ts          # Future pipelines
```

---

## Member Pipeline

**Location:** `member_pipeline/index.ts`

**Purpose:** Handles all member-related operations with automatic user creation, phone generation, and embedding storage.

**Features:**
- ✅ User existence checking (phone → email → name+company)
- ✅ Automatic user creation with unique phone generation
- ✅ EventMembers collection management
- ✅ Embedding generation and Supabase storage
- ✅ Duplicate prevention
- ✅ Comprehensive logging

**Operations:**
1. `addMember()` - Add member (manual, Excel, JSON, app join)
2. `removeMember()` - Remove member and cleanup embeddings
3. `updateMember()` - Update profile and regenerate embeddings

**Usage:**
```typescript
const { MemberPipeline } = require('../pipelines/member_pipeline');

const result = await MemberPipeline.addMember({
    eventId: "...",
    organizerId: "...",
    userData: {
        name: "John Doe",
        company: "Tech Corp",
        bio: "CEO",
        phoneNumber: "9876543210",  // Optional - auto-generated if missing
        email: "john@tech.com"       // Optional - auto-generated if missing
    },
    source: 'manual'  // 'manual' | 'excel' | 'json' | 'join'
});
```

---

## Creating New Pipelines

To create a new pipeline:

1. **Create folder:**
   ```bash
   mkdir src/pipelines/your_pipeline
   ```

2. **Create index.ts:**
   ```typescript
   // src/pipelines/your_pipeline/index.ts
   
   export class YourPipeline {
       static async processData(input: any): Promise<any> {
           // Your pipeline logic
       }
   }
   ```

3. **Use in controllers:**
   ```typescript
   const { YourPipeline } = require('../pipelines/your_pipeline');
   const result = await YourPipeline.processData(data);
   ```

---

## Pipeline Design Principles

### 1. **Single Responsibility**
Each pipeline handles ONE specific domain (members, events, notifications, etc.)

### 2. **Self-Contained**
Pipelines should be independent modules with minimal external dependencies

### 3. **Comprehensive Logging**
All pipelines should log:
- Input parameters
- Each processing step
- Success/failure outcomes
- Detailed error information

### 4. **Error Handling**
- Try-catch blocks around each major step
- Return structured error responses
- Don't fail silently

### 5. **Testability**
- Static methods for easy testing
- Clear input/output interfaces
- Mockable dependencies

---

## Example Pipeline Template

```typescript
import mongoose from 'mongoose';
import { SomeModel } from '../models/SomeModel';
import { SomeService } from '../services/someService';

interface PipelineInput {
    // Define your input structure
    id: string;
    data: any;
}

interface PipelineOutput {
    success: boolean;
    result?: any;
    error?: string;
}

export class YourPipeline {
    /**
     * Main pipeline entry point
     */
    static async process(input: PipelineInput): Promise<PipelineOutput> {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`🔄 [YOUR PIPELINE] STARTING`);
        console.log(`   ID: ${input.id}`);
        console.log(`${'='.repeat(80)}`);

        try {
            // STEP 1: Validate input
            console.log(`\n📋 STEP 1: Validating input...`);
            const validated = await this.validateInput(input);
            console.log(`✅ Input validated`);

            // STEP 2: Process data
            console.log(`\n⚙️ STEP 2: Processing data...`);
            const processed = await this.processData(validated);
            console.log(`✅ Data processed`);

            // STEP 3: Store results
            console.log(`\n💾 STEP 3: Storing results...`);
            await this.storeResults(processed);
            console.log(`✅ Results stored`);

            console.log(`\n🎉 PIPELINE COMPLETED SUCCESSFULLY`);
            console.log(`${'='.repeat(80)}\n`);

            return {
                success: true,
                result: processed
            };

        } catch (error) {
            console.log(`\n❌ [YOUR PIPELINE] ERROR`);
            console.error(error);
            console.log(`${'='.repeat(80)}\n`);
            
            return {
                success: false,
                error: (error as Error).message
            };
        }
    }

    // Private helper methods
    private static async validateInput(input: PipelineInput): Promise<any> {
        // Validation logic
        return input;
    }

    private static async processData(data: any): Promise<any> {
        // Processing logic
        return data;
    }

    private static async storeResults(data: any): Promise<void> {
        // Storage logic
    }
}
```

---

## Best Practices

### ✅ DO:
- Use descriptive folder names (e.g., `member_pipeline`, `event_pipeline`)
- Export a single class per pipeline
- Use static methods for stateless operations
- Log all major steps with emojis for visibility
- Return structured responses with success/error
- Handle errors gracefully
- Document your pipeline in this README

### ❌ DON'T:
- Mix multiple domains in one pipeline
- Use instance methods (keep pipelines stateless)
- Fail silently without logging
- Return inconsistent response formats
- Hardcode configuration values
- Skip error handling

---

## Current Pipelines

| Pipeline | Purpose | Status |
|----------|---------|--------|
| `member_pipeline` | Member management with embeddings | ✅ Active |

---

## Future Pipeline Ideas

- `event_pipeline` - Event creation, updates, and lifecycle management
- `notification_pipeline` - Notification generation and delivery
- `recommendation_pipeline` - AI-powered recommendations
- `analytics_pipeline` - Data aggregation and analytics
- `document_pipeline` - Document processing and storage

---

## Testing Pipelines

```typescript
// Example test
import { MemberPipeline } from './member_pipeline';

describe('MemberPipeline', () => {
    it('should add member successfully', async () => {
        const result = await MemberPipeline.addMember({
            eventId: 'test-event',
            organizerId: 'test-org',
            userData: {
                name: 'Test User',
                company: 'Test Corp'
            },
            source: 'manual'
        });

        expect(result.success).toBe(true);
        expect(result.embeddingCreated).toBe(true);
    });
});
```

---

## Summary

The pipelines directory provides a clean, organized structure for all data processing operations. Each pipeline is self-contained, well-documented, and follows consistent patterns for maintainability and scalability.

**When adding new functionality, consider if it should be a new pipeline!**
