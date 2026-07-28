const LeadActivity = require('../models/LeadActivity');
const Lead = require('../models/Lead');

exports.listActivities = async (req, res, next) => {
  try {
    const leadId = req.params.id;
    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    if (req.userRole === 'AGENT' && lead.currentOwner.toString() !== req.userId) return res.status(403).json({ message: 'Forbidden' });

    const activities = await LeadActivity.find({ lead: leadId }).sort({ createdAt: -1 }).populate('performedBy', 'fullName role');
    res.json({ activities });
  } catch (err) {
    next(err);
  }
};
