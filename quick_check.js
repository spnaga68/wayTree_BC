
const mongoose = require('mongoose');
const mongodbUri = "mongodb://localhost:27017/waytree_app"; // Based on previous session knowledge

async function run() {
    try {
        await mongoose.connect(mongodbUri);
        console.log('Connected.');

        const EventMember = mongoose.model('EventMember', new mongoose.Schema({
            eventId: mongoose.Schema.Types.ObjectId,
            name: String
        }), 'eventmembers');

        const counts = await EventMember.aggregate([
            { $group: { _id: "$eventId", count: { $sum: 1 } } }
        ]);

        console.log('--- EVENT MEMBER COUNTS ---');
        counts.forEach(c => console.log(`${c._id}: ${c.count}`));

        const allEM = await EventMember.find().limit(5);
        console.log('--- SAMPLE MEMBERS ---');
        console.log(JSON.stringify(allEM, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
