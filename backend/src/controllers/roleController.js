const Role = require('../models/Role');
const User = require('../models/User');

exports.getRoles = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.active !== undefined) {
      filter.active = req.query.active === 'true';
    }
    const roles = await Role.find(filter).sort({ createdAt: 1 });

    // Aggregate counts of agents currently assigned to each role
    const agentCounts = await User.aggregate([
      { $match: { role: { $in: ['AGENT', 'agent'] } } },
      { $group: { _id: '$agentRole', count: { $sum: 1 } } }
    ]);

    const countMap = {};
    agentCounts.forEach((ac) => {
      if (ac._id) countMap[ac._id] = ac.count;
    });

    const enrichedRoles = roles.map((role) => ({
      ...role.toObject(),
      agentCount: countMap[role.name] || 0
    }));

    res.json({ roles: enrichedRoles });
  } catch (err) {
    next(err);
  }
};

exports.createRole = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    const trimmedName = (name || '').trim();

    if (!trimmedName) {
      return res.status(400).json({ message: 'Role name is required' });
    }

    const exists = await Role.findOne({
      name: { $regex: new RegExp(`^${trimmedName}$`, 'i') }
    });

    if (exists) {
      return res.status(400).json({ message: `Role "${trimmedName}" already exists` });
    }

    const role = await Role.create({
      name: trimmedName,
      description: (description || '').trim()
    });

    res.status(201).json({ role: { ...role.toObject(), agentCount: 0 } });
  } catch (err) {
    next(err);
  }
};

exports.updateRole = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    const trimmedName = (name || '').trim();

    const role = await Role.findById(req.params.id);
    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }

    if (trimmedName && trimmedName.toLowerCase() !== role.name.toLowerCase()) {
      const exists = await Role.findOne({
        _id: { $ne: role._id },
        name: { $regex: new RegExp(`^${trimmedName}$`, 'i') }
      });
      if (exists) {
        return res.status(400).json({ message: `Role "${trimmedName}" already exists` });
      }

      // Cascade update to all users having the old role name
      const oldName = role.name;
      await User.updateMany(
        { agentRole: oldName },
        { $set: { agentRole: trimmedName } }
      );
      role.name = trimmedName;
    }

    if (description !== undefined) {
      role.description = (description || '').trim();
    }

    await role.save();

    const agentCount = await User.countDocuments({ agentRole: role.name });
    res.json({ role: { ...role.toObject(), agentCount } });
  } catch (err) {
    next(err);
  }
};

exports.deleteRole = async (req, res, next) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }

    // Check if any agent is currently assigned this role
    const agentCount = await User.countDocuments({ agentRole: role.name });
    if (agentCount > 0) {
      return res.status(400).json({
        message: `Cannot delete role "${role.name}" because it is currently assigned to ${agentCount} agent(s). Please reassign those agents before deleting this role.`
      });
    }

    await Role.findByIdAndDelete(req.params.id);
    res.json({ message: `Role "${role.name}" deleted successfully` });
  } catch (err) {
    next(err);
  }
};

exports.changeStatus = async (req, res, next) => {
  try {
    const { active } = req.body;
    const role = await Role.findById(req.params.id);
    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }

    role.active = typeof active === 'boolean' ? active : !role.active;
    await role.save();

    const agentCount = await User.countDocuments({ agentRole: role.name });
    res.json({
      message: `Role "${role.name}" status updated to ${role.active ? 'Active' : 'Inactive'}`,
      role: { ...role.toObject(), agentCount }
    });
  } catch (err) {
    next(err);
  }
};
