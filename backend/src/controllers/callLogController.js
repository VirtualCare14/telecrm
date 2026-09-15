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
    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');
    if (!isAdmin && lead.currentOwner?.toString() !== req.userId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden: You can only record calls for leads assigned to you' });
    }

    let contactId = null;
    if (calledContactId && mongoose.Types.ObjectId.isValid(calledContactId)) {
      const contact = await ContactPerson.findById(calledContactId).session(session);
      if (contact && contact.lead.toString() === leadId) {
        contactId = contact._id;
      }
    }

    if (!contactId) {
      const contactName = (req.body.calledContactName || req.body.contactName || (typeof calledContactId === 'string' && !mongoose.Types.ObjectId.isValid(calledContactId) ? calledContactId : '')).trim();
      if (!contactName) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: 'Please select or enter a contact person' });
      }

      let contact = await ContactPerson.findOne({
        lead: leadId,
        name: new RegExp(`^${contactName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      }).session(session);

      if (!contact) {
        const phone = (req.body.calledContactPhone || req.body.contactPhone || '').trim() || '—';
        const hasPrimary = await ContactPerson.findOne({ lead: leadId, isPrimary: true }).session(session);
        const createdContacts = await ContactPerson.create([{
          lead: leadId,
          name: contactName,
          phone,
          isPrimary: !hasPrimary,
          createdBy: req.userId,
        }], { session });
        contact = createdContacts[0];

        if (!lead.primaryContact || !hasPrimary) {
          lead.primaryContact = contact._id;
          await lead.save({ session });
        }
      }
      contactId = contact._id;
    }

    const calledAtVal = calledAt ? new Date(calledAt) : new Date();
    const call = await CallLog.create([{
      lead: leadId,
      user: req.userId,
      calledContact: contactId,
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
    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');
    if (!isAdmin && lead.currentOwner.toString() !== req.userId) return res.status(403).json({ message: 'Forbidden: You do not have access to this lead' });

    const logs = await CallLog.find({ lead: leadId }).sort({ createdAt: -1 }).populate('calledContact').populate('user', 'fullName');
    res.json({ logs });
  } catch (err) {
    next(err);
  }
};
