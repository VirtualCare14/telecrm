const mongoose = require('mongoose');
require('dotenv').config();

const Role = require('../src/models/Role');
const User = require('../src/models/User');

async function seedRoles() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // 1. Remove Manager role if present
    const deleteManagerRes = await Role.deleteMany({
      name: { $regex: /^manager$/i }
    });
    if (deleteManagerRes.deletedCount > 0) {
      console.log(`Deleted ${deleteManagerRes.deletedCount} 'Manager' role(s) from roles collection.`);
    }

    // 2. Reassign any agent having 'Manager' to 'Calling Agent'
    const updateAgentRes = await User.updateMany(
      { agentRole: { $regex: /^manager$/i } },
      { $set: { agentRole: 'Calling Agent' } }
    );
    if (updateAgentRes.modifiedCount > 0) {
      console.log(`Reassigned ${updateAgentRes.modifiedCount} agent(s) from Manager to Calling Agent.`);
    }

    // 3. Define the default dynamic roles (no Manager)
    const initialRoles = [
      {
        name: 'Calling Agent',
        description: 'Handles outbound and inbound calling and lead follow-ups'
      },
      {
        name: 'Sales Agent',
        description: 'Handles qualified sales pipeline and deal closures'
      },
      {
        name: 'Admin',
        description: 'Administrative management and CRM oversight'
      }
    ];

    for (const r of initialRoles) {
      const existing = await Role.findOne({
        name: { $regex: new RegExp(`^${r.name}$`, 'i') }
      });
      if (!existing) {
        await Role.create(r);
        console.log(`Created dynamic role: "${r.name}"`);
      } else {
        console.log(`Role "${r.name}" already exists.`);
      }
    }

    const allRoles = await Role.find().sort({ createdAt: 1 });
    console.log('\nCurrent database roles:');
    allRoles.forEach((role) => console.log(`- ${role.name}: ${role.description}`));

    process.exit(0);
  } catch (err) {
    console.error('Seeding roles failed:', err);
    process.exit(1);
  }
}

seedRoles();
