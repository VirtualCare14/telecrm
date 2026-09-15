const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const ContactPerson = require('../models/ContactPerson');
const LeadActivity = require('../models/LeadActivity');
const User = require('../models/User');
const CallLog = require('../models/CallLog');
const { getNextSequence, formatLeadNumber } = require('../services/counterService');

exports.createLead = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { organizationName, industry, organizationType, address, leadSource, contacts, currentOwner } = req.body;
    if (!organizationName || !leadSource || !contacts || !Array.isArray(contacts) || contacts.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Missing required lead or contact information' });
    }

    // Generate lead number (atomic $inc in counterService prevents duplicates)
    const seq = await getNextSequence('leadNumber');
    const leadNumber = formatLeadNumber(seq);

    // Admin can assign lead to another agent; otherwise assign to self
    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');
    const ownerId = isAdmin && currentOwner ? currentOwner : req.userId;

    const lead = await Lead.create([{
      leadNumber, organizationName, industry, organizationType, address,
      leadSource, currentOwner: ownerId, createdBy: req.userId
    }], { session });

    const leadId = lead[0]._id;

    let primaryContactId = null;
    for (let i = 0; i < contacts.length; i++) {
      const c = contacts[i];
      const cp = await ContactPerson.create([{
        lead: leadId, name: c.name, designation: c.designation,
        phone: c.phone, altPhone: c.altPhone, email: c.email,
        isPrimary: i === 0, createdBy: req.userId
      }], { session });
      if (i === 0) primaryContactId = cp[0]._id;
    }

    await Lead.findByIdAndUpdate(leadId, { primaryContact: primaryContactId }, { session });

    await LeadActivity.create([{
      lead: leadId, action: 'Lead Created',
      performedBy: req.userId, role: req.userRole,
      metadata: { leadNumber, organizationName, leadSource }
    }], { session });

    await session.commitTransaction();
    session.endSession();

    const created = await Lead.findById(leadId)
      .populate('primaryContact')
      .populate('currentOwner', 'fullName email username')
      .populate('createdBy', 'fullName email username')
      .lean();
    res.status(201).json({ lead: created });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('Lead creation error:', err);
    next(err);
  }
};

exports.checkDuplicates = async (req, res, next) => {
  try {
    const { organizationName, contactName, phone } = req.body;
    const matches = [];
    if (organizationName) {
      const orgs = await Lead.find({ organizationName: new RegExp('^' + organizationName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') })
        .limit(5).select('leadNumber organizationName').lean();
      matches.push(...orgs.map(o => ({ type: 'organization', lead: o })));
    }
    if (phone) {
      const escapedPhone = phone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const cps = await ContactPerson.find({ phone: new RegExp(escapedPhone) })
        .limit(10).populate('lead', 'leadNumber organizationName').lean();
      matches.push(...cps.map(c => ({ type: 'contact', contact: c })));
    }
    if (contactName) {
      const escapedName = contactName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const cps2 = await ContactPerson.find({ name: new RegExp(escapedName, 'i') })
        .limit(10).populate('lead', 'leadNumber organizationName').lean();
      matches.push(...cps2.map(c => ({ type: 'contact', contact: c })));
    }
    res.json({ matches });
  } catch (err) {
    next(err);
  }
};

exports.listLeads = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const search = (req.query.search || '').trim();

    const filter = {};
    const ownerParam = req.query.owner || req.query.agentId || req.query.agent;
    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');
    if (!isAdmin) {
      filter.currentOwner = req.userId;
    } else if (req.query.unassigned === 'true' || ownerParam === 'unassigned') {
      const activeAgents = await User.find({ role: 'AGENT', active: true }).select('_id');
      const activeAgentIds = activeAgents.map((a) => a._id);
      filter.currentOwner = { $nin: activeAgentIds };
    } else if (ownerParam) {
      if (mongoose.Types.ObjectId.isValid(ownerParam)) {
        filter.currentOwner = new mongoose.Types.ObjectId(ownerParam);
      } else {
        const matchedAgent = await User.findOne({
          role: 'AGENT',
          $or: [
            { fullName: new RegExp(`^${ownerParam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
            { username: new RegExp(`^${ownerParam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
            { email: new RegExp(`^${ownerParam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          ],
        }).select('_id');
        if (matchedAgent) {
          filter.currentOwner = matchedAgent._id;
        } else {
          filter.currentOwner = ownerParam;
        }
      }
    }

    // Date filter
    if (req.query.startDate || req.query.endDate) {
      filter.createdAt = {};
      if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
      if (req.query.endDate) {
        const end = new Date(req.query.endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    // Closure filter
    if (req.query.closureStatus) {
      filter.closureStatus = req.query.closureStatus;
    }

    // Follow-up filter
    if (req.query.followUpType === 'upcoming') {
      filter.nextFollowUpAt = { $gte: new Date() };
      filter.closureStatus = 'OPEN';
    } else if (req.query.followUpType === 'overdue') {
      filter.nextFollowUpAt = { $lt: new Date(), $gt: new Date(0) };
      filter.closureStatus = 'OPEN';
    }

    // Search logic
    if (search) {
      const isNumeric = /^\d{1,5}$/.test(search);
      if (isNumeric) {
        filter.leadNumber = search.padStart(5, '0');
      } else if (/^[\d+\-()\s]+$/.test(search)) {
        // Search by phone - find contacts with matching phone then get leads
        const contacts = await ContactPerson.find({
          phone: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        }).select('lead').lean();
        const leadIds = [...new Set(contacts.map(c => c.lead.toString()))];
        filter._id = { $in: leadIds };
      } else {
        // Search by organization name or contact person name
        const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const orgMatch = { organizationName: new RegExp(escapedSearch, 'i') };
        
        // Also find contacts with matching name
        const contacts = await ContactPerson.find({
          name: new RegExp(escapedSearch, 'i')
        }).select('lead').lean();
        const leadIdsFromContacts = [...new Set(contacts.map(c => c.lead.toString()))];
        
        if (leadIdsFromContacts.length > 0) {
          filter.$or = [
            orgMatch,
            { _id: { $in: leadIdsFromContacts } }
          ];
        } else {
          filter.organizationName = new RegExp(escapedSearch, 'i');
        }
      }
    }

    const skip = (page - 1) * limit;
    const [leads, total] = await Promise.all([
      Lead.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip).limit(limit)
        .populate('primaryContact')
        .populate('currentOwner', 'fullName email username')
        .lean(),
      Lead.countDocuments(filter),
    ]);

    res.json({ leads, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
};

exports.getLead = async (req, res, next) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate('primaryContact')
      .populate('currentOwner', 'fullName email username')
      .populate('createdBy', 'fullName email username')
      .populate('closedBy', 'fullName email username')
      .lean();
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');
    if (!isAdmin && (!lead.currentOwner || (lead.currentOwner._id?.toString() !== req.userId && lead.currentOwner.toString() !== req.userId))) {
      return res.status(403).json({ message: 'Forbidden: You do not have access to this lead' });
    }
    // Simplify owner/creator to just names for frontend
    if (lead.currentOwner && typeof lead.currentOwner === 'object') {
      lead.currentOwnerName = lead.currentOwner.fullName || lead.currentOwner.username || 'Unassigned';
    } else {
      lead.currentOwnerName = 'Unassigned';
    }
    if (lead.createdBy && typeof lead.createdBy === 'object') {
      lead.createdByName = lead.createdBy.fullName || lead.createdBy.username || 'Unknown';
    } else {
      lead.createdByName = 'Unknown';
    }
    res.json({ lead });
  } catch (err) {
    next(err);
  }
};

exports.updateLead = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const leadId = req.params.id;
    const { organizationName, industry, organizationType, address, leadSource, existingSoftwareUsed, softwareName } = req.body;

    const lead = await Lead.findById(leadId).session(session);
    if (!lead) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }
    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');
    if (!isAdmin && lead.currentOwner.toString() !== req.userId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden' });
    }

    const updates = {};
    if (organizationName !== undefined) updates.organizationName = organizationName;
    if (industry !== undefined) updates.industry = industry;
    if (organizationType !== undefined) updates.organizationType = organizationType;
    if (address !== undefined) updates.address = address;
    if (leadSource !== undefined) updates.leadSource = leadSource;
    if (existingSoftwareUsed !== undefined) updates.existingSoftwareUsed = existingSoftwareUsed;
    if (softwareName !== undefined) updates.softwareName = softwareName;

    if (Object.keys(updates).length > 0) {
      await Lead.findByIdAndUpdate(leadId, updates, { session });
    }

    const metadata = { updates };
    if (req.userRole === 'ADMIN') {
      metadata.adminEdit = true;
    }

    await LeadActivity.create([{
      lead: leadId, action: req.userRole === 'ADMIN' ? 'Admin Edited Lead' : 'Lead Updated',
      performedBy: req.userId, role: req.userRole,
      metadata
    }], { session });

    await session.commitTransaction();
    session.endSession();

    const updated = await Lead.findById(leadId)
      .populate('primaryContact')
      .populate('currentOwner', 'fullName email username')
      .lean();
    res.json({ lead: updated });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

exports.closeWon = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const leadId = req.params.id;
    const { closingRemark: rawRemark, remark: altRemark, dealValue, product } = req.body;
    const closingRemark = (rawRemark || altRemark || '').trim();

    const lead = await Lead.findById(leadId).session(session);
    if (!lead) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }

    if (lead.closureStatus === 'WON' || lead.closureStatus === 'LOST') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Lead already closed' });
    }

    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');
    if (!isAdmin && lead.currentOwner?.toString() !== req.userId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden: You can only set outcome for leads assigned to you' });
    }

    lead.closureStatus = 'WON';
    lead.status = 'WON';
    lead.closingRemark = closingRemark;
    if (dealValue !== undefined && dealValue !== null && dealValue !== '') lead.dealValue = Number(dealValue) || dealValue;
    if (product && product.trim()) lead.product = product.trim();
    lead.closedBy = req.userId;
    lead.closedAt = new Date();
    lead.nextFollowUpAt = null; // A Won lead must no longer appear as an active/upcoming/overdue follow-up
    await lead.save({ session });

    await LeadActivity.create([{
      lead: leadId, action: 'Lead Closed Won',
      performedBy: req.userId, role: req.userRole,
      metadata: { closingRemark, dealValue, product: product ? product.trim() : undefined }
    }], { session });

    await session.commitTransaction();
    session.endSession();

    res.json({ message: 'Lead closed as Won', lead });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

exports.closeLost = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const leadId = req.params.id;
    const { closingRemark: rawRemark, remark: altRemark, lostReason: rawReason, reason: altReason } = req.body;
    const closingRemark = (rawRemark || altRemark || '').trim();
    const lostReason = (rawReason || altReason || '').trim();

    if (!closingRemark && !lostReason) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'A remark or reason is required when marking a lead as Lost' });
    }

    const lead = await Lead.findById(leadId).session(session);
    if (!lead) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }

    if (lead.closureStatus === 'WON' || lead.closureStatus === 'LOST') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Lead already closed' });
    }

    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');
    if (!isAdmin && lead.currentOwner?.toString() !== req.userId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden: You can only set outcome for leads assigned to you' });
    }

    lead.closureStatus = 'LOST';
    lead.status = 'LOST';
    lead.closingRemark = closingRemark;
    lead.lostReason = lostReason || 'Other';
    lead.closedBy = req.userId;
    lead.closedAt = new Date();
    lead.nextFollowUpAt = null; // A Lost lead must no longer appear as an active/upcoming/overdue follow-up
    await lead.save({ session });

    await LeadActivity.create([{
      lead: leadId, action: 'Lead Closed Lost',
      performedBy: req.userId, role: req.userRole,
      metadata: { closingRemark, lostReason: lead.lostReason }
    }], { session });

    await session.commitTransaction();
    session.endSession();

    res.json({ message: 'Lead closed as Lost', lead });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

exports.setOutcome = async (req, res, next) => {
  const outcome = (req.body.outcome || req.body.status || '').toUpperCase();
  if (outcome === 'WON') {
    return exports.closeWon(req, res, next);
  }
  if (outcome === 'LOST') {
    return exports.closeLost(req, res, next);
  }
  return res.status(400).json({ message: 'Invalid outcome: must be WON or LOST' });
};

// ============ CONTACT MANAGEMENT ============

exports.addContact = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const leadId = req.params.id;
    const { name, designation, phone, altPhone, email, setAsPrimary } = req.body;

    const lead = await Lead.findById(leadId).session(session);
    if (!lead) {
      await session.abortTransaction(); session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }
    if (req.userRole === 'AGENT' && lead.currentOwner.toString() !== req.userId) {
      await session.abortTransaction(); session.endSession();
      return res.status(403).json({ message: 'Forbidden' });
    }

    let isPrimary = !!setAsPrimary;
    if (setAsPrimary) {
      await ContactPerson.updateMany({ lead: leadId, isPrimary: true }, { isPrimary: false }, { session });
      isPrimary = true;
    } else {
      // If no primary exists, make this one primary
      const existingPrimary = await ContactPerson.findOne({ lead: leadId, isPrimary: true }).session(session);
      if (!existingPrimary) isPrimary = true;
    }

    const cp = await ContactPerson.create([{
      lead: leadId, name, designation, phone, altPhone, email,
      isPrimary, createdBy: req.userId
    }], { session });

    if (isPrimary) {
      await Lead.findByIdAndUpdate(leadId, { primaryContact: cp[0]._id }, { session });
    }

    await LeadActivity.create([{
      lead: leadId, action: 'Contact Person Added',
      performedBy: req.userId, role: req.userRole,
      metadata: { contactId: cp[0]._id.toString(), name, phone, isPrimary }
    }], { session });

    await session.commitTransaction();
    session.endSession();

    const populated = await ContactPerson.findById(cp[0]._id).lean();
    res.status(201).json({ contact: populated });
  } catch (err) {
    await session.abortTransaction(); session.endSession();
    next(err);
  }
};

exports.updateContact = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id: leadId, contactId } = req.params;
    const { name, designation, phone, altPhone, email } = req.body;

    const lead = await Lead.findById(leadId).session(session);
    if (!lead) {
      await session.abortTransaction(); session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }
    if (req.userRole === 'AGENT' && lead.currentOwner.toString() !== req.userId) {
      await session.abortTransaction(); session.endSession();
      return res.status(403).json({ message: 'Forbidden' });
    }

    const contact = await ContactPerson.findOne({ _id: contactId, lead: leadId }).session(session);
    if (!contact) {
      await session.abortTransaction(); session.endSession();
      return res.status(404).json({ message: 'Contact not found' });
    }

    if (name !== undefined) contact.name = name;
    if (designation !== undefined) contact.designation = designation;
    if (phone !== undefined) contact.phone = phone;
    if (altPhone !== undefined) contact.altPhone = altPhone;
    if (email !== undefined) contact.email = email;
    await contact.save({ session });

    await LeadActivity.create([{
      lead: leadId, action: 'Contact Person Edited',
      performedBy: req.userId, role: req.userRole,
      metadata: { contactId }
    }], { session });

    await session.commitTransaction();
    session.endSession();

    const updated = await ContactPerson.findById(contactId).lean();
    res.json({ contact: updated });
  } catch (err) {
    await session.abortTransaction(); session.endSession();
    next(err);
  }
};

exports.setPrimaryContact = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id: leadId, contactId } = req.params;

    const lead = await Lead.findById(leadId).session(session);
    if (!lead) {
      await session.abortTransaction(); session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }
    if (req.userRole === 'AGENT' && lead.currentOwner.toString() !== req.userId) {
      await session.abortTransaction(); session.endSession();
      return res.status(403).json({ message: 'Forbidden' });
    }

    const contact = await ContactPerson.findOne({ _id: contactId, lead: leadId }).session(session);
    if (!contact) {
      await session.abortTransaction(); session.endSession();
      return res.status(404).json({ message: 'Contact not found' });
    }

    // Unset all primary, set this one
    await ContactPerson.updateMany({ lead: leadId, isPrimary: true }, { isPrimary: false }, { session });
    contact.isPrimary = true;
    await contact.save({ session });

    await Lead.findByIdAndUpdate(leadId, { primaryContact: contactId }, { session });

    const oldPrimaryName = (await ContactPerson.findOne({ lead: leadId, isPrimary: false }).session(session))?.name || 'unknown';

    await LeadActivity.create([{
      lead: leadId, action: 'Primary Contact Changed',
      performedBy: req.userId, role: req.userRole,
      metadata: { newPrimary: contactId, newPrimaryName: contact.name, oldPrimaryName }
    }], { session });

    await session.commitTransaction();
    session.endSession();

    res.json({ message: 'Primary contact updated', contact });
  } catch (err) {
    await session.abortTransaction(); session.endSession();
    next(err);
  }
};

exports.listContacts = async (req, res, next) => {
  try {
    const leadId = req.params.id;
    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    if (req.userRole === 'AGENT' && lead.currentOwner.toString() !== req.userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const contacts = await ContactPerson.find({ lead: leadId }).sort({ isPrimary: -1, createdAt: -1 }).lean();
    res.json({ contacts });
  } catch (err) {
    next(err);
  }
};

exports.rescheduleFollowUp = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const leadId = req.params.id;
    const { followUpDate, followUpTime, remarks } = req.body;

    const lead = await Lead.findById(leadId).session(session);
    if (!lead) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }

    // Won/Lost leads cannot have an active pending follow-up
    if (lead.closureStatus && lead.closureStatus !== 'OPEN') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Cannot reschedule follow-up for a closed (Won/Lost) lead' });
    }

    // Permissions: Agents can only operate on their own leads; Admins can operate on any lead
    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');
    if (!isAdmin && lead.currentOwner?.toString() !== req.userId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden: You can only reschedule follow-ups for leads assigned to you' });
    }

    if (!followUpDate) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Follow-up date is required' });
    }

    // Parse date and optional time into a Date object
    let scheduledDate;
    if (typeof followUpDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(followUpDate.trim())) {
      const [y, m, d] = followUpDate.trim().split('-').map(Number);
      let hours = 10;
      let minutes = 0;
      if (followUpTime && typeof followUpTime === 'string') {
        const [th, tm] = followUpTime.trim().split(':').map(Number);
        if (!isNaN(th)) hours = th;
        if (!isNaN(tm)) minutes = tm;
      }
      scheduledDate = new Date(y, m - 1, d, hours, minutes, 0, 0);
    } else {
      scheduledDate = new Date(followUpDate);
    }

    if (isNaN(scheduledDate.getTime())) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Invalid follow-up date or time' });
    }

    const previousFollowUpAt = lead.nextFollowUpAt;
    lead.nextFollowUpAt = scheduledDate;

    if (remarks && typeof remarks === 'string' && remarks.trim()) {
      lead.latestRemark = remarks.trim();
    }
    await lead.save({ session });

    // Update existing CallLog in-place if one exists (prevents duplicate follow-ups)
    const existingCallWithFollowUp = await CallLog.findOne({
      lead: leadId,
      followUpAt: { $exists: true, $ne: null },
    }).sort({ calledAt: -1, createdAt: -1 }).session(session);

    if (existingCallWithFollowUp) {
      existingCallWithFollowUp.followUpAt = scheduledDate;
      if (remarks && typeof remarks === 'string' && remarks.trim()) {
        existingCallWithFollowUp.remark = remarks.trim();
      }
      await existingCallWithFollowUp.save({ session });
    }

    // Log activity
    await LeadActivity.create([{
      lead: leadId,
      action: 'Follow-up Rescheduled',
      performedBy: req.userId,
      role: req.userRole,
      metadata: {
        previousFollowUpAt,
        newFollowUpAt: scheduledDate,
        remarks: remarks ? remarks.trim() : '',
      },
    }], { session });

    await session.commitTransaction();
    session.endSession();

    const populated = await Lead.findById(leadId)
      .populate('currentOwner', 'fullName username email agentRole')
      .populate('createdBy', 'fullName username')
      .populate('primaryContact')
      .lean();

    res.json({
      message: 'Follow-up rescheduled successfully',
      lead: populated,
      nextFollowUpAt: populated.nextFollowUpAt,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

exports.completeFollowUp = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const leadId = req.params.id;
    const { remarks } = req.body;

    const lead = await Lead.findById(leadId).session(session);
    if (!lead) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }

    if (lead.closureStatus && lead.closureStatus !== 'OPEN') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Cannot complete follow-up for a closed (Won/Lost) lead' });
    }

    if (!lead.nextFollowUpAt) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'No active follow-up to complete' });
    }

    // Permissions: Agents can only operate on their own leads; Admins can operate on any lead
    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');
    if (!isAdmin && lead.currentOwner?.toString() !== req.userId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden: You can only complete follow-ups for leads assigned to you' });
    }

    const previousFollowUpAt = lead.nextFollowUpAt;
    lead.nextFollowUpAt = null;

    if (remarks && typeof remarks === 'string' && remarks.trim()) {
      lead.latestRemark = remarks.trim();
    }
    await lead.save({ session });

    // Log LeadActivity
    await LeadActivity.create([{
      lead: leadId,
      action: 'Follow-up Completed',
      performedBy: req.userId,
      role: req.userRole,
      metadata: {
        previousFollowUpAt,
        completedAt: new Date(),
        remarks: remarks ? remarks.trim() : '',
      },
    }], { session });

    await session.commitTransaction();
    session.endSession();

    const populated = await Lead.findById(leadId)
      .populate('currentOwner', 'fullName username email agentRole')
      .populate('createdBy', 'fullName username')
      .populate('primaryContact')
      .lean();

    res.json({
      message: 'Follow-up marked as completed',
      lead: populated,
      nextFollowUpAt: null,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

exports.reopenLead = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const leadId = req.params.id;
    const { remarks } = req.body;

    const lead = await Lead.findById(leadId).session(session);
    if (!lead) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }

    if (lead.closureStatus === 'OPEN') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Lead is already open' });
    }

    const previousStatus = lead.closureStatus;
    lead.closureStatus = 'OPEN';
    lead.status = 'OPEN';
    lead.closedBy = null;
    lead.closedAt = null;
    if (remarks && typeof remarks === 'string' && remarks.trim()) {
      lead.latestRemark = remarks.trim();
    }
    await lead.save({ session });

    await LeadActivity.create([{
      lead: leadId,
      action: 'Lead Re-engaged',
      performedBy: req.userId,
      role: req.userRole,
      metadata: {
        previousStatus,
        reopenedAt: new Date(),
        remarks: remarks ? remarks.trim() : 'Lead reopened for re-engagement',
      },
    }], { session });

    await session.commitTransaction();
    session.endSession();

    const populated = await Lead.findById(leadId)
      .populate('currentOwner', 'fullName username email agentRole')
      .populate('createdBy', 'fullName username')
      .populate('primaryContact')
      .lean();

    res.json({
      message: 'Lead successfully re-opened for re-engagement',
      lead: populated,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};