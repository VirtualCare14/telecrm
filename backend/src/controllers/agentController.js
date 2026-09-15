const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Session = require('../models/Session');
const Lead = require('../models/Lead');
const Role = require('../models/Role');

exports.createAgent = async (req, res, next) => {
  try {
    const { fullName, email, username, phone, password, role, agentRole } = req.body;
    if (!fullName || !email || !username || !password) return res.status(400).json({ message: 'Missing required fields' });

    const selectedRole = (role || agentRole || '').trim();
    if (!selectedRole) {
      return res.status(400).json({ message: 'Role is required' });
    }

    const roleDoc = await Role.findOne({
      name: { $regex: new RegExp(`^${selectedRole}$`, 'i') }
    });
    if (!roleDoc) {
      return res.status(400).json({ message: `Role "${selectedRole}" does not exist in the system` });
    }
    if (!roleDoc.active) {
      return res.status(400).json({ message: `Role "${roleDoc.name}" is inactive and cannot be assigned to agents` });
    }

    const normalizedEmail = (email || '').trim().toLowerCase();
    const normalizedUsername = (username || '').trim();
    const normalizedFullName = (fullName || '').trim();
    const normalizedPhone = (phone || '').trim();
    if (!normalizedPhone) {
      return res.status(400).json({ message: 'Phone is required' });
    }
    const digits = normalizedPhone.replace(/\D/g, '');
    if (!/^\+?[0-9\s\-()]{7,20}$/.test(normalizedPhone) || digits.length < 7 || digits.length > 15) {
      return res.status(400).json({ message: 'Please enter a valid phone number' });
    }

    const exists = await User.findOne({ $or: [{ email: normalizedEmail }, { username: normalizedUsername }] });
    if (exists) return res.status(400).json({ message: 'Email or username already exists' });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      fullName: normalizedFullName,
      email: normalizedEmail,
      username: normalizedUsername,
      phone: normalizedPhone,
      passwordHash,
      role: 'AGENT',
      agentRole: roleDoc.name
    });
    res.status(201).json({ 
      user: { 
        id: user._id, 
        fullName: user.fullName, 
        email: user.email, 
        role: user.role, 
        agentRole: user.agentRole,
        active: user.active 
      } 
    });
  } catch (err) {
    next(err);
  }
};

exports.getAgents = async (req, res, next) => {
  try {
    const agents = await User.find({ role: { $in: ['AGENT', 'agent'] } }).select('-passwordHash').lean();
    const now = new Date();

    const { startDate, endDate } = req.query;
    const match = {};
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        match.createdAt.$lte = end;
      }
    }

    const pipeline = [];
    if (Object.keys(match).length > 0) {
      pipeline.push({ $match: match });
    }
    pipeline.push({
      $group: {
        _id: '$currentOwner',
        assignedLeads: { $sum: 1 },
          wonLeads: {
            $sum: { $cond: [{ $eq: ['$closureStatus', 'WON'] }, 1, 0] }
          },
          lostLeads: {
            $sum: { $cond: [{ $eq: ['$closureStatus', 'LOST'] }, 1, 0] }
          },
          upcomingFollowUps: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$closureStatus', 'OPEN'] },
                    { $gt: ['$nextFollowUpAt', new Date(0)] },
                    { $gte: ['$nextFollowUpAt', now] }
                  ]
                },
                1,
                0
              ]
            }
          },
          overdueFollowUps: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$closureStatus', 'OPEN'] },
                    { $gt: ['$nextFollowUpAt', new Date(0)] },
                    { $lt: ['$nextFollowUpAt', now] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      }
    );

    const metricsAgg = await Lead.aggregate(pipeline);

    const metricsMap = new Map();
    metricsAgg.forEach((m) => {
      if (m._id) metricsMap.set(m._id.toString(), m);
    });

    const enrichedAgents = agents.map((agent) => {
      const m = metricsMap.get(agent._id.toString()) || {
        assignedLeads: 0,
        wonLeads: 0,
        lostLeads: 0,
        upcomingFollowUps: 0,
        overdueFollowUps: 0,
      };
      const assigned = m.assignedLeads || 0;
      const won = m.wonLeads || 0;
      const lost = m.lostLeads || 0;
      const closedLeads = won + lost;
      const conversionRate = closedLeads > 0 ? ((won / closedLeads) * 100).toFixed(1) + '%' : '0.0%';

      const safePhone = (agent.phone && !agent.phone.includes('@')) ? agent.phone : '';

      return {
        ...agent,
        phone: safePhone,
        agentRole: agent.agentRole || 'Calling Agent',
        assignedLeads: assigned,
        wonLeads: won,
        lostLeads: lost,
        upcomingFollowUps: m.upcomingFollowUps || 0,
        overdueFollowUps: m.overdueFollowUps || 0,
        conversionRate,
      };
    });

    res.json({ agents: enrichedAgents });
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
    const { fullName, email, username, phone, role, agentRole } = req.body;
    const agent = await User.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    // Check if email is being changed and if it already exists
    if (email && email.trim().toLowerCase() !== agent.email) {
      const normalizedEmail = email.trim().toLowerCase();
      const existingEmail = await User.findOne({ email: normalizedEmail, _id: { $ne: agent._id } });
      if (existingEmail) return res.status(400).json({ message: 'Email already exists' });
      agent.email = normalizedEmail;
    }

    // Check if username is being changed and if it already exists
    if (username && username.trim() !== agent.username) {
      const normalizedUsername = username.trim();
      const existingUsername = await User.findOne({ username: normalizedUsername, _id: { $ne: agent._id } });
      if (existingUsername) return res.status(400).json({ message: 'Username already exists' });
      agent.username = normalizedUsername;
    }

    if (phone !== undefined) {
      const trimmedPhone = (phone || '').trim();
      if (!trimmedPhone) {
        return res.status(400).json({ message: 'Phone is required' });
      }
      const digits = trimmedPhone.replace(/\D/g, '');
      if (!/^\+?[0-9\s\-()]{7,20}$/.test(trimmedPhone) || digits.length < 7 || digits.length > 15) {
        return res.status(400).json({ message: 'Please enter a valid phone number' });
      }
      agent.phone = trimmedPhone;
    }

    const newRole = (role || agentRole || '').trim();
    if (newRole) {
      const roleDoc = await Role.findOne({
        name: { $regex: new RegExp(`^${newRole}$`, 'i') }
      });
      if (!roleDoc) {
        return res.status(400).json({ message: `Role "${newRole}" does not exist in the system` });
      }

      // If the role is being changed to a different role, ensure the new role is active
      const isRoleChanging = !agent.agentRole || agent.agentRole.toLowerCase() !== roleDoc.name.toLowerCase();
      if (isRoleChanging && !roleDoc.active) {
        return res.status(400).json({ message: `Role "${roleDoc.name}" is inactive and cannot be assigned to agents` });
      }
      agent.agentRole = roleDoc.name;
    }

    agent.fullName = fullName !== undefined ? fullName.trim() : agent.fullName;
    await agent.save();
    res.json({ 
      agent: { 
        id: agent._id, 
        fullName: agent.fullName, 
        email: agent.email, 
        username: agent.username, 
        phone: agent.phone, 
        role: agent.role,
        agentRole: agent.agentRole || 'Calling Agent',
        active: agent.active 
      } 
    });
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
