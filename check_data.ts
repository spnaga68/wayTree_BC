
import mongoose from 'mongoose';
import config from './src/config';
import EventMember from './src/models/EventMember';
import CommunityConnection from './src/models/CommunityConnection';
import { Event } from './src/models/Event';

async function checkData() {
    await mongoose.connect(config.mongodbUri);
    const eventId = "6956d796d4d83d2af56de398"; // From logs

    const event = await Event.findById(eventId);
    const emCount = await EventMember.countDocuments({ eventId: eventId });
    const ccCount = await CommunityConnection.countDocuments({ eventId: eventId });

    console.log('--- DATA CHECK ---');
    console.log('Event Name:', event?.name);
    console.log('Event Attendees Array Length:', event?.attendees?.length);
    console.log('EventMember Count:', emCount);
    console.log('CommunityConnection Count:', ccCount);

    if (emCount > 0) {
        const em = await EventMember.find({ eventId }).limit(1);
        console.log('Sample EventMember:', em[0]);
    }

    process.exit(0);
}

checkData();
