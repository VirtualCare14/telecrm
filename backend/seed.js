require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./src/models/User');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected for seeding');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
};

const seedAdmin = async () => {
  try {
    const existingAdmin = await User.findOne({ email: process.env.ADMIN_EMAIL });
    if (existingAdmin) {
      console.log('Admin user already exists');
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, salt);

    const admin = await User.create({
      fullName: 'Admin User',
      email: process.env.ADMIN_EMAIL,
      username: 'admin',
      phone: '',
      passwordHash,
      role: 'ADMIN',
      active: true,
    });

    console.log('Admin user created successfully:');
    console.log('Email:', admin.email);
    console.log('Username:', admin.username);
    console.log('Password:', process.env.ADMIN_PASSWORD);
  } catch (err) {
    console.error('Error seeding admin:', err.message);
  }
};

const seed = async () => {
  await connectDB();
  await seedAdmin();
  await mongoose.disconnect();
  console.log('Seeding completed');
  process.exit(0);
};

seed();