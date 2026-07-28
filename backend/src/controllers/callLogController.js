const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const ContactPerson = require('../models/ContactPerson');
const CallLog = require('../models/CallLog');
const LeadActivity = require('../models/LeadActivity');

exports.createCallLog = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const leadId = req.params.id;
    const { calledContactId, calledAt, disposition, remark, followUpAt, existingSoftwareUsed, softwareName } = req.body;

    const lead = await Lead.findById(leadId).session(session);
    if (!lead) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }

    // Authorization: Agents can only operate on their own leads
    if (req.userRole === 'AGENT' && lead.currentOwner.toString() !== req.userId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden' });
    }

    const contact = await ContactPerson.findById(calledContactId).session(session);
    if (!contact || contact.lead.toString() !== leadId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Invalid contact person for this lead' });
    }

    const calledAtVal = calledAt ? new Date(calledAt) : new Date();
    const call = await CallLog.create([{
      lead: leadId,
      user: req.userId,
      calledContact: calledContactId,
      calledAt: calledAtVal,
      disposition,
      remark,
      followUpAt: followUpAt ? new Date(followUpAt) : undefined,
    }], { session });

    const callDoc = call[0];

    // Update lead summary fields
    const update = {
      latestDisposition: disposition,
      latestRemark: remark,
      lastCalledAt: calledAtVal,
    };
    if (followUpAt) update.nextFollowUpAt = new Date(followUpAt);
    if (existingSoftwareUsed) update.existingSoftwareUsed = existingSoftwareUsed;
    if (softwareName) update.softwareName = softwareName;

    await Lead.findByIdAndUpdate(leadId, update, { session });

    // Activity record
    await LeadActivity.create([{
      lead: leadId,
      action: 'Call Log Added',
      performedBy: req.userId,
      role: req.userRole,
      metadata: { callLogId: callDoc._id.toString(), disposition, remark, followUpAt },
    }], { session });

    await session.commitTransaction();
    session.endSession();

    const populated = await CallLog.findById(callDoc._id).populate('calledContact').populate('user', 'fullName email');
    res.status(201).json({ callLog: populated });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

exports.listCallLogs = async (req, res, next) => {
  try {
    const leadId = req.params.id;
    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    if (req.userRole === 'AGENT' && lead.currentOwner.toString() !== req.userId) return res.status(403).json({ message: 'Forbidden' });

    const logs = await CallLog.find({ lead: leadId }).sort({ createdAt: -1 }).populate('calledContact').populate('user', 'fullName');
    res.json({ logs });
  } catch (err) {
    next(err);
  }
};
