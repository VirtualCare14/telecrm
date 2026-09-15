const LeadActivity = require('../models/LeadActivity');
const Lead = require('../models/Lead');
const User = require('../models/User');

exports.listActivities = async (req, res, next) => {
  try {
    const leadId = req.params.id;
    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');
    if (!isAdmin && lead.currentOwner.toString() !== req.userId) return res.status(403).json({ message: 'Forbidden' });

    const activities = await LeadActivity.find({ lead: leadId })
      .sort({ createdAt: -1 })
      .populate('performedBy', 'fullName username role agentRole email');

    await User.populate(activities, [
      { path: 'metadata.from', select: 'fullName username email agentRole', model: 'User' },
      { path: 'metadata.to', select: 'fullName username email agentRole', model: 'User' },
      { path: 'metadata.newOwner', select: 'fullName username email agentRole', model: 'User' },
      { path: 'metadata.toAgent', select: 'fullName username email agentRole', model: 'User' },
    ]);

    res.json({ activities });
  } catch (err) {
    next(err);
  }
};
