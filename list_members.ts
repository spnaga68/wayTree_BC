
import mongoose from 'mongoose';
import config from './src/config';
import EventMember from './src/models/EventMember';
import { Event } from './src/models/Event';

async function diagnose() {
    try {
        await mongoose.connect(config.mongodbUri);
        const members = await EventMember.find().lean();
        console.log('--- ALL EVENT MEMBERS ---');
        for (const m of members) {
            const event = await Event.findById(m.eventId);
            console.log(`Member: ${m.name} | EventID: ${m.eventId} | EventName: ${event ? event.name : 'UNKNOWN'}`);
        }
        process.exit(0);
    } catch (err) {
        process.exit(1);
    }
}
diagnose();
