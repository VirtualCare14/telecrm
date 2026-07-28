const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Session = require('../models/Session');

exports.createAgent = async (req, res, next) => {
  try {
    const { fullName, email, username, phone, password } = req.body;
    if (!fullName || !email || !username || !password) return res.status(400).json({ message: 'Missing required fields' });

    const exists = await User.findOne({ $or: [{ email }, { username }] });
    if (exists) return res.status(400).json({ message: 'Email or username already exists' });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({ fullName, email, username, phone, passwordHash, role: 'AGENT' });
    res.status(201).json({ user: { id: user._id, fullName: user.fullName, email: user.email, role: user.role, active: user.active } });
  } catch (err) {
    next(err);
  }
};

exports.getAgents = async (req, res, next) => {
  try {
    const agents = await User.find({ role: 'AGENT' }).select('-passwordHash');
    res.json({ agents });
  } catch (err) {
    next(err);
  }
};

exports.getAgent = async (req, res, next) => {
  try {
    const agent = await User.findById(req.params.id).select('-passwordHash');
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    res.json({ agent });
  } catch (err) {
    next(err);
  }
};

exports.updateAgent = async (req, res, next) => {
  try {
    const { fullName, email, username, phone } = req.body;
    const agent = await User.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    // Check if email is being changed and if it already exists
    if (email && email !== agent.email) {
      const existingEmail = await User.findOne({ email, _id: { $ne: agent._id } });
      if (existingEmail) return res.status(400).json({ message: 'Email already exists' });
      agent.email = email;
    }

    // Check if username is being changed and if it already exists
    if (username && username !== agent.username) {
      const existingUsername = await User.findOne({ username, _id: { $ne: agent._id } });
      if (existingUsername) return res.status(400).json({ message: 'Username already exists' });
      agent.username = username;
    }

    agent.fullName = fullName || agent.fullName;
    agent.phone = phone || agent.phone;
    await agent.save();
    res.json({ agent: { id: agent._id, fullName: agent.fullName, email: agent.email, username: agent.username, phone: agent.phone, active: agent.active } });
  } catch (err) {
    next(err);
  }
};

exports.changeStatus = async (req, res, next) => {
  try {
    const { status } = req.body; // expected boolean
    const agent = await User.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    agent.active = !!status;
    await agent.save();

    if (!agent.active) {
      // invalidate sessions
      await Session.updateMany({ user: agent._id, valid: true }, { valid: false });
    }

    res.json({ message: 'Status updated', active: agent.active });
  } catch (err) {
    next(err);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ message: 'Missing newPassword' });
    const agent = await User.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    const salt = await bcrypt.genSalt(10);
    agent.passwordHash = await bcrypt.hash(newPassword, salt);
    await agent.save();
    // invalidate sessions so agent must re-login
    await Session.updateMany({ user: agent._id, valid: true }, { valid: false });
    res.json({ message: 'Password changed' });
  } catch (err) {
    next(err);
  }
};

exports.forceLogout = async (req, res, next) => {
  try {
    const agent = await User.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    await Session.updateMany({ user: agent._id, valid: true }, { valid: false });
    res.json({ message: 'Agent force logged out' });
  } catch (err) {
    next(err);
  }
};

exports.getActiveAgents = async (req, res, next) => {
  try {
    const agents = await User.find({ role: 'AGENT', active: true }).select('-passwordHash');
    res.json({ agents });
  } catch (err) {
    next(err);
  }
};
