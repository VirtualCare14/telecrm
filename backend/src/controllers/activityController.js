const LeadActivity = require('../models/LeadActivity');
const Lead = require('../models/Lead');
const User = require('../models/User');
const { canAccessLead } = require('../utils/leadPermissions');

exports.listActivities = async (req, res, next) => {
  try {
    const leadId = req.params.id;
    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    const hasAccess = await canAccessLead(lead, req.userId, req.userRole, req.agentRole);
    if (!hasAccess) return res.status(403).json({ message: 'Forbidden' });

    const activities = await LeadActivity.find({ lead: leadId })
      .sort({ createdAt: -1 })
      .populate('performedBy', 'fullName username role agentRole email');

    await User.populate(activities, [
      { path: 'metadata.from', select: 'fullName username email agentRole', model: 'User' },
      { path: 'metadata.to', select: 'fullName username email agentRole', model: 'User' },
      { path: 'metadata.newOwner', select: 'fullName username email agentRole', model: 'User' },
      { path: 'metadata.toAgent', select: 'fullName username email agentRole', model: 'User' },
      { path: 'metadata.salesAgentId', select: 'fullName username email agentRole', model: 'User' },
    ]);

    res.json({ activities });
  } catch (err) {
    next(err);
  }
};

exports.createWhatsAppActivity = async (req, res, next) => {
  try {
    const leadId = req.params.id;
    const lead = await Lead.findById(leadId).populate('primaryContact');
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    const hasAccess = await canAccessLead(lead, req.userId, req.userRole, req.agentRole);
    if (!hasAccess) return res.status(403).json({ message: 'Forbidden' });

    const {
      messageType = 'General Message',
      messageContent,
      recipientPhone,
      recipientName,
      relatedActivityType,
      relatedActivityId,
      salesAgentId,
      salesAgentName,
      scheduledDate,
      scheduledTime,
      status = 'Sent (CRM Record)',
    } = req.body;

    if (!messageContent || !messageContent.trim()) {
      return res.status(400).json({ message: 'Message content is required' });
    }

    const senderName = req.user?.fullName || req.user?.username || 'Calling Agent';

    const activity = await LeadActivity.create({
      lead: leadId,
      action: `WhatsApp: ${messageType}`,
      performedBy: req.userId,
      role: req.userRole,
      details: messageContent.trim(),
      metadata: {
        channel: 'WhatsApp',
        messageType,
        messageContent: messageContent.trim(),
        recipientPhone: recipientPhone || lead.primaryContact?.phone || '',
        recipientName: recipientName || lead.primaryContact?.name || 'Customer',
        relatedActivityType: relatedActivityType || null,
        relatedActivityId: relatedActivityId ? relatedActivityId.toString() : null,
        salesAgentId: salesAgentId ? salesAgentId.toString() : null,
        salesAgentName: salesAgentName || null,
        scheduledDate: scheduledDate || null,
        scheduledTime: scheduledTime || null,
        status,
        sentAt: new Date(),
        sentByName: senderName,
        apiStatus: 'Simulated (CRM-only)',
      },
    });

    const populatedActivity = await LeadActivity.findById(activity._id)
      .populate('performedBy', 'fullName username role agentRole email');

    res.status(201).json({ success: true, activity: populatedActivity });
  } catch (err) {
    next(err);
  }
};
