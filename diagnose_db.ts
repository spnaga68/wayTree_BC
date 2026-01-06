
import mongoose from 'mongoose';
import config from './src/config';
import EventMember from './src/models/EventMember';
import CommunityConnection from './src/models/CommunityConnection';
import EventConnection from './src/models/EventConnection';
import { Event } from './src/models/Event';

async function diagnose() {
    try {
        await mongoose.connect(config.mongodbUri);
        const eventId = "6956d796d4d83d2af56de398";
        console.log('--- DIAGNOSTIC FOR EVENT:', eventId, '---');

        const event = await Event.findById(eventId);
        console.log('1. Event found:', event ? 'YES' : 'NO');
        if (event) {
            console.log('   Event Name:', event.name);
            console.log('   Attendees Array:', event.attendees);
        }

        // Search by String ID
        const emStr = await EventMember.find({ eventId: eventId });
        const ecStr = await EventConnection.find({ eventId: eventId });
        const ccStr = await CommunityConnection.find({ eventId: eventId });

        console.log('2. Search by String ID:');
        console.log('   EventMember:', emStr.length);
        console.log('   EventConnection:', ecStr.length);
        console.log('   CommunityConnection:', ccStr.length);

        // Search by ObjectId
        const objId = new mongoose.Types.ObjectId(eventId);
        const emObj = await EventMember.find({ eventId: objId });
        const ecObj = await EventConnection.find({ eventId: objId });
        const ccObj = await CommunityConnection.find({ eventId: objId });

        console.log('3. Search by ObjectId:');
        console.log('   EventMember:', emObj.length);
        console.log('   EventConnection:', ecObj.length);
        console.log('   CommunityConnection:', ccObj.length);

        // Global search - is there ANY member in the DB?
        const totalEM = await EventMember.countDocuments();
        const totalEC = await EventConnection.countDocuments();
        const totalCC = await CommunityConnection.countDocuments();

        console.log('4. Global Totals:');
        console.log('   Total EventMembers:', totalEM);
        console.log('   Total EventConnections:', totalEC);
        console.log('   Total CommunityConnections:', totalCC);

        if (totalEM > 0) {
            const sample = await EventMember.findOne();
            console.log('   Sample EM eventId:', sample?.eventId, 'Type:', typeof sample?.eventId);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

diagnose();
