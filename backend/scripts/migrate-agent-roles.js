const mongoose = require('mongoose');
require('dotenv').config();

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const result = await mongoose.connection.collection('users').updateMany(
      {
        role: { $in: ['AGENT', 'agent'] },
        $or: [
          { agentRole: { $exists: false } },
          { agentRole: null }
        ]
      },
      {
        $set: { agentRole: 'Calling Agent' }
      }
    );

    console.log(`Updated ${result.modifiedCount} agents with default agentRole: Calling Agent`);

    const users = await mongoose.connection.collection('users').find({}).toArray();
    console.log('Current users:', users.map(u => ({ username: u.username, role: u.role, agentRole: u.agentRole })));
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
