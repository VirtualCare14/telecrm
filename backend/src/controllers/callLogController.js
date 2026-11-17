const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const ContactPerson = require('../models/ContactPerson');
const CallLog = require('../models/CallLog');
const LeadActivity = require('../models/LeadActivity');
const { canAccessLead } = require('../utils/leadPermissions');
const { parseFollowUpDateTimeIST } = require('../utils/timeZoneHelper');

exports.createCallLog = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const leadId = req.params.id;
    const { calledContactId, calledAt, disposition, remark, followUpAt, existingSoftwareUsed, softwareName, leadTemperature } = req.body;

    const lead = await Lead.findById(leadId).session(session);
    if (!lead) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }

    // Authorization: Agents can only operate on their own leads or assigned leads
    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');
    const hasAccess = await canAccessLead(lead, req.userId, req.userRole, req.agentRole);
    if (!isAdmin && !hasAccess) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden: You can only record calls for leads assigned to you or created by you' });
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
    const normalizedTemp = leadTemperature
      ? (leadTemperature.trim().charAt(0).toUpperCase() + leadTemperature.trim().slice(1).toLowerCase())
      : undefined;

    const followUpAtVal = followUpAt ? (parseFollowUpDateTimeIST(followUpAt) || new Date(followUpAt)) : undefined;

    const call = await CallLog.create([{
      lead: leadId,
      user: req.userId,
      calledContact: contactId,
      calledAt: calledAtVal,
      disposition,
      remark,
      followUpAt: followUpAtVal,
      leadTemperature: normalizedTemp,
    }], { session });

    const callDoc = call[0];

    // Update lead summary fields
    const callerName = req.user?.fullName || req.user?.username || 'Agent';
    const update = {
      latestDisposition: disposition,
      disposition,
      dispositionUpdatedBy: req.userId,
      dispositionUpdatedByName: callerName,
      dispositionUpdatedAt: new Date(),
      latestRemark: remark,
      lastCalledAt: calledAtVal,
      updatedBy: req.userId,
      updatedByName: callerName,
    };
    if (normalizedTemp) {
      update.leadTemperature = normalizedTemp;
      update.temperatureUpdatedBy = req.userId;
      update.temperatureUpdatedByName = callerName;
      update.temperatureUpdatedAt = new Date();

      if (!update.$push) update.$push = {};
      update.$push.temperatureHistory = {
        temperature: normalizedTemp,
        previousTemperature: lead.leadTemperature || null,
        changedBy: req.userId,
        changedByName: callerName,
        changedAt: new Date(),
        source: 'Call Log',
        remark: remark || `Temperature updated to "${normalizedTemp}" via Call Log`,
      };
    }
    if (disposition && disposition.toLowerCase() === 'won' && lead.closureStatus !== 'WON') {
      update.closureStatus = 'WON';
      update.status = 'WON';
      update.closedBy = req.userId;
      update.closedAt = new Date();
    } else if (disposition && disposition.toLowerCase() === 'lost' && lead.closureStatus !== 'LOST') {
      update.closureStatus = 'LOST';
      update.status = 'LOST';
      update.closedBy = req.userId;
      update.closedAt = new Date();
    }
    if (followUpAtVal) update.nextFollowUpAt = followUpAtVal;
    if (existingSoftwareUsed) update.existingSoftwareUsed = existingSoftwareUsed;
    if (softwareName) update.softwareName = softwareName;

    await Lead.findByIdAndUpdate(leadId, update, { session });

    // Activity record
    await LeadActivity.create([{
      lead: leadId,
      action: 'Call Log Added',
      performedBy: req.userId,
      role: req.userRole,
      metadata: { 
        callLogId: callDoc._id.toString(), 
        disposition, 
        remark, 
        followUpAt, 
        callerName, 
        leadTemperature: normalizedTemp 
      },
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
    const hasAccess = await canAccessLead(lead, req.userId, req.userRole, req.agentRole);
    if (!hasAccess) return res.status(403).json({ message: 'Forbidden: You do not have access to this lead' });

    const logs = await CallLog.find({ lead: leadId }).sort({ createdAt: -1 }).populate('calledContact').populate('user', 'fullName');
    res.json({ logs });
  } catch (err) {
    next(err);
  }
};
